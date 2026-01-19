import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scrapeTD } from "@/lib/motores/td";

function getWorkerId() {
  return process.env.WORKER_ID || `api-${Math.random().toString(16).slice(2)}`;
}

export async function POST(req: Request) {
  const sql = db();

  try {
    const workerId = getWorkerId();
    const body = await req.json().catch(() => ({}));
    const ttlSeconds = Number(body?.ttl_seconds || 300);

    // 1) Claim job (PENDING -> RUNNING)
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
      RETURNING j.job_id, j.tipo, j.estado, j.prioridad, j.proveedor_id, j.item_id, j.corrida_id, j.payload
    `;

    const job = Array.isArray(claimed) ? claimed[0] : (claimed as any)?.rows?.[0];

    if (!job) {
      return NextResponse.json({ ok: true, claimed: false }, { status: 200 });
    }

    // 2) Resolver motor_id desde item_seguimiento (NO desde app.job)
    let motorId: bigint | null = null;

    if (job.item_id) {
      const motorRows = await sql`
        SELECT motor_id
        FROM app.item_seguimiento
        WHERE item_id = ${BigInt(job.item_id)}
        LIMIT 1
      `;

      const motorRow = Array.isArray(motorRows) ? motorRows[0] : (motorRows as any)?.rows?.[0];
      const mid = motorRow?.motor_id;

      motorId = mid === null || mid === undefined ? null : BigInt(mid);
    }

    if (!motorId) {
      // Si no hay motor_id válido, marcamos FAILED y salimos (evita FK en job_result)
      const msg = "No se pudo resolver motor_id desde item_seguimiento para este job/item.";
      await sql`
        UPDATE app.job
        SET
          estado = 'FAILED'::app.job_estado,
          attempts = attempts + 1,
          last_error = ${msg},
          finished_at = now(),
          locked_until = NULL,
          updated_at = now()
        WHERE job_id = ${BigInt(job.job_id)}
      `;
      return NextResponse.json({ ok: false, error: msg, job_id: String(job.job_id) }, { status: 500 });
    }

    const motorVersion = "v0";

    // 3) Ejecutar motor
    const tipo = String(job.tipo || "");
    let motorResult: {
      status: "OK" | "WARNING" | "ERROR";
      candidatos: any[];
      warnings: any[];
      errors: any[];
    };

    if (tipo === "SCRAPE_URL") {
      const url =
        job?.payload?.url || job?.payload?.url_canonica || job?.payload?.url_original || "";
      motorResult = await scrapeTD(String(url));
    } else {
      motorResult = {
        status: "ERROR",
        candidatos: [],
        warnings: [],
        errors: [{ code: "UNKNOWN_JOB_TYPE", message: `Tipo job no soportado: ${tipo}` }],
      };
    }

    // 4) Upsert job_result (motor_id ahora es válido)
    await sql`
      INSERT INTO app.job_result
        (job_id, motor_id, motor_version, status, candidatos, warnings, errors, created_at)
      VALUES
        (${BigInt(job.job_id)}, ${motorId}, ${motorVersion}, ${motorResult.status}::app.job_result_status,
         ${JSON.stringify(motorResult.candidatos)}::jsonb,
         ${JSON.stringify(motorResult.warnings)}::jsonb,
         ${JSON.stringify(motorResult.errors)}::jsonb,
         now())
      ON CONFLICT (job_id)
      DO UPDATE SET
        motor_id = EXCLUDED.motor_id,
        status = EXCLUDED.status,
        candidatos = EXCLUDED.candidatos,
        warnings = EXCLUDED.warnings,
        errors = EXCLUDED.errors,
        motor_version = EXCLUDED.motor_version,
        created_at = now()
    `;

    // 5) Transiciones de estado
    if (motorResult.status === "ERROR") {
      await sql`
        UPDATE app.job
        SET
          estado = 'FAILED'::app.job_estado,
          attempts = attempts + 1,
          last_error = ${JSON.stringify(motorResult.errors?.[0] ?? motorResult.errors ?? null)},
          finished_at = now(),
          locked_until = NULL,
          updated_at = now()
        WHERE job_id = ${BigInt(job.job_id)}
      `;

      if (job.item_id) {
        await sql`
          UPDATE app.item_seguimiento
          SET
            estado = 'ERROR_SCRAPE'::app.item_estado,
            ultimo_error_scrape = now(),
            mensaje_error = ${String(motorResult.errors?.[0]?.message || "ERROR")},
            updated_at = now()
          WHERE item_id = ${BigInt(job.item_id)}
        `;
      }
    } else {
      await sql`
        UPDATE app.job
        SET
          estado = 'WAITING_REVIEW'::app.job_estado,
          finished_at = now(),
          locked_until = NULL,
          updated_at = now()
        WHERE job_id = ${BigInt(job.job_id)}
      `;

      if (job.item_id) {
        await sql`
          UPDATE app.item_seguimiento
          SET
            estado = 'WAITING_REVIEW'::app.item_estado,
            ultimo_intento_scrape = now(),
            ultimo_scrape_ok = now(),
            updated_at = now()
          WHERE item_id = ${BigInt(job.item_id)}
        `;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        claimed: true,
        job_id: String(job.job_id),
        motor_id: String(motorId),
        status: motorResult.status,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error ejecutando worker" },
      { status: 500 }
    );
  }
}
