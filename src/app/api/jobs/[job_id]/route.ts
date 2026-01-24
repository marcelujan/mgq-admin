import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeRaw(raw: unknown): { kind: string; value: any; normalized: string | null } {
  const kind = Array.isArray(raw) ? "array" : typeof raw;

  let normalized: string | null = null;
  if (typeof raw === "string") normalized = raw.trim();
  else if (Array.isArray(raw) && typeof raw[0] === "string") normalized = raw[0].trim();

  return { kind, value: raw as any, normalized };
}

function parseJobId(raw: unknown): bigint | null {
  const { normalized } = normalizeRaw(raw);
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return null;

  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  //context: { params: Promise<{ job_id: string }> }
  { params }: { params: { job_id: string } }
) {
  try {
    //const paramsAny = (await context.params) as any;
    //const rawJobId = paramsAny?.job_id;
    const rawJobId = params.job_id;

    // logs en Vercel
    console.log("[/api/jobs/[job_id]] raw job_id:", rawJobId, "typeof:", typeof rawJobId, "isArray:", Array.isArray(rawJobId));

    const jobId = parseJobId(rawJobId);
    if (jobId === null) {
      const dbg = normalizeRaw(rawJobId);
      return NextResponse.json(
        {
          ok: false,
          error: "job_id inválido (debe ser numérico)",
          debug: {
            kind: dbg.kind,
            normalized: dbg.normalized,
            value: dbg.value,
          },
        },
        { status: 400 }
      );
    }

    const sql = db();

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
