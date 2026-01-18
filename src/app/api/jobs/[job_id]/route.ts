import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const jobId = BigInt(job_id);

    const sql = db();

    // OJO: no selecciono motor_id desde app.job porque en tu DB te dio "no existe".
    // El motor está en job_result.motor_id o en item_seguimiento.motor_id.
    const jobs = await sql`
      SELECT
        job_id, tipo, estado, prioridad,
        proveedor_id, item_id, corrida_id,
        payload, attempts, max_attempts, next_run_at,
        locked_by, locked_until, last_error,
        created_at, started_at, finished_at, updated_at
      FROM app.job
      WHERE job_id = ${jobId}
      LIMIT 1
    `;

    const job = Array.isArray(jobs) ? jobs[0] : (jobs as any).rows?.[0];
    if (!job) {
      return NextResponse.json(
        { ok: false, error: "Job no encontrado" },
        { status: 404 }
      );
    }

    const results = await sql`
      SELECT
        result_id, job_id, motor_id, motor_version, status,
        candidatos, warnings, errors, created_at
      FROM app.job_result
      WHERE job_id = ${jobId}
      LIMIT 1
    `;
    const result = Array.isArray(results)
      ? results[0]
      : (results as any).rows?.[0];

    return NextResponse.json({ ok: true, job, result }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error leyendo job" },
      { status: 500 }
    );
  }
}
