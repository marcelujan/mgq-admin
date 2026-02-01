import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Neon/pg client in this project can return:
 * - array of rows (Record<string, any>[])
 * - array-of-arrays (any[][])
 * - FullQueryResults-like object with { rows: ... }
 *
 * This helper normalizes the result to an array of objects.
 */
function toRows<T extends Record<string, any>>(result: unknown): T[] {
  if (Array.isArray(result)) {
    // Could be T[] or any[][]. We only support the object-row case here.
    // If it is any[][], it will not have named columns.
    const first = result[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      return result as T[];
    }
    return [];
  }

  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as any).rows;
    if (Array.isArray(rows)) return rows as T[];
  }

  return [];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get("estado");
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "200", 10) || 200,
      500
    );

    const sql = db();

    const result = await sql`
      SELECT *
      FROM (
        SELECT DISTINCT ON (j.item_id, j.estado)
          j.job_id, j.tipo, j.estado, j.prioridad,
          j.proveedor_id, j.item_id, j.corrida_id,
          j.payload, j.attempts, j.max_attempts, j.next_run_at,
          j.locked_by, j.locked_until, j.last_error,
          j.created_at, j.started_at, j.finished_at, j.updated_at,
          (
            SELECT count(*)
            FROM app.oferta_proveedor o
            WHERE o.item_id = j.item_id
          )::int AS ofertas_count
        FROM app.job j
        WHERE (${estado}::text IS NULL OR j.estado = ${estado}::app.job_estado)
        ORDER BY
          j.item_id,
          j.estado,
          j.created_at DESC,
          j.job_id DESC
      ) t
      ORDER BY t.created_at DESC, t.job_id DESC
      LIMIT ${limit}
    `;

    const rows = toRows<Record<string, any>>(result);
    return NextResponse.json({ ok: true, jobs: rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error listando jobs" },
      { status: 500 }
    );
  }
}

/**
 * Opción A: "jobs como estado actual"
 * - Requiere un índice único:
 *   CREATE UNIQUE INDEX IF NOT EXISTS job_unique_item_tipo
 *   ON app.job (item_id, tipo) WHERE item_id IS NOT NULL;
 *
 * Este endpoint re-encola (UPSERT) el mismo job por (item_id, tipo).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const itemIdsRaw = Array.isArray(body?.item_ids) ? body.item_ids : [];
    const prioridad = Number.isFinite(Number(body?.prioridad))
      ? Number(body.prioridad)
      : 100;

    const maxAttempts = Number.isFinite(Number(body?.max_attempts))
      ? Number(body.max_attempts)
      : 3;

    const itemIds = Array.from(
      new Set(
        itemIdsRaw
          .map((x: any) => Number(x))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      )
    );

    if (itemIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "item_ids vacío" },
        { status: 400 }
      );
    }

    const sql = db();
    const upserted: number[] = [];

    for (const itemId of itemIds) {
      const payloadObj = { source: "manual_ui", item_id: itemId };
      const payload = JSON.stringify(payloadObj);

      const result = await sql`
        INSERT INTO app.job (
          tipo, estado, prioridad, item_id,
          payload, attempts, max_attempts, next_run_at,
          locked_by, locked_until, last_error,
          started_at, finished_at
        )
        VALUES (
          'SCRAPE_URL'::app.job_tipo,
          'PENDING'::app.job_estado,
          ${prioridad},
          ${itemId},
          ${payload}::jsonb,
          0,
          ${maxAttempts},
          now(),
          NULL, NULL, NULL,
          NULL, NULL
        )
        ON CONFLICT (item_id, tipo)
        DO UPDATE SET
          estado       = 'PENDING'::app.job_estado,
          prioridad    = EXCLUDED.prioridad,
          payload      = EXCLUDED.payload,
          attempts     = 0,
          max_attempts = EXCLUDED.max_attempts,
          next_run_at  = now(),
          locked_by    = NULL,
          locked_until = NULL,
          last_error   = NULL,
          started_at   = NULL,
          finished_at  = NULL,
          updated_at   = now()
        RETURNING job_id
      `;

      const rows = toRows<{ job_id: number }>(result);
      const jid = rows[0]?.job_id;
      if (jid != null) upserted.push(Number(jid));
    }

    // Para no romper posibles consumidores viejos, devuelvo ambos nombres.
    return NextResponse.json(
      { ok: true, job_ids: upserted, created_job_ids: upserted },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error creando jobs" },
      { status: 500 }
    );
  }
}
