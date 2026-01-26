// /pages/api/cron/pricing-daily.ts
// Next.js API Route (Vercel Cron target)
// Requiere: npm i pg
import type { NextApiRequest, NextApiResponse } from "next";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Neon/Vercel env
  max: 1, // serverless-friendly
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

const BATCH_SIZE = Number(process.env.PRICING_BATCH_SIZE ?? 80);
const MAX_ATTEMPTS = 3; // 1 intento + 2 reintentos
const TIME_BUDGET_MS = 50_000;

function assertCronAuth(req: NextApiRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    const err: any = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number) {
  // after first failure: ~500ms, after second: ~2000ms (+ jitter)
  const base = attempt === 1 ? 500 : 2000;
  return base + Math.floor(Math.random() * 250);
}

/* -----------------------------
   Scraping helpers (reusados del run-next)
------------------------------ */

function decodeHtmlEntities(s: string): string {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Parse num ARS robusto: "1.234,56" / "1,234.56" / "1234" / "$ 12.345"
 */
function parseArsNumber(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const cleaned = s.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized = cleaned;

  if (lastComma !== -1 && lastDot !== -1) {
    // tomar el último separador como decimal
    const decPos = Math.max(lastComma, lastDot);
    const intPart = cleaned.slice(0, decPos).replace(/[.,]/g, "");
    const decPart = cleaned.slice(decPos + 1).replace(/[.,]/g, "");
    normalized = `${intPart}.${decPart}`;
  } else if (lastComma !== -1) {
    // solo coma => coma decimal
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // solo punto o ninguno
    normalized = cleaned.replace(/,/g, "");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Precio ARS por presentación (clave = valor numérico de "pa_presentacion", ej 1.0000, 5.0000).
 * Fuente principal: WooCommerce product variations embebidas (data-product_variations o JS).
 */
function parsePrecioArsByPresentacionFromHtml(
  html: string
): Map<number, { precio_ars: number; source: string }> {
  const byPres = new Map<number, { precio_ars: number; source: string }>();

  const maybeAdd = (presRaw: any, priceRaw: any, source: string) => {
    const presNum = presRaw === null || presRaw === undefined ? null : Number(presRaw);
    if (presNum === null || !Number.isFinite(presNum)) return;

    const priceNum =
      priceRaw === null || priceRaw === undefined
        ? null
        : typeof priceRaw === "number"
        ? priceRaw
        : parseArsNumber(String(priceRaw));

    if (priceNum === null || !Number.isFinite(priceNum)) return;

    byPres.set(presNum, { precio_ars: Number(priceNum), source });
  };

  // 1) WooCommerce: data-product_variations="[...]"
  const attrRe = /data-product_variations\s*=\s*(?:"([^"]+)"|'([^']+)')/i;
  const mAttr = html.match(attrRe);
  if (mAttr) {
    const raw = mAttr[1] ?? mAttr[2] ?? "";
    const decoded = decodeHtmlEntities(raw);
    try {
      const arr = JSON.parse(decoded);
      if (Array.isArray(arr)) {
        for (const v of arr) {
          const attrs = v?.attributes ?? {};
          const presKey =
            attrs?.attribute_pa_presentacion ?? attrs?.pa_presentacion ?? attrs?.presentacion ?? null;

          const presVal = presKey === null || presKey === undefined ? null : parseFloat(String(presKey));

          const priceCandidate =
            v?.display_price ??
            v?.display_regular_price ??
            v?.variation_display_price ??
            v?.variation_price ??
            null;

          maybeAdd(presVal, priceCandidate, "wc:data-product_variations.display_price");
        }
      }
    } catch {
      // ignore
    }
  }

  // 2) Fallback: JS inline "product_variations = [...]"
  if (byPres.size === 0) {
    const jsRe = /product_variations\s*=\s*(\[[\s\S]*?\])\s*;?/i;
    const mJs = html.match(jsRe);
    if (mJs?.[1]) {
      try {
        const arr = JSON.parse(mJs[1]);
        if (Array.isArray(arr)) {
          for (const v of arr) {
            const attrs = v?.attributes ?? {};
            const presKey =
              attrs?.attribute_pa_presentacion ?? attrs?.pa_presentacion ?? attrs?.presentacion ?? null;

            const presVal = presKey === null || presKey === undefined ? null : parseFloat(String(presKey));

            const priceCandidate =
              v?.display_price ??
              v?.display_regular_price ??
              v?.variation_display_price ??
              v?.variation_price ??
              null;

            maybeAdd(presVal, priceCandidate, "wc:js.product_variations.display_price");
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return byPres;
}

/**
 * Heurística: si hay múltiples presentaciones, para el histórico diario guardamos
 * el mínimo precio ARS observado (mejor oferta). Si hay una sola, esa.
 */
function pickDailyPriceFromMap(byPres: Map<number, { precio_ars: number; source: string }>): number | null {
  if (byPres.size === 0) return null;
  let best: number | null = null;
  for (const v of byPres.values()) {
    const p = v?.precio_ars;
    if (!Number.isFinite(p) || p <= 0) continue;
    if (best === null || p < best) best = p;
  }
  return best;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "MGqBot/1.0 (+https://vercel.app)",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`fetch_failed_http_${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Implementación de motor para pricing-daily.
 * Hoy, según tu run-next, el único motor real implementado es motor_id=1 (PuraQuímica / WooCommerce).
 */
async function scrapeWithMotor(
  motorId: number,
  url: string
): Promise<{ priceArs: number; sourceUrl: string }> {
  if (motorId !== 1) {
    throw new Error(`motor_not_implemented:${motorId}`);
  }

  const html = await fetchHtml(url);
  const byPres = parsePrecioArsByPresentacionFromHtml(html);
  const priceArs = pickDailyPriceFromMap(byPres);

  if (priceArs === null) {
    throw new Error("price_not_found");
  }

  return { priceArs, sourceUrl: url };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const started = Date.now();

  try {
    assertCronAuth(req);

    const client = await pool.connect();
    try {
      // 1) Obtener fecha "as_of_date" desde DB (evita problemas de TZ)
      const d0 = await client.query<{ d: string }>(`select current_date::text as d;`);
      const asOfDate = d0.rows[0].d;

      // 2) Crear/obtener run del día
      const runQ = await client.query<{ id: string }>(
        `
        insert into app.pricing_daily_runs (as_of_date, status)
        values ($1::date, 'RUNNING')
        on conflict (as_of_date) do update set status = app.pricing_daily_runs.status
        returning id::text;
        `,
        [asOfDate]
      );
      const runId = Number(runQ.rows[0].id);

      // 3) Seed: crear items PENDING para todos los seleccionados (watchlist)
      await client.query(
        `
        insert into app.pricing_daily_run_items (run_id, item_id, status)
        select $1, s.item_id, 'PENDING'
        from app.item_seguimiento s
        where s.seleccionado = true
        on conflict (run_id, item_id) do nothing;
        `,
        [runId]
      );

      // 4) Contadores base del run
      await client.query(
        `
        update app.pricing_daily_runs r
        set total_items = (
          select count(*) from app.pricing_daily_run_items i where i.run_id = r.id
        )
        where r.id = $1;
        `,
        [runId]
      );

      // 5) Tomar lote PENDING con lock (evita doble proceso concurrente)
      // Nota: FOR UPDATE SKIP LOCKED requiere transacción.
      await client.query("begin;");

      const batch = await client.query<{
        run_item_id: number;
        item_id: number;
        attempts: number;
        motor_id: number | null;
        url: string | null;
      }>(
        `
        select
          i.id as run_item_id,
          i.item_id,
          i.attempts,
          s.motor_id,
          coalesce(nullif(s.url_canonica,''), s.url_original) as url
        from app.pricing_daily_run_items i
        join app.item_seguimiento s on s.item_id = i.item_id
        where i.run_id = $1
          and i.status = 'PENDING'
          and i.attempts < $2
          and s.seleccionado = true
        order by i.updated_at asc, i.id asc
        limit $3
        for update skip locked;
        `,
        [runId, MAX_ATTEMPTS, BATCH_SIZE]
      );

      await client.query("commit;");

      let ok = 0;
      let fail = 0;

      for (const row of batch.rows) {
        if (Date.now() - started > TIME_BUDGET_MS) break;

        const runItemId = row.run_item_id;
        const itemId = row.item_id;
        const motorId = row.motor_id;
        const url = row.url;

        if (!motorId || !url) {
          await client.query(
            `
            update app.pricing_daily_run_items
            set status='FAIL',
                last_error=$2,
                updated_at=now(),
                attempts = greatest(attempts, $3)
            where id=$1;
            `,
            [runItemId, `missing_motor_or_url(motor_id=${motorId},url=${url})`, MAX_ATTEMPTS]
          );
          fail++;
          continue;
        }

        let lastErr: string | null = null;
        let success = false;

        for (let attempt = row.attempts + 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            // registrar intento
            await client.query(
              `update app.pricing_daily_run_items set attempts=$2, updated_at=now() where id=$1;`,
              [runItemId, attempt]
            );

            const { priceArs, sourceUrl } = await scrapeWithMotor(motorId, url);

            if (!Number.isFinite(priceArs) || priceArs <= 0) {
              throw new Error("invalid_price");
            }

            // upsert snapshot diario
            await client.query(
              `
              insert into app.item_price_daily (item_id, price_ars, source_url, as_of_date, scrape_run_id)
              values ($1, $2, $3, $4::date, $5)
              on conflict (item_id, as_of_date)
              do update set
                price_ars = excluded.price_ars,
                source_url = excluded.source_url,
                scrape_run_id = excluded.scrape_run_id;
              `,
              [itemId, priceArs, sourceUrl, asOfDate, runId]
            );

            // marcar OK
            await client.query(
              `update app.pricing_daily_run_items set status='OK', last_error=null, updated_at=now() where id=$1;`,
              [runItemId]
            );

            ok++;
            success = true;
            break;
          } catch (e: any) {
            lastErr = String(e?.message ?? e);
            if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt));
          }
        }

        if (!success) {
          await client.query(
            `update app.pricing_daily_run_items set status='FAIL', last_error=$2, updated_at=now() where id=$1;`,
            [runItemId, (lastErr ?? "unknown_error").slice(0, 2000)]
          );
          fail++;
        }
      }

      // 6) Recalcular contadores del run y status final
      await client.query(
        `
        update app.pricing_daily_runs r
        set
          ok_count = (select count(*) from app.pricing_daily_run_items i where i.run_id=r.id and i.status='OK'),
          fail_count = (select count(*) from app.pricing_daily_run_items i where i.run_id=r.id and i.status='FAIL'),
          pending_count = (select count(*) from app.pricing_daily_run_items i where i.run_id=r.id and i.status='PENDING' and i.attempts < $2)
        where r.id=$1;
        `,
        [runId, MAX_ATTEMPTS]
      );

      const pendingQ = await client.query<{ c: number }>(
        `select count(*)::int as c from app.pricing_daily_run_items where run_id=$1 and status='PENDING' and attempts < $2;`,
        [runId, MAX_ATTEMPTS]
      );
      const pendingRemaining = pendingQ.rows[0].c;

      if (pendingRemaining === 0) {
        const counts = await client.query<{ fail_count: number }>(
          `select fail_count from app.pricing_daily_runs where id=$1;`,
          [runId]
        );
        const finalStatus = counts.rows[0].fail_count > 0 ? "PARTIAL" : "DONE";
        await client.query(
          `update app.pricing_daily_runs set status=$2, finished_at=now() where id=$1;`,
          [runId, finalStatus]
        );
      }

      res.status(200).json({
        run_id: runId,
        date: asOfDate,
        batch_size: batch.rows.length,
        processed_ok: ok,
        processed_fail: fail,
        pending_remaining: pendingRemaining,
        time_ms: Date.now() - started,
      });
    } finally {
      client.release();
    }
  } catch (e: any) {
    res.status(e?.statusCode ?? 500).json({ error: String(e?.message ?? e) });
  }
}
