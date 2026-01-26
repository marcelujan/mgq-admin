// /pages/api/cron/pricing-daily.ts
// Next.js API Route (Vercel Cron target)
// Requiere: npm i pg
import type { NextApiRequest, NextApiResponse } from "next";
import { Pool } from "pg";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

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

/**
 * Motor para pricing-daily: devuelve precios por presentación.
 */
async function scrapeWithMotor(motorId: number, url: string): Promise<{
  sourceUrl: string;
  prices: Array<{ presentacion: number; priceArs: number; source: string }>;
}> {
  return await runMotorForPricesByPresentacion(BigInt(motorId), url);
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
      let inserted_rows = 0;

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

            const { sourceUrl, prices } = await scrapeWithMotor(motorId, url);

            if (!Array.isArray(prices) || prices.length === 0) {
              throw new Error("no_prices_by_presentacion");
            }

            // Persistir UNA FILA por presentación
            for (const p of prices) {
              if (!Number.isFinite(p.presentacion)) continue;
              if (!Number.isFinite(p.priceArs) || p.priceArs <= 0) continue;

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
                [itemId, asOfDate, p.presentacion, p.priceArs, sourceUrl, runId]
              );

              inserted_rows++;
            }

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
        inserted_rows,
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
