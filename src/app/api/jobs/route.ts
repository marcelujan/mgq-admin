import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function isJobsRootPath(req: Request) {
  const pathname = new URL(req.url).pathname;
  return pathname === "/api/jobs" || pathname === "/api/jobs/";
}

function asInt(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  if (!isJobsRootPath(req)) {
    return NextResponse.json({ ok: false, error: "Not Found" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get("estado") || "";
    const latestSucceeded = searchParams.get("latest_succeeded") === "1";
    const limit = Math.min(asInt(searchParams.get("limit") || "200", 200), 500);

    const sql = db();

    // Base query: jobs + item_seguimiento + proveedor + job_result
    // Nota: app.job manual suele tener solo item_id; proveedor/motor salen de item_seguimiento.
    if (latestSucceeded) {
      const rows = await sql`
        SELECT DISTINCT ON (j.item_id)
          j.job_id, j.tipo, j.estado, j.prioridad,
          j.proveedor_id, j.item_id, j.corrida_id,
          j.payload, j.attempts, j.max_attempts, j.next_run_at,
          j.locked_by, j.locked_until, j.last_error,
          j.created_at, j.started_at, j.finished_at, j.updated_at,

          s.url_canonica,
          s.motor_id as motor_id,
          p.nombre as proveedor_nombre,
          p.codigo as proveedor_codigo,

          COALESCE((jr.result->'warnings')::jsonb, '[]'::jsonb) as warnings_json,
          COALESCE((jr.result->'errors')::jsonb, '[]'::jsonb) as errors_json,
          COALESCE((jr.result->>'valid_count')::text, '0') as valid_count_text,

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

      const normalized = (rows as any[]).map((r) => {
        const warningsArr = Array.isArray(r.warnings_json) ? r.warnings_json : [];
        const errorsArr = Array.isArray(r.errors_json) ? r.errors_json : [];
        return {
          ...r,
          warnings_count: warningsArr.length,
          errors_count: errorsArr.length,
          valid_count: asInt(r.valid_count_text, 0),
        };
      });

      return NextResponse.json({ ok: true, jobs: normalized }, { status: 200 });
    }

    const rows = await sql`
      SELECT
        j.job_id, j.tipo, j.estado, j.prioridad,
        j.proveedor_id, j.item_id, j.corrida_id,
        j.payload, j.attempts, j.max_attempts, j.next_run_at,
        j.locked_by, j.locked_until, j.last_error,
        j.created_at, j.started_at, j.finished_at, j.updated_at,

        s.url_canonica,
        s.motor_id as motor_id,
        p.nombre as proveedor_nombre,
        p.codigo as proveedor_codigo,

        COALESCE((jr.result->'warnings')::jsonb, '[]'::jsonb) as warnings_json,
        COALESCE((jr.result->'errors')::jsonb, '[]'::jsonb) as errors_json,
        COALESCE((jr.result->>'valid_count')::text, '0') as valid_count_text,

        (
          SELECT count(*)
          FROM app.oferta_proveedor o
          WHERE o.item_id = j.item_id
        )::int AS ofertas_count

      FROM app.job j
      LEFT JOIN app.item_seguimiento s ON s.item_id = j.item_id
      LEFT JOIN app.proveedor p ON p.proveedor_id = s.proveedor_id
      LEFT JOIN app.job_result jr ON jr.job_id = j.job_id

      WHERE (${estado}::text = '' OR j.estado = ${estado}::app.job_estado)
      ORDER BY j.job_id DESC
      LIMIT ${limit}
    `;

    const normalized = (rows as any[]).map((r) => {
      const warningsArr = Array.isArray(r.warnings_json) ? r.warnings_json : [];
      const errorsArr = Array.isArray(r.errors_json) ? r.errors_json : [];
      return {
        ...r,
        warnings_count: warningsArr.length,
        errors_count: errorsArr.length,
        valid_count: asInt(r.valid_count_text, 0),
      };
    });

    return NextResponse.json({ ok: true, jobs: normalized }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error listando jobs" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!isJobsRootPath(req)) {
    return NextResponse.json({ ok: false, error: "Not Found" }, { status: 404 });
  }

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
    return NextResponse.json(
      { ok: false, error: e?.message || "Error creando jobs" },
      { status: 500 }
    );
  }
}
