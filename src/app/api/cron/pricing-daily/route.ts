// cron/pricing-daily/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds (Vercel)

const HANDLER_VERSION = "pricing-daily-grouped-scrape-bulkdb-2026-02-12";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

const BATCH_SIZE = Number(process.env.PRICING_BATCH_SIZE ?? 120);
const MAX_ATTEMPTS = Number(process.env.PRICING_MAX_ATTEMPTS ?? 3);
const TIME_BUDGET_MS = Number(process.env.PRICING_TIME_BUDGET_MS ?? 55_000);
const TIME_MARGIN_MS = Number(process.env.PRICING_TIME_MARGIN_MS ?? 8_000);
// Reservar tiempo mínimo para disparar encadenamiento verificable (evita fire-and-forget al filo)
const CHAIN_RESERVE_MS = Number(process.env.PRICING_CHAIN_RESERVE_MS ?? 4_000);
// Timeout máximo para el fetch de encadenamiento (ms). Debe ser <= CHAIN_RESERVE_MS - margen.
const CHAIN_FETCH_TIMEOUT_MS = Number(process.env.PRICING_CHAIN_FETCH_TIMEOUT_MS ?? 3_500);
const CONCURRENCY = Math.max(1, Number(process.env.PRICING_CONCURRENCY ?? 8));

// Continuations (para plan Hobby: 1 cron/día, múltiples invocaciones encadenadas)
const CHAIN_MAX = Number(process.env.PRICING_CHAIN_MAX ?? 12);
const CHAIN_HEADER = "x-pricing-chain";

// En Vercel Hobby, el self-chain puede disparar 508 (loop detected). Permite desactivarlo y usar un scheduler externo.
const DISABLE_SELF_CHAIN = String(process.env.PRICING_DISABLE_SELF_CHAIN ?? "0") === "1";

// Orquestación opcional: disparar manual/formulado cuando pricing termina (pending=0)
const TRIGGER_COSTS_AFTER_PRICING = String(process.env.PRICING_TRIGGER_COSTS ?? "1") === "1";

type OrderMode = "asc" | "desc";

function assertCronAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    const err: any = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

function errJson(e: any) {
  return {
    message: String(e?.message ?? e ?? "unknown_error"),
    code: e?.code ? String(e.code) : null,
    detail: e?.detail ? String(e.detail) : null,
    hint: e?.hint ? String(e.hint) : null,
    where: e?.where ? String(e.where) : null,
  };
}

async function appendRunLastError(client: PoolClient, runId: number, line: string) {
  // Persistir evidencia del chain sin depender de logs del runtime.
  // Truncar a 4000 para evitar crecimiento sin control.
  const payload = `${line}\n`;
  await client.query(
    `
    update app.pricing_daily_runs
    set last_error = substring(coalesce(last_error, '') || $2 from 1 for 4000)
    where id = $1;
    `,
    [runId, payload]
  );
}


type MotorScrapeResult = {
  sourceUrl: string | null;
  prices: Array<{ presentacion: number; priceArs: number }>;
};

async function scrapeWithMotor(motorId: number, url: string, timeoutMs: number): Promise<MotorScrapeResult> {
  return await runMotorForPricesByPresentacion(BigInt(motorId), url, { timeoutMs });
}

function pLimit(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    activeCount--;
    const fn = queue.shift();
    if (fn) fn();
  };

  return async function <T>(fn: () => Promise<T>): Promise<T> {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    activeCount++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type ClaimedRow = {
  run_item_id: number;
  offer_id: number;
  attempts: number;
  item_id: number;
  motor_id: number | null;
  url: string | null;
  presentacion: number | null;
};

type GroupScrapeOut =
  | {
      key: string;
      ok: true;
      motorId: number;
      url: string;
      sourceUrl: string;
      priceByPres: Map<number, number>;
    }
  | { key: string; ok: false; motorId: number; url: string; error: string };

async function fireAndForgetFetch(url: string, headers: Record<string, string>) {
  // En Vercel puede haber cold start / TLS / routing. 3.5s suele ser poco.
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);

  try {
    await fetch(url, {
      method: "POST",
      headers,
      cache: "no-store",
      signal: ac.signal,
      // @ ts-expect-error keepalive es válido en fetch web
      keepalive: true,
    });
  } catch (e: any) {
    // Log mínimo para diagnóstico (no rompe el run principal)
    console.error("fireAndForgetFetch failed:", String(e?.message ?? e));
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  let client: PoolClient | null = null;
  let txOpen = false;

  const safeRollback = async () => {
    if (!client || !txOpen) return;
    try {
      await client.query("rollback;");
    } catch {
      // ignore
    } finally {
      txOpen = false;
    }
  };

  const timeLeftMs = () => TIME_BUDGET_MS - (Date.now() - started);
  const timeLeftOk = () => timeLeftMs() > (TIME_MARGIN_MS + CHAIN_RESERVE_MS);

  // chain index actual
  const chain = Number(req.headers.get(CHAIN_HEADER) ?? "0");

  try {
    assertCronAuth(req);

    client = await pool.connect();

    const d0 = await client.query(`select current_date::text as d;`);
    const asOfDate = String(d0.rows?.[0]?.d);

    const runQ = await client.query(
      `
      insert into app.pricing_daily_runs (as_of_date, status)
      values ($1::date, 'RUNNING')
      on conflict (as_of_date) do update
        set status = 'RUNNING',
            finished_at = null
      returning id::text;
      `,
      [asOfDate]
    );
    const runId = Number(runQ.rows?.[0]?.id);

    await client.query(`update app.pricing_daily_runs set started_at = coalesce(started_at, now()) where id=$1;`, [
      runId,
    ]);

    await client.query(
      `
      insert into app.pricing_daily_run_items (run_id, offer_id, status)
      select $1, o.offer_id, 'PENDING'
      from app.offers o
      where o.estado = 'OK'
      on conflict (run_id, offer_id) do nothing;
      `,
      [runId]
    );


    // Normalización: no dejar PENDING cuando se agotaron intentos (evita PEND infinito en Items)
    await client.query(
      `
      update app.pricing_daily_run_items
      set status='FAIL',
          last_error = coalesce(nullif(last_error,''), 'max_attempts_exhausted'),
          updated_at=now()
      where run_id=$1
        and status='PENDING'
        and attempts >= $2;
      `,
      [runId, MAX_ATTEMPTS]
    );

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

    const claimBatch = async (mode: OrderMode): Promise<ClaimedRow[]> => {
      const orderSql = mode === "asc" ? "i.updated_at asc nulls first, i.id asc" : "i.updated_at desc nulls last, i.id desc";

      const effectiveLimit = Math.max(1, Math.min(BATCH_SIZE, Math.floor((timeLeftMs() - TIME_MARGIN_MS) / 4000) * CONCURRENCY));

      await client!.query("begin;");
      txOpen = true;

      const q = await client!.query(
        `
        with picked as (
          select i.id
          from app.pricing_daily_run_items i
          join app.offers o on o.offer_id = i.offer_id
          where i.run_id = $1
            and i.status = 'PENDING'
            and i.attempts < $2
            and o.estado = 'OK'
          order by ${orderSql}
          limit $3
          for update skip locked
        ),
        upd as (
          update app.pricing_daily_run_items i
          set updated_at = now()
          from picked
          where i.id = picked.id
          returning i.id as run_item_id, i.offer_id, i.attempts
        )
        select
          u.run_item_id,
          u.offer_id,
          u.attempts,
          o.item_id,
          o.motor_id,
          coalesce(nullif(o.url_canonica,''), o.url_original) as url,
          o.presentacion
        from upd u
        join app.offers o on o.offer_id = u.offer_id;
        `,
        [runId, MAX_ATTEMPTS, effectiveLimit]
      );

      await client!.query("commit;");
      txOpen = false;

      return q.rows as ClaimedRow[];
    };

    const limit = pLimit(CONCURRENCY);

    let processed_ok = 0;
    let processed_fail = 0;
    let inserted_rows = 0;
    let batches = 0;
    let claimed_total = 0;

    let scraped_groups = 0;
    let scraped_ok = 0;
    let scraped_fail = 0;
    let skipped_missing_motor_or_url = 0;
    let skipped_missing_presentacion = 0;

    let mode: OrderMode = "desc";

    while (timeLeftOk()) {
      let batchRows = await claimBatch(mode);

      if (batchRows.length === 0) {
        const other: OrderMode = mode === "asc" ? "desc" : "asc";
        batchRows = await claimBatch(other);
        if (batchRows.length === 0) break;
        mode = other;
      }

      batches++;
      claimed_total += batchRows.length;

      const valid: ClaimedRow[] = [];
      for (const row of batchRows) {
        const runItemId = Number(row.run_item_id);
        const motorId = row.motor_id === null ? null : Number(row.motor_id);
        const url = row.url ? String(row.url) : null;
        const presWantedRaw = row.presentacion;
        const presWanted = presWantedRaw === null || presWantedRaw === undefined ? null : Number(presWantedRaw);

        if (!motorId || !url) {
          skipped_missing_motor_or_url++;
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
          processed_fail++;
          continue;
        }

        if (presWanted === null || !Number.isFinite(presWanted)) {
          skipped_missing_presentacion++;
          await client.query(
            `
            update app.pricing_daily_run_items
            set status='FAIL',
                last_error=$2,
                updated_at=now(),
                attempts = greatest(attempts, $3)
            where id=$1;
            `,
            [runItemId, `offer_presentacion_missing(offer_id=${row.offer_id})`, MAX_ATTEMPTS]
          );
          processed_fail++;
          continue;
        }

        valid.push(row);
      }

      if (!timeLeftOk()) break;
      if (valid.length === 0) {
        mode = mode === "asc" ? "desc" : "asc";
        continue;
      }

      const allRunItemIds = valid.map((v) => Number(v.run_item_id));
      await client.query(
        `
        update app.pricing_daily_run_items
        set attempts = attempts + 1,
            updated_at = now()
        where id = any($1::bigint[])
          and status = 'PENDING'
          and attempts < $2;
        `,
        [allRunItemIds, MAX_ATTEMPTS]
      );

      if (!timeLeftOk()) break;

      const groups = new Map<string, ClaimedRow[]>();
      for (const row of valid) {
        const motorId = Number(row.motor_id);
        const url = String(row.url);
        const key = `${motorId}::${url}`;
        const arr = groups.get(key) ?? [];
        arr.push(row);
        groups.set(key, arr);
      }

      const groupEntries = Array.from(groups.entries());
      scraped_groups += groupEntries.length;

      const scrapeTasks = groupEntries.map(([key, rows]) =>
        limit(async (): Promise<GroupScrapeOut | null> => {
          if (!timeLeftOk()) return null;

          const motorId = Number(rows[0].motor_id);
          const url = String(rows[0].url);

          try {
            const timeoutMs = Math.max(1_000, Math.min(15_000, timeLeftMs() - TIME_MARGIN_MS));
            if (timeoutMs <= 1_000) throw new Error('time_budget_exhausted');

            const { sourceUrl, prices } = await scrapeWithMotor(motorId, url, timeoutMs);

            if (!Array.isArray(prices) || prices.length === 0) {
              throw new Error("no_prices_by_presentacion");
            }

            const priceByPres = new Map<number, number>();
            for (const p of prices as any[]) {
              const pres = Number(p?.presentacion);
              const price = Number(p?.priceArs);
              if (Number.isFinite(pres) && Number.isFinite(price) && price > 0) {
                priceByPres.set(pres, price);
              }
            }

            if (priceByPres.size === 0) throw new Error("no_valid_prices");

            return {
              key,
              ok: true,
              motorId,
              url,
              sourceUrl: String(sourceUrl ?? url),
              priceByPres,
            };
          } catch (e: any) {
            return {
              key,
              ok: false,
              motorId,
              url,
              error: String(e?.message ?? e).slice(0, 2000),
            };
          }
        })
      );

      const groupResults = (await Promise.all(scrapeTasks)).filter(Boolean) as GroupScrapeOut[];

      const okInserts: Array<[number, string, number, number, string, number]> = [];
      const okRunItemIds: number[] = [];
      const failRunItems: Array<[number, string]> = [];

      for (const gr of groupResults) {
        const rows = groups.get(gr.key) ?? [];

        if (!gr.ok) {
          scraped_fail++;
          for (const row of rows) {
            failRunItems.push([Number(row.run_item_id), gr.error]);
          }
          continue;
        }

        scraped_ok++;

        for (const row of rows) {
          if (!timeLeftOk()) break;

          const presWanted = Number(row.presentacion);
          const price = gr.priceByPres.get(presWanted);

          if (!price || !Number.isFinite(price) || price <= 0) {
            failRunItems.push([Number(row.run_item_id), `no_or_invalid_price_for_presentacion:${presWanted}`]);
            continue;
          }

          okInserts.push([Number(row.item_id), asOfDate, presWanted, price, gr.sourceUrl, runId]);
          okRunItemIds.push(Number(row.run_item_id));
        }
      }

      for (const part of chunkArray(okInserts, 300)) {
        if (!timeLeftOk()) break;
        if (part.length === 0) continue;

        const valuesSql = part
          .map((_, i) => {
            const b = i * 6;
            return `($${b + 1}, $${b + 2}::date, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
          })
          .join(",");

        const flat = part.flat();

        await client.query(
          `
          insert into app.item_price_daily_pres
            (item_id, as_of_date, presentacion, price_ars, source_url, scrape_run_id)
          values ${valuesSql}
          on conflict (item_id, as_of_date, presentacion)
          do update set
            price_ars = excluded.price_ars,
            source_url = excluded.source_url,
            scrape_run_id = excluded.scrape_run_id;
          `,
          flat
        );
      }

      inserted_rows += okInserts.length;

      for (const part of chunkArray(okRunItemIds, 1000)) {
        if (!timeLeftOk()) break;
        if (part.length === 0) continue;

        await client.query(
          `
          update app.pricing_daily_run_items
          set status='OK', last_error=null, updated_at=now()
          where id = any($1::bigint[]);
          `,
          [part]
        );
      }

      for (const part of chunkArray(failRunItems, 300)) {
        if (!timeLeftOk()) break;
        if (part.length === 0) continue;

        const valuesSql = part.map((_, i) => `($${i * 2 + 1}::bigint, $${i * 2 + 2})`).join(",");
        const flat = part.flat();

        await client.query(
          `
          with v(id, err) as (values ${valuesSql})
          update app.pricing_daily_run_items i
          set status='FAIL',
              last_error = left(v.err, 2000),
              updated_at=now()
          from v
          where i.id = v.id;
          `,
          flat
        );
      }

      processed_ok += okRunItemIds.length;
      processed_fail += failRunItems.length;

      mode = mode === "asc" ? "desc" : "asc";
    }

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

    const finalCounts = await client.query(
      `
      select
        (select count(*)::int from app.pricing_daily_run_items where run_id=$1 and status='PENDING' and attempts < $2) as pending,
        (select count(*)::int from app.pricing_daily_run_items where run_id=$1 and status='FAIL') as fail;
      `,
      [runId, MAX_ATTEMPTS]
    );

    const pendingRemaining = Number(finalCounts.rows?.[0]?.pending ?? 0);
    const failCount = Number(finalCounts.rows?.[0]?.fail ?? 0);

    const finalStatus = pendingRemaining === 0 && failCount === 0 ? "DONE" : "PARTIAL";
    await client.query(`update app.pricing_daily_runs set status=$2, finished_at=now() where id=$1;`, [
      runId,
      finalStatus,
    ]);

    // ---- Continuation / Orchestration (no bloquea el resultado principal) ----
    // Usar el origin real del request evita mismatch de dominios/branches.
    const selfBase = req.nextUrl.origin;
    const cronSecret = process.env.CRON_SECRET;

    
// 1) Si quedan pendientes, encadenar otra invocación (hasta CHAIN_MAX)
// Si self-chain está deshabilitado, dejar evidencia verificable y salir.
if (pendingRemaining > 0 && DISABLE_SELF_CHAIN) {
  try {
    await appendRunLastError(
      client,
      runId,
      `[chain] disabled pending=${pendingRemaining} ts=${new Date().toISOString()}`
    );
  } catch {
    // ignore
  }
}

if (pendingRemaining > 0 && !DISABLE_SELF_CHAIN && selfBase && cronSecret && chain < CHAIN_MAX) {
  const nextChain = chain + 1;
  const url = `${selfBase}/api/cron/pricing-daily`;

  // Registrar intento de chain en DB (verificable).
  // Nota: esto ocurre después de marcar status/finalizar el run; NO cambia idempotencia del pricing.
  try {
    await appendRunLastError(
      client,
      runId,
      `[chain] attempt=${nextChain} mode=pending url=${url} pending=${pendingRemaining} ts=${new Date().toISOString()}`
    );
  } catch {
    // no bloquear por diagnóstico
  }

  // Preferir await con timeout corto siempre que haya margen suficiente.
  // El "fire-and-forget" en serverless es frágil si el proceso termina al instante.
  const left = timeLeftMs();
  const canAwait = left > 900;
  if (canAwait) {
    // Si el timeout es demasiado bajo, la continuation suele abortar (cold start / red / TLS).
    // Elegimos un timeout dinámico, acotado por CHAIN_FETCH_TIMEOUT_MS y por el tiempo restante.
    const timeout = Math.min(
      CHAIN_FETCH_TIMEOUT_MS,
      Math.max(900, left - 600)
    );
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          [CHAIN_HEADER]: String(nextChain),
        },
        cache: "no-store",
        signal: ac.signal,
      });
      try {
        await appendRunLastError(
          client,
          runId,
          `[chain] attempt=${nextChain} mode=await ok=${res.ok} status=${res.status} timeout_ms=${timeout} ts=${new Date().toISOString()}`
        );
      } catch {
        // ignore
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      try {
        await appendRunLastError(
          client,
          runId,
          `[chain] attempt=${nextChain} mode=await error=${msg} timeout_ms=${timeout} ts=${new Date().toISOString()}`
        );
      } catch {
        // ignore
      }
      // Fallback best-effort (último recurso)
      void fireAndForgetFetch(url, {
        Authorization: `Bearer ${cronSecret}`,
        [CHAIN_HEADER]: String(nextChain),
      });
    } finally {
      clearTimeout(t);
    }
  } else {
    // Último recurso: no hay margen ni para un await corto.
    try {
      await appendRunLastError(
        client,
        runId,
        `[chain] attempt=${nextChain} mode=fire pending=${pendingRemaining} ts=${new Date().toISOString()}`
      );
    } catch {
      // ignore
    }
    void fireAndForgetFetch(url, {
      Authorization: `Bearer ${cronSecret}`,
      [CHAIN_HEADER]: String(nextChain),
    });
  }
}

    // 2) Si ya no quedan pendientes, disparar snapshots de costos (idempotentes), disparar snapshots de costos (idempotentes)
    if (
      TRIGGER_COSTS_AFTER_PRICING &&
      pendingRemaining === 0 &&
      selfBase &&
      cronSecret &&
      // Evitar dispararlos en cada salto del chain: solo en el primero que completa.
      chain <= CHAIN_MAX
    ) {
      if (timeLeftMs() > 1500) {
        void fireAndForgetFetch(`${selfBase}/api/cron/manual-costs-daily`, {
          Authorization: `Bearer ${cronSecret}`,
        });
        void fireAndForgetFetch(`${selfBase}/api/cron/formulado-costs-daily`, {
          Authorization: `Bearer ${cronSecret}`,
        });
      }
    }

    return NextResponse.json(
      {
        handler_version: HANDLER_VERSION,
        run_id: runId,
        date: asOfDate,
        batch_size: BATCH_SIZE,
        concurrency: CONCURRENCY,
        max_attempts: MAX_ATTEMPTS,
        time_budget_ms: TIME_BUDGET_MS,
        time_margin_ms: TIME_MARGIN_MS,
        chain,
        chain_max: CHAIN_MAX,
        batches,
        claimed_total,
        processed_ok,
        processed_fail,
        inserted_rows,
        pending_remaining: pendingRemaining,
        chain_disabled: DISABLE_SELF_CHAIN,
        should_continue: pendingRemaining > 0,
        scrape: {
          groups: scraped_groups,
          ok: scraped_ok,
          fail: scraped_fail,
        },
        skipped: {
          missing_motor_or_url: skipped_missing_motor_or_url,
          missing_presentacion: skipped_missing_presentacion,
        },
        time_ms: Date.now() - started,
        time_left_ms: Math.max(0, timeLeftMs()),
      },
      { status: 200 }
    );
  } catch (e: any) {
    await safeRollback();
    console.error("pricing-daily error", e);
    const info = errJson(e);
    return NextResponse.json({ error: info.message, pg: info }, { status: Number(e?.statusCode ?? 500) });
  } finally {
    try {
      client?.release();
    } catch {
      // ignore
    }
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}