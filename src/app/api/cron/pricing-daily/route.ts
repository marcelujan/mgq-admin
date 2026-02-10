import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLER_VERSION = "pricing-daily-multibatch-mixed-2026-02-10";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

const BATCH_SIZE = Number(process.env.PRICING_BATCH_SIZE ?? 80);
const MAX_ATTEMPTS = 3;
const TIME_BUDGET_MS = 50_000;
const TIME_MARGIN_MS = 4_000;

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
  const base = attempt === 1 ? 500 : 2000;
  return base + Math.floor(Math.random() * 250);
}

async function scrapeWithMotor(motorId: number, url: string) {
  return await runMotorForPricesByPresentacion(BigInt(motorId), url);
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

  const timeLeftOk = () => Date.now() - started < TIME_BUDGET_MS - TIME_MARGIN_MS;

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

    const claimBatch = async (mode: OrderMode) => {
      const orderSql = mode === "asc" ? "i.updated_at asc, i.id asc" : "i.updated_at desc, i.id desc";

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
        [runId, MAX_ATTEMPTS, BATCH_SIZE]
      );

      await client!.query("commit;");
      txOpen = false;

      return q.rows as any[];
    };

    let processed_ok = 0;
    let processed_fail = 0;
    let inserted_rows = 0;
    let batches = 0;
    let claimed_total = 0;

    // Arrancar por DESC para priorizar “nuevo” en presencia de backlog.
    let mode: OrderMode = "desc";

    while (timeLeftOk()) {
      let batchRows = await claimBatch(mode);

      // Si no hay por este lado, probamos el otro una vez.
      if (batchRows.length === 0) {
        const other: OrderMode = mode === "asc" ? "desc" : "asc";
        batchRows = await claimBatch(other);
        if (batchRows.length === 0) break;
        mode = other;
      }

      batches++;
      claimed_total += batchRows.length;

      for (const row of batchRows) {
        if (!timeLeftOk()) break;

        const runItemId = Number(row.run_item_id);
        const itemId = Number(row.item_id);
        const motorId = row.motor_id === null ? null : Number(row.motor_id);
        const url = row.url ? String(row.url) : null;

        const presWantedRaw = row.presentacion;
        const presWanted =
          presWantedRaw === null || presWantedRaw === undefined ? null : Number(presWantedRaw);

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
          processed_fail++;
          continue;
        }

        if (presWanted === null || !Number.isFinite(presWanted)) {
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

        let lastErr: string | null = null;
        let success = false;

        for (let attempt = Number(row.attempts) + 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            await client.query(
              `update app.pricing_daily_run_items set attempts=$2, updated_at=now() where id=$1;`,
              [runItemId, attempt]
            );

            const { sourceUrl, prices } = await scrapeWithMotor(motorId, url);

            if (!Array.isArray(prices) || prices.length === 0) {
              throw new Error("no_prices_by_presentacion");
            }

            const match = prices.find((p: any) => Number(p?.presentacion) === presWanted);
            if (!match) throw new Error(`no_price_for_presentacion:${presWanted}`);

            const price = Number(match?.priceArs);
            if (!Number.isFinite(price) || price <= 0) throw new Error("invalid_price");

            await client.query(
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

            await client.query(
              `update app.pricing_daily_run_items set status='OK', last_error=null, updated_at=now() where id=$1;`,
              [runItemId]
            );

            processed_ok++;
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
          processed_fail++;
        }
      }

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
        batches,
        claimed_total,
        processed_ok,
        processed_fail,
        inserted_rows,
        pending_remaining: pendingRemaining,
        time_ms: Date.now() - started,
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