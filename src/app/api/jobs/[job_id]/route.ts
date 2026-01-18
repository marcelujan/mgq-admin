import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function parseJobId(raw: string): bigint | null {
  // evita el "Cannot convert <job_id> to a BigInt"
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export async function GET(_req: Request, ctx: { params: { job_id: string } }) {
  try {
    const jobId = parseJobId(ctx.params.job_id);
    if (jobId === null) {
      return NextResponse.json(
        { ok: false, error: "job_id inválido (debe ser numérico)" },
        { status: 400 }
      );
    }

    const sql = db();

    // OJO: app.job NO tiene motor_id en tu Neon.
    // Si querés mostrar motor_id, se obtiene desde item_seguimiento.
    const jobs = await sql`
      SELECT
        j.job_id, j.tipo, j.estado, j.prioridad,
        j.proveedor_id, j.item_id, j.corrida_id,
        j.payload, j.attempts, j.max_attempts, j.next_run_at,
        j.locked_by, j.locked_until, j.last_error,
        j.created_at, j.started_at, j.finished_at, j.updated_at,
        i.motor_id as motor_id
      FROM app.job j
      LEFT JOIN app.item_seguimiento i ON i.item_id = j.item_id
      WHERE j.job_id = ${jobId}
      LIMIT 1
    `;

    const job = Array.isArray(jobs) ? jobs[0] : (jobs as any).rows?.[0];
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job no encontrado" }, { status: 404 });
    }

    const results = await sql`
      SELECT
        result_id, job_id, motor_id, motor_version, status,
        candidatos, warnings, errors, created_at
      FROM app.job_result
      WHERE job_id = ${jobId}
      LIMIT 1
    `;
    const result = Array.isArray(results) ? results[0] : (results as any).rows?.[0];

    return NextResponse.json({ ok: true, job, result }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error leyendo job" },
      { status: 500 }
    );
  }
}
