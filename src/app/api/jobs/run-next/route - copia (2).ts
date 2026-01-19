import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scrapeTD } from "@/lib/motores/td";

function getWorkerId() {
  return process.env.WORKER_ID || `api-${Math.random().toString(16).slice(2)}`;
}

function toBigIntSafe(x: any): bigint | null {
  if (x === null || x === undefined) return null;
  if (typeof x === "bigint") return x;
  const s = String(x).trim();
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const sql = db();
  const workerId = getWorkerId();

  // Body opcional
  const body = await req.json().catch(() => ({} as any));
  const ttlSeconds = Number(body?.ttl_seconds || 300);

  // Helper para marcar FAILED y liberar lock
  async function failJob(jobId: bigint, message: string, itemId?: any) {
    await sql`
      UPDATE app.job
      SET
        estado = 'FAILED'::app.job_estado,
        attempts = attempts + 1,
        last_error = ${message},
        finished_at = now(),
        locked_by = NULL,
        locked_until = NULL,
        updated_at = now()
      WHERE job_id = ${jobId}
    `;

    const itemBig = toBigIntSafe(itemId);
    if (itemBig) {
      await sql`
        UPDATE app.item_seguimiento
        SET
          estado = 'ERROR_SCRAPE'::app.item_estado,
          ultimo_error_scrape = now(),
          mensaje_error = ${message},
          updated_at = now()
        WHERE item_id = ${itemBig}
      `;
    }
  }

  try {
    // 1) Claim 1 job PENDING
    const claimed = await sql`
      WITH picked AS (
        SELECT job_id
        FROM app.job
        WHERE estado = 'PENDING'::app.job_estado
          AND next_run_at <= now()
          AND (locked_until IS NULL OR locked_until < now())
        ORDER BY prioridad DESC, next_run_at ASC, job_id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE app.job j
      SET
        estado = 'RUNNING'::app.job_estado,
        locked_by = ${workerId},
        locked_until = now() + ((${ttlSeconds}::text || ' seconds')::interval),
        started_at = COALESCE(started_at, now()),
        updated_at = now()
      FROM picked
      WHERE j.job_id = picked.job_id
      RETURNING j.job_id, j.tipo, j.item_id, j.payload, j.motor_id
    `;

    const job = Array.isArray(claimed) ? claimed[0] : (claimed as any).rows?.[0];

    if (!job) {
      return NextResponse.json({ ok: true, claimed: false }, { status: 200 });
    }

    const jobId = toBigIntSafe(job.job_id);
    if (!jobId) {
      return NextResponse.json({ ok: false, error: "job_id inválido" }, { status: 500 });
    }

    const itemId = toBigIntSafe(job.item_id);

    // 2) Resolver motor_id (NO usar 0: rompe FK)
    let motorId = toBigIntSafe(job.motor_id);

    if (!motorId && itemId) {
      const motorRows = await sql`
        SELECT motor_id
        FROM app.item_seguimiento
        WHERE item_id = ${itemId}
        LIMIT 1
      `;
      const motorRow = Array.isArray(motorRows) ? motorRows[0] : (motorRows as any).rows?.[0];
      motorId = toBigIntSafe(motorRow?.motor_id);
    }

    if (!motorId) {
      await failJob(jobId, "No se pudo resolver motor_id (ni en job ni en item_seguimiento).", job.item_id);
      return NextResponse.json(
        { ok: false, error: "No se pudo resolver motor_id", job_id: String(jobId) },
        { status: 500 }
      );
    }

    const motorVersion = "v0";

    // 3) Ejecutar motor
    let motorResult: {
      status: "OK" | "ERROR";
      candidatos: any[];
      warnings: any[];
      errors: any[];
    };

    if (job.tipo === "SCRAPE_URL") {
      const url = job?.payload?.url || job?.payload?.url_canonica || job?.payload?.url_original;
      const r = await scrapeTD(String(url || ""));
      // Normalizamos por si el motor devuelve otras claves
      motorResult = {
        status: (r?.status === "ERROR" ? "ERROR" : "OK") as "OK" | "ERROR",
        candidatos: Array.isArray(r?.candidatos) ? r.candidatos : [],
        warnings: Array.isArray(r?.warnings) ? r.warnings : [],
        errors: Array.isArray(r?.errors) ? r.errors : [],
      };
    } else {
      motorResult = {
        status: "ERROR",
        candidatos: [],
        warnings: [],
        errors: [{ code: "UNKNOWN_JOB_TYPE", message: `Tipo job no soportado: ${String(job.tipo)}` }],
      };
    }

    // 4) Upsert job_result
    await sql`
      INSERT INTO app.job_result
        (job_id, motor_id, motor_version, status, candidatos, warnings, errors, created_at)
      VALUES
        (${jobId}, ${motorId}, ${motorVersion},
         ${motorResult.status}::app.job_result_status,
         ${JSON.stringify(motorResult.candidatos)}::jsonb,
         ${JSON.stringify(motorResult.warnings)}::jsonb,
         ${JSON.stringify(motorResult.errors)}::jsonb,
         now())
      ON CONFLICT (job_id)
      DO UPDATE SET
        motor_id = EXCLUDED.motor_id,
        motor_version = EXCLUDED.motor_version,
        status = EXCLUDED.status,
        candidatos = EXCLUDED.candidatos,
        warnings = EXCLUDED.warnings,
        errors = EXCLUDED.errors,
        created_at = now()
    `;

    // 5) Transición de estados + liberar lock
    if (motorResult.status === "ERROR") {
      await failJob(
        jobId,
        String(motorResult.errors?.[0]?.message || "ERROR ejecutando motor"),
        job.item_id
      );
      return NextResponse.json(
        { ok: true, claimed: true, job_id: String(jobId), status: "ERROR" },
        { status: 200 }
      );
    }

    await sql`
      UPDATE app.job
      SET
        estado = 'WAITING_REVIEW'::app.job_estado,
        finished_at = now(),
        locked_by = NULL,
        locked_until = NULL,
        updated_at = now()
      WHERE job_id = ${jobId}
    `;

    if (itemId) {
      await sql`
        UPDATE app.item_seguimiento
        SET
          estado = 'WAITING_REVIEW'::app.item_estado,
          ultimo_intento_scrape = now(),
          ultimo_scrape_ok = now(),
          updated_at = now()
        WHERE item_id = ${itemId}
      `;
    }

    return NextResponse.json(
      { ok: true, claimed: true, job_id: String(jobId), status: "OK" },
      { status: 200 }
    );
  } catch (e: any) {
    // Si explotó después de claim, lo ideal sería intentar marcar FAILED,
    // pero sin jobId seguro no podemos. Devolvemos error.
    return NextResponse.json(
      { ok: false, error: e?.message || "Error ejecutando run-next" },
      { status: 500 }
    );
  }
}
