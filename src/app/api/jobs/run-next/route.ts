import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(_req: Request) {
  const sql = db();

  try {
    // 1) Tomar 1 job PENDING que esté listo (y no locked)
    const pickedRows = await sql`
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
        locked_by = ${"api/run-next"},
        locked_until = now() + interval '5 minutes',
        started_at = COALESCE(started_at, now()),
        updated_at = now()
      FROM picked
      WHERE j.job_id = picked.job_id
      RETURNING j.job_id, j.tipo, j.estado, j.prioridad, j.proveedor_id, j.item_id, j.corrida_id, j.payload
    `;

    const job = Array.isArray(pickedRows) ? pickedRows[0] : (pickedRows as any)?.rows?.[0];

    if (!job) {
      return NextResponse.json({ ok: true, claimed: false }, { status: 200 });
    }

    const jobId = BigInt(job.job_id);
    const itemId = job.item_id != null ? BigInt(job.item_id) : null;

    // 2) Resolver motor_id desde item_seguimiento (NO desde app.job)
    let motorId: bigint | null = null;
    if (itemId) {
      const motorRows = await sql`
        SELECT motor_id
        FROM app.item_seguimiento
        WHERE item_id = ${itemId}
        LIMIT 1
      `;
      const r = Array.isArray(motorRows) ? motorRows[0] : (motorRows as any)?.rows?.[0];
      if (r?.motor_id != null) motorId = BigInt(r.motor_id);
    }

    // 3) Insertar job_result (dummy por ahora)
    //    OJO: ajustá columnas según tu schema real si difiere.
    await sql`
      INSERT INTO app.job_result (job_id, motor_id, motor_version, status, candidatos, created_at)
      VALUES (
        ${jobId},
        ${motorId},
        'v0',
        'OK',
        ${JSON.stringify({
          descripcion: "candidato TD (dummy)",
          presentacion: null,
          articulo_prov: null,
          costo_base_usd: null,
          fx_usado_en_alt: null,
        })}::jsonb,
        now()
      )
      ON CONFLICT (job_id) DO UPDATE
        SET
          motor_id = EXCLUDED.motor_id,
          motor_version = EXCLUDED.motor_version,
          status = EXCLUDED.status,
          candidatos = EXCLUDED.candidatos,
          created_at = EXCLUDED.created_at
    `;

    // 4) Pasar a WAITING_REVIEW y LIBERAR LOCK (clave)
    await sql`
      UPDATE app.job
      SET
        estado = 'WAITING_REVIEW'::app.job_estado,
        locked_by = NULL,
        locked_until = NULL,
        updated_at = now(),
        finished_at = now()
      WHERE job_id = ${jobId}
    `;

    return NextResponse.json(
      { ok: true, claimed: true, job_id: String(jobId), motor_id: motorId ? String(motorId) : null },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error en run-next" }, { status: 500 });
  }
}
