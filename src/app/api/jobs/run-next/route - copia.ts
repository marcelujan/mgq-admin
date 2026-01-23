import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type JobRow = {
  job_id: string | number | bigint;
  tipo: string;
  estado: string;
  prioridad: number | null;
  proveedor_id: string | number | bigint | null;
  item_id: string | number | bigint | null;
  corrida_id: string | number | bigint | null;
  payload: any;
};

type MotorRow = { motor_id: string | number | bigint | null };

function toBigInt(v: any): bigint | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v;
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

export async function POST(_req: Request) {
  const sql = db();

  try {
    // 1) Claim 1 job PENDING -> RUNNING (atómico)
    const pickedRows = (await sql`
      WITH picked AS (
        SELECT job_id
        FROM app.job
        WHERE estado = 'PENDING'::app.job_estado
          AND next_run_at <= now()
          AND (locked_until IS NULL OR locked_until < now())
        ORDER BY prioridad DESC NULLS LAST, next_run_at ASC, job_id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE app.job j
      SET
        estado = 'RUNNING'::app.job_estado,
        locked_by = 'api/run-next',
        locked_until = now() + interval '5 minutes',
        started_at = COALESCE(started_at, now()),
        last_error = NULL,
        updated_at = now()
      FROM picked
      WHERE j.job_id = picked.job_id
      RETURNING
        j.job_id, j.tipo, j.estado, j.prioridad,
        j.proveedor_id, j.item_id, j.corrida_id, j.payload
    `) as unknown as JobRow[];

    const job = pickedRows?.[0];
    if (!job) {
      return NextResponse.json({ ok: true, claimed: false }, { status: 200 });
    }

    const jobId = toBigInt(job.job_id);
    const itemId = toBigInt(job.item_id);

    if (!jobId) {
      await sql`
        UPDATE app.job
        SET
          estado = 'PENDING'::app.job_estado,
          last_error = 'job_id invalido (no numerico)',
          locked_by = NULL,
          locked_until = NULL,
          updated_at = now()
        WHERE job_id = ${job.job_id}
      `;
      return NextResponse.json(
        { ok: false, claimed: true, error: "job_id invalido (no numerico)" },
        { status: 500 }
      );
    }

    // 2) Resolver motor_id desde app.item_seguimiento
    let motorId: bigint | null = null;

    if (itemId) {
      const motorRows = (await sql`
        SELECT motor_id
        FROM app.item_seguimiento
        WHERE item_id = ${itemId}
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      `) as unknown as MotorRow[];

      motorId = toBigInt(motorRows?.[0]?.motor_id);
    }

    // Si no hay motor_id, devolvemos el job a PENDING (no avanzamos)
    if (!motorId) {
      const msg = `motor_id no encontrado para item_id=${itemId ?? "NULL"} (aun no implementado o sin datos)`;

      await sql`
        UPDATE app.job
        SET
          estado = 'PENDING'::app.job_estado,
          last_error = ${msg},
          locked_by = NULL,
          locked_until = NULL,
          updated_at = now()
        WHERE job_id = ${jobId}
      `;

      return NextResponse.json(
        { ok: false, claimed: true, job_id: String(jobId), error: msg },
        { status: 409 }
      );
    }

    // 3) Upsert job_result (sin updated_at porque no existe)
    const candidatos = [
      {
        proveedor_id: job.proveedor_id ?? null,
        item_id: itemId ? String(itemId) : null,
        descripcion: "Candidato TD (dummy)",
        presentacion: null,
        uom: null,                 // <— antes unidad
        articulo_prov: null,
        costo_base_usd: null,
        fx_usado_en_alta: null,    // <— corregido (antes fx_usado_en_alt)
        fecha_scrape_base: null,   // <— approve ya lo lee
        densidad: null,            // <— approve ya lo lee
      },
    ];

    await sql`
      INSERT INTO app.job_result (job_id, motor_id, motor_version, status, candidatos, created_at)
      VALUES (${jobId}, ${motorId}, 'v0', 'OK', ${JSON.stringify(candidatos)}::jsonb, now())
      ON CONFLICT (job_id)
      DO UPDATE SET
        motor_id = EXCLUDED.motor_id,
        motor_version = EXCLUDED.motor_version,
        status = EXCLUDED.status,
        candidatos = EXCLUDED.candidatos
    `;

    // 4) WAITING_REVIEW
    await sql`
      UPDATE app.job
      SET
        estado = 'WAITING_REVIEW'::app.job_estado,
        locked_by = NULL,
        locked_until = NULL,
        updated_at = now()
      WHERE job_id = ${jobId}
    `;

    return NextResponse.json(
      {
        ok: true,
        claimed: true,
        job: {
          job_id: String(jobId),
          item_id: itemId ? String(itemId) : null,
          motor_id: String(motorId),
          tipo: job.tipo,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error en run-next" },
      { status: 500 }
    );
  }
}
