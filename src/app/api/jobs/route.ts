import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get("estado");
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10) || 200, 500);

    // opcional: solo último SUCCEEDED por item_id
    const latestSucceeded = searchParams.get("latest_succeeded") === "1";

    const sql = db();

    if (latestSucceeded) {
      const rows = await sql`
        SELECT DISTINCT ON (j.item_id)
          j.job_id, j.tipo, j.estado, j.prioridad,
          j.proveedor_id, j.item_id, j.corrida_id,
          j.payload, j.attempts, j.max_attempts, j.next_run_at,
          j.locked_by, j.locked_until, j.last_error,
          j.created_at, j.started_at, j.finished_at, j.updated_at,

          s.url_canonica,
          s.motor_id AS motor_id,

          p.nombre AS proveedor_nombre,
          p.codigo AS proveedor_codigo,

          COALESCE(jsonb_array_length(jr.warnings), 0) AS warnings_count,
          COALESCE(jsonb_array_length(jr.errors), 0) AS errors_count,
          COALESCE(jsonb_array_length(jr.candidatos), 0) AS candidatos_count,
          jr.status AS result_status,

          (
            SELECT count(*)
            FROM app.oferta_proveedor o
            WHERE o.item_id = j.item_id
          )::int AS ofertas_count

        FROM app.job j
        LEFT JOIN app.item_seguimiento s ON s.item_id = j.item_id
        LEFT JOIN app.proveedor p ON p.proveedor_id = s.proveedor_id
        LEFT JOIN app.job_result jr ON jr.job_id = j.job_id

        WHERE j.estado = 'SUCCEEDED'::app.job_estado
        ORDER BY
          j.item_id,
          COALESCE(j.finished_at, j.updated_at, j.created_at) DESC,
          j.job_id DESC
        LIMIT ${limit}
      `;

      return NextResponse.json({ ok: true, jobs: rows }, { status: 200 });
    }

    const rows = await sql`
      SELECT
        j.job_id, j.tipo, j.estado, j.prioridad,
        j.proveedor_id, j.item_id, j.corrida_id,
        j.payload, j.attempts, j.max_attempts, j.next_run_at,
        j.locked_by, j.locked_until, j.last_error,
        j.created_at, j.started_at, j.finished_at, j.updated_at,

        s.url_canonica,
        s.motor_id AS motor_id,

        p.nombre AS proveedor_nombre,
        p.codigo AS proveedor_codigo,

        COALESCE(jsonb_array_length(jr.warnings), 0) AS warnings_count,
        COALESCE(jsonb_array_length(jr.errors), 0) AS errors_count,
        COALESCE(jsonb_array_length(jr.candidatos), 0) AS candidatos_count,
        jr.status AS result_status,

        (
          SELECT count(*)
          FROM app.oferta_proveedor o
          WHERE o.item_id = j.item_id
        )::int AS ofertas_count

      FROM app.job j
      LEFT JOIN app.item_seguimiento s ON s.item_id = j.item_id
      LEFT JOIN app.proveedor p ON p.proveedor_id = s.proveedor_id
      LEFT JOIN app.job_result jr ON jr.job_id = j.job_id

      WHERE (${estado}::text IS NULL OR j.estado = ${estado}::app.job_estado)
      ORDER BY j.job_id DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({ ok: true, jobs: rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error listando jobs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const itemIdsRaw = Array.isArray(body?.item_ids) ? body.item_ids : [];
    const prioridad = Number.isFinite(Number(body?.prioridad)) ? Number(body.prioridad) : 100;

    const itemIds = Array.from(
      new Set(
        itemIdsRaw
          .map((x: any) => Number(x))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      )
    );

    if (itemIds.length === 0) {
      return NextResponse.json({ ok: false, error: "item_ids vacío" }, { status: 400 });
    }

    const sql = db();

    const created: number[] = [];
    for (const itemId of itemIds) {
      const payload = JSON.stringify({ source: "manual_ui", item_id: itemId });
      const rows = (await sql`
        INSERT INTO app.job (tipo, estado, prioridad, item_id, payload)
        VALUES ('SCRAPE_URL'::app.job_tipo, 'PENDING'::app.job_estado, ${prioridad}, ${itemId}, ${payload}::jsonb)
        RETURNING job_id
      `) as any[];

      const jid = rows?.[0]?.job_id;
      if (jid !== null && jid !== undefined) created.push(Number(jid));
    }

    return NextResponse.json({ ok: true, created_job_ids: created }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error creando jobs" }, { status: 500 });
  }
}
