import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

function normalizeRows<T = any>(res: any): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res as T[];
  if (Array.isArray(res.rows)) return res.rows as T[];
  return [];
}

export async function GET(req: Request) {
  try {
    const sql = db();
    const url = new URL(req.url);
    const runIdParam = url.searchParams.get("run_id");

    // 1) últimos runs
    const runsRes = await sql.query(`
      SELECT
        r.id,
        r.as_of_date,
        r.status::text AS status,
        r.started_at,
        r.finished_at,
        r.total_items,
        r.ok_count,
        r.fail_count,
        r.skipped_count,
        r.pending_count
      FROM app.pricing_daily_runs r
      ORDER BY r.started_at DESC
      LIMIT 50
    `);

    const runs = normalizeRows<any>(runsRes);

    const selectedRunId =
      runIdParam !== null && runIdParam !== ""
        ? Number(runIdParam)
        : runs.length > 0 && runs[0]?.id != null
          ? Number(runs[0].id)
          : null;

    if (!selectedRunId || !Number.isFinite(selectedRunId)) {
      return NextResponse.json({ ok: true, runs, run: null, rows: [] });
    }

    const run = runs.find((x: any) => Number(x?.id) === Number(selectedRunId)) ?? null;

    // 2) filas por offer del run
    const rowsRes = await sql.query(
      `
      SELECT
        ri.run_id,
        ri.offer_id,
        ri.status::text AS cron_status,
        ri.attempts,
        ri.last_error,
        ri.updated_at AS processed_at,

        o.item_id,
        o.motor_id,
        o.presentacion,
        o.url_canonica,
        o.url_original,

        iseg.proveedor_id,
        p.proveedor_codigo,

        EXISTS (
          SELECT 1
          FROM app.offer_prices_daily opd
          WHERE opd.offer_id = ri.offer_id
            AND opd.as_of_date = (ri.updated_at::date)
        ) AS actualizado
      FROM app.pricing_daily_run_items ri
      JOIN app.offers o
        ON o.offer_id = ri.offer_id
      LEFT JOIN app.item_seguimiento iseg
        ON iseg.item_id = o.item_id
      LEFT JOIN app.proveedor p
        ON p.proveedor_id = iseg.proveedor_id
      WHERE ri.run_id = $1
      ORDER BY ri.updated_at DESC, ri.offer_id DESC
      `,
      [selectedRunId]
    );

    const rows = normalizeRows<any>(rowsRes);

    return NextResponse.json({ ok: true, runs, run, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "jobs_diario_error" },
      { status: 500 }
    );
  }
}
