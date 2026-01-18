import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db"; // <--- IMPORT RELATIVO (más compatible)

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const jobId = BigInt(job_id);

    const sql = db();

    // ⚠️ NO pedimos motor_id desde app.job porque tu DB NO lo tiene (lo viste en Neon)
    const jobRows = await sql`
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
    const job = (jobRows as any)?.[0];

    if (!job) {
      return NextResponse.json(
        { ok: false, error: "Job no encontrado" },
        { status: 404 }
      );
    }

    const resultRows = await sql`
      SELECT
        result_id, job_id, motor_id, motor_version, status,
        candidatos, warnings, errors, created_at
      FROM app.job_result
      WHERE job_id = ${jobId}
      LIMIT 1
    `;
    const result = (resultRows as any)?.[0] ?? null;

    return NextResponse.json({ ok: true, job, result }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error leyendo job" },
      { status: 500 }
    );
  }
}
