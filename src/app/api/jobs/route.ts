import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get("estado");
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10) || 200, 500);

    const sql = db();

    const rows = await sql`
      SELECT
        job_id, tipo, estado, prioridad,
        proveedor_id, item_id, corrida_id,
        payload, attempts, max_attempts, next_run_at,
        locked_by, locked_until, last_error,
        created_at, started_at, finished_at, updated_at
      FROM app.job
      WHERE (${estado}::text IS NULL OR estado = ${estado}::app.job_estado)
      ORDER BY job_id DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({ ok: true, jobs: rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error listando jobs" }, { status: 500 });
  }
}
