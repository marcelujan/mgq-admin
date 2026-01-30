import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const runIdParam = searchParams.get("run_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10) || 500, 2000);

    const sql = db();

    // List recent runs for a selector (latest first)
    const runs = await sql`
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
    `;

    const selectedRunId =
      runIdParam ? Number(runIdParam) : (runs?.[0]?.id ? Number(runs[0].id) : null);

    if (!selectedRunId || !Number.isFinite(selectedRunId)) {
      return NextResponse.json({ ok: true, runs: runs ?? [], run: null, rows: [] });
    }

    const run = runs.find((x: any) => Number(x.id) === Number(selectedRunId)) ?? null;

    const rows = await sql`
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
        o.url_original,
        o.url_canonica,

        iseg.proveedor_id,
        p.proveedor_codigo,
        p.proveedor_nombre,

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
      WHERE ri.run_id = ${selectedRunId}
      ORDER BY ri.updated_at DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({ ok: true, runs, run, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown_error" },
      { status: 500 }
    );
  }
}
