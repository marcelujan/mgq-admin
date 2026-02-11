import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Objetivo de este ajuste:
 * - Mantener la política "si no hay precio del día, no insertar nada".
 * - Aumentar cobertura/throughput para que el cron llegue a procesar más (idealmente todos) los offers del día.
 * - Evitar trabajo redundante: si muchos offers comparten (motor_id,url), scrapeamos 1 vez y aplicamos a N.
 * - Mejor instrumentación en respuesta.
 *
 * No cambia el contrato de tablas ya usado por este handler:
 * - app.pricing_daily_runs / app.pricing_daily_run_items
 * - app.offers
 * - app.item_price_daily_pres (item_id, as_of_date, presentacion, price_ars, source_url, scrape_run_id)
 */

const HANDLER_VERSION = "pricing-daily-grouped-scrape-2026-02-11";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

const BATCH_SIZE = Number(process.env.PRICING_BATCH_SIZE ?? 120);
const MAX_ATTEMPTS = Number(process.env.PRICING_MAX_ATTEMPTS ?? 3);
const TIME_BUDGET_MS = Number(process.env.PRICING_TIME_BUDGET_MS ?? 50_000);
const TIME_MARGIN_MS = Number(process.env.PRICING_TIME_MARGIN_MS ?? 4_000);
const CONCURRENCY = Math.max(1, Number(process.env.PRICING_CONCURRENCY ?? 6));

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

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number) {
  const base = attempt === 1 ? 400 : attempt === 2 ? 1200 : 2500;
  return base + Math.floor(Math.random() * 250);
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

type MotorScrapeResult = {
  sourceUrl: string | null;
  prices: Array<{ presentacion: number; priceArs: number }>;
};

async function scrapeWithMotor(motorId: number, url: string): Promise<MotorScrapeResult> {
  // runMotorForPricesByPresentacion devuelve { sourceUrl, prices }
  return await runMotorForPricesByPresentacion(BigInt(motorId), url);
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

type ClaimedRow = {
  run_item_id: number;
  offer_id: number;
  attempts: number;
  item_id: number;
  motor_id: number | null;
  url: string | null;
  presentacion: number | null;
};

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
  const timeLeftOk = () => timeLeftMs() > TIME_MARGIN_MS;

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
        set status = app.pricing_daily_runs.status
      returning id::text;
      `,
      [asOfDate]
    );
    const runId = Number(runQ.rows?.[0]?.id);

    await client.query(
      `update app.pricing_daily_runs set started_at = coalesce(started_at, now()) where id=$1;`,
      [runId]
    );

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

      await client!.query("begin;");
      txOpen = true;

      // IMPORTANTE:
      // - No marcamos IN_PROGRESS (no sabemos si existe ese status).
      // - Usamos SKIP LOCKED para permitir paralelismo si alguna vez corren dos invocaciones (manual).
      // - Actualizamos updated_at para evitar re-claim inmediato por el mismo orden.
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
        [runId, MAX_ATTEMPTS, BATCH_SIZE]
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

    // stats adicionales
    let scraped_groups = 0;
    let scraped_ok = 0;
    let scraped_fail = 0;
    let skipped_missing_motor_or_url = 0;
    let skipped_missing_presentacion = 0;

    // Arrancar por DESC para priorizar “nuevo” en presencia de backlog.
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

      // 1) separar inválidos rápido (motor/url/presentacion faltante)
      const valid: ClaimedRow[] = [];
      for (const row of batchRows) {
        const runItemId = Number(row.run_item_id);
        const motorId = row.motor_id === null ? null : Number(row.motor_id);
        const url = row.url ? String(row.url) : null;
        const presWantedRaw = row.presentacion;
        const presWanted =
          presWantedRaw === null || presWantedRaw === undefined ? null : Number(presWantedRaw);

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

      // 2) agrupar por (motor_id,url) para evitar scrapes duplicados
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

      // 3) scrape concurrente por grupo (y luego writes seriales en DB)
      const scrapeTasks = groupEntries.map(([key, rows]) =>
        limit(async () => {
          if (!timeLeftOk()) return;

          const motorId = Number(rows[0].motor_id);
          const url = String(rows[0].url);

          // Para que el "attempt" cuente para cada run_item, lo incrementamos por grupo antes del scrape.
          // Si el grupo reintenta, vuelve a incrementar. (equivale a "un intento" para todos esos offers)
          const runItemIds = rows.map((r) => Number(r.run_item_id));
          const currentAttempts = Math.max(...rows.map((r) => Number(r.attempts)));
          let lastErr: string | null = null;

          for (let attempt = currentAttempts + 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (!timeLeftOk()) break;

            try {
              // set attempts = attempt para todos los run_items del grupo
              await client!.query(
                `update app.pricing_daily_run_items set attempts=$2, updated_at=now() where id = any($1::bigint[]);`,
                [runItemIds, attempt]
              );

              const { sourceUrl, prices } = await scrapeWithMotor(motorId, url);

              if (!Array.isArray(prices) || prices.length === 0) {
                throw new Error("no_prices_by_presentacion");
              }

              // indexar por presentacion
              const priceByPres = new Map<number, number>();
              for (const p of prices as any[]) {
                const pres = Number(p?.presentacion);
                const price = Number(p?.priceArs);
                if (!Number.isFinite(pres)) continue;
                if (!Number.isFinite(price)) continue;
                priceByPres.set(pres, price);
              }

              if (priceByPres.size === 0) {
                throw new Error("no_valid_prices");
              }

              // aplicar a cada row del grupo
              for (const row of rows) {
                if (!timeLeftOk()) break;

                const runItemId = Number(row.run_item_id);
                const itemId = Number(row.item_id);
                const presWanted = Number(row.presentacion);

                const price = priceByPres.get(presWanted);

                if (!price || !Number.isFinite(price) || price <= 0) {
                  await client!.query(
                    `update app.pricing_daily_run_items set status='FAIL', last_error=$2, updated_at=now() where id=$1;`,
                    [runItemId, `no_or_invalid_price_for_presentacion:${presWanted}`.slice(0, 2000)]
                  );
                  processed_fail++;
                  continue;
                }

                await client!.query(
                  `
                  insert into app.item_price_daily_pres
                    (item_id, as_of_date, presentacion, price_ars, source_url, scrape_run_id)
                  values
                    ($1, $2::date, $3, $4, $5, $6)
                  on conflict (item_id, as_of_date, presentacion)
                  do update set
                    price_ars = excluded.price_ars,
                    source_url = excluded.source_url,
                    scrape_run_id = excluded.scrape_run_id;
                  `,
                  [itemId, asOfDate, presWanted, price, String(sourceUrl ?? url), runId]
                );

                inserted_rows++;

                await client!.query(
                  `update app.pricing_daily_run_items set status='OK', last_error=null, updated_at=now() where id=$1;`,
                  [runItemId]
                );

                processed_ok++;
              }

              scraped_ok++;
              return;
            } catch (e: any) {
              lastErr = String(e?.message ?? e);
              if (attempt < MAX_ATTEMPTS && timeLeftOk()) {
                await sleep(backoffMs(attempt));
              }
            }
          }

          // si llegamos acá, el grupo no pudo scrapear -> marcar FAIL para todos los que sigan PENDING
          scraped_fail++;
          const errMsg = (lastErr ?? "unknown_scrape_error").slice(0, 2000);
          await client!.query(
            `
            update app.pricing_daily_run_items
            set status='FAIL', last_error=$2, updated_at=now()
            where id = any($1::bigint[])
              and status = 'PENDING';
            `,
            [runItemIds, errMsg]
          );
          processed_fail += runItemIds.length;
        })
      );

      // Esperar fin del batch (o hasta donde llegue el time budget)
      await Promise.all(scrapeTasks);

      // Alternar extremos para evitar starvation y a la vez drenar backlog.
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

    const pendingQ = await client.query(
      `
      select count(*)::int as c
      from app.pricing_daily_run_items
      where run_id=$1 and status='PENDING' and attempts < $2;
      `,
      [runId, MAX_ATTEMPTS]
    );
    const pendingRemaining = Number(pendingQ.rows?.[0]?.c ?? 0);

    // Finaliza solo si no queda nada pendiente para hoy (bajo attempts<MAX)
    if (pendingRemaining === 0) {
      const counts = await client.query(`select fail_count from app.pricing_daily_runs where id=$1;`, [runId]);
      const failCount = Number(counts.rows?.[0]?.fail_count ?? 0);
      const finalStatus = failCount > 0 ? "PARTIAL" : "DONE";
      await client.query(`update app.pricing_daily_runs set status=$2, finished_at=now() where id=$1;`, [
        runId,
        finalStatus,
      ]);
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
        batches,
        claimed_total,
        processed_ok,
        processed_fail,
        inserted_rows,
        pending_remaining: pendingRemaining,
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