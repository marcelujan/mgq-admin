import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function parseJobId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { job_id: string } }
) {
  try {
    const jobId = parseJobId(params.job_id);
    if (jobId === null) {
      return NextResponse.json(
        { ok: false, error: "job_id inválido (debe ser numérico)" },
        { status: 400 }
      );
    }

    const sql = db();

    // app.job NO tiene motor_id -> lo traemos desde item_seguimiento
    const jobRows = (await sql`
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
    `) as any[];

    const job = jobRows?.[0];
    if (!job) {
      return NextResponse.json(
        { ok: false, error: "Job no encontrado" },
        { status: 404 }
      );
    }

    const resultRows = (await sql`
      SELECT
        result_id, job_id, motor_id, motor_version, status,
        candidatos, warnings, errors, created_at
      FROM app.job_result
      WHERE job_id = ${jobId}
      LIMIT 1
    `) as any[];

    const result = resultRows?.[0] ?? null;

    return NextResponse.json(
      {
        ok: true,
        job: {
          ...job,
          // BigInt rompe JSON -> lo pasamos a string si existe
          job_id: job.job_id?.toString?.() ?? job.job_id,
          item_id: job.item_id?.toString?.() ?? job.item_id,
          proveedor_id: job.proveedor_id?.toString?.() ?? job.proveedor_id,
          corrida_id: job.corrida_id?.toString?.() ?? job.corrida_id,
          motor_id: job.motor_id?.toString?.() ?? job.motor_id,
        },
        result: result
          ? {
              ...result,
              result_id: result.result_id?.toString?.() ?? result.result_id,
              job_id: result.job_id?.toString?.() ?? result.job_id,
              motor_id: result.motor_id?.toString?.() ?? result.motor_id,
            }
          : null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error leyendo job" },
      { status: 500 }
    );
  }
}
