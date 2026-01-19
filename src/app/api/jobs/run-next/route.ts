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
  // FIX: TypeScript a veces no ve .begin() en el tipo que devuelve db()
  const sql: any = db();

  try {
    const result = await sql.begin(async (tx: any) => {
      // 1) Tomar 1 job PENDING (lock)
      const pickedRows = await tx<JobRow[]>`
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
          updated_at = now()
        FROM picked
        WHERE j.job_id = picked.job_id
        RETURNING j.job_id, j.tipo, j.estado, j.prioridad, j.proveedor_id, j.item_id, j.corrida_id, j.payload
      `;

      const job = Array.isArray(pickedRows) ? pickedRows[0] : (pickedRows as any)?.rows?.[0];
      if (!job) {
        return { ok: true, claimed: false as const };
      }

      const jobId = toBigInt(job.job_id);
      const itemId = toBigInt(job.item_id);

      if (!jobId) {
        await tx`
          UPDATE app.job
          SET
            estado = 'FAILED'::app.job_estado,
            last_error = 'job_id invalido (no numerico)',
            locked_by = NULL,
            locked_until = NULL,
            finished_at = now(),
            updated_at = now()
          WHERE job_id = ${job.job_id}
        `;
        return { ok: false, claimed: true as const, error: "job_id invalido" };
      }

      // 2) Resolver motor_id desde app.item_seguimiento
      let motorId: bigint | null = null;

      if (itemId) {
        const motorRows = await tx<any[]>`
          SELECT motor_id
          FROM app.item_seguimiento
          WHERE item_id = ${itemId}
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1
        `;
        const motorRow = Array.isArray(motorRows) ? motorRows[0] : (motorRows as any)?.rows?.[0];
        motorId = toBigInt(motorRow?.motor_id);
      }

      // Si falta motor_id, fallamos el job con mensaje claro
      if (!motorId) {
        await tx`
          UPDATE app.job
          SET
            estado = 'FAILED'::app.job_estado,
            last_error = ${`motor_id no encontrado para item_id=${itemId ?? "NULL"}`},
            locked_by = NULL,
            locked_until = NULL,
            finished_at = now(),
            updated_at = now()
          WHERE job_id = ${jobId}
        `;
        return {
          ok: false,
          claimed: true as const,
          job_id: String(jobId),
          error: `motor_id no encontrado para item_id=${itemId ?? "NULL"}`,
        };
      }

      // 3) Upsert job_result
      const candidatos = [
        {
          proveedor_id: job.proveedor_id ?? null,
          item_id: itemId ? String(itemId) : null,
          descripcion: "Candidato TD (dummy)",
          presentacion: null,
          unidad: null,
          articulo_prov: null,
          costo_base_usd: null,
          fx_usado_en_alt: null,
        },
      ];

      await tx`
        INSERT INTO app.job_result (job_id, motor_id, motor_version, status, candidatos, created_at)
        VALUES (${jobId}, ${motorId}, 'v0', 'OK', ${JSON.stringify(candidatos)}::jsonb, now())
        ON CONFLICT (job_id)
        DO UPDATE SET
          motor_id = EXCLUDED.motor_id,
          motor_version = EXCLUDED.motor_version,
          status = EXCLUDED.status,
          candidatos = EXCLUDED.candidatos,
          updated_at = now()
      `;

      // 4) WAITING_REVIEW
      await tx`
        UPDATE app.job
        SET
          estado = 'WAITING_REVIEW'::app.job_estado,
          locked_by = NULL,
          locked_until = NULL,
          updated_at = now()
        WHERE job_id = ${jobId}
      `;

      return {
        ok: true,
        claimed: true as const,
        job: {
          job_id: String(jobId),
          item_id: itemId ? String(itemId) : null,
          motor_id: String(motorId),
          tipo: job.tipo,
        },
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error en run-next" }, { status: 500 });
  }
}
