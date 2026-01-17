import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";

// ===== util: canonicalizar URL =====
function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();

    // opcional: sacar slash final (excepto "/")
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

// ===== GET /api/items?search=&estado=&seleccionado=&limit=&offset= =====
export async function GET(req: NextRequest) {
  try {
    const sql = db();

    const { searchParams } = new URL(req.url);

    const search = (searchParams.get("search") || "").trim();
    const estado = (searchParams.get("estado") || "").trim(); // item_estado
    const seleccionadoStr = (searchParams.get("seleccionado") || "").trim(); // "true"/"false"
    const limitRaw = Number(searchParams.get("limit") || 50);
    const offsetRaw = Number(searchParams.get("offset") || 0);

    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const where: string[] = [];
    const params: any[] = [];
    const add = (clause: string, value?: any) => {
      if (value === undefined) {
        where.push(clause);
        return;
      }
      params.push(value);
      where.push(clause.replace("?", `$${params.length}`));
    };

    if (search) {
      // busca en url_original/url_canonica y proveedor codigo/nombre
      const like = `%${search}%`;
      params.push(like, like, like, like);
      const base = params.length - 3; // índice ($n) del primer param recién agregado

      where.push(
        `(i.url_original ILIKE $${base} OR ` +
          `i.url_canonica ILIKE $${base + 1} OR ` +
          `p.codigo ILIKE $${base + 2} OR ` +
          `p.nombre ILIKE $${base + 3})`
      );
    }

    if (estado) add(`i.estado::text = ?`, estado);

    if (seleccionadoStr === "true") add(`i.seleccionado = ?`, true);
    if (seleccionadoStr === "false") add(`i.seleccionado = ?`, false);

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Intento 1: con “latest job” (si tu schema lo soporta)
    try {
      const q = `
        SELECT
          i.item_id,
          i.proveedor_id,
          p.codigo  AS proveedor_codigo,
          p.nombre  AS proveedor_nombre,
          i.motor_id,
          i.url_original,
          i.url_canonica,
          i.seleccionado,
          i.estado::text AS estado,
          i.created_at,
          i.updated_at,
          j.job_id        AS ultimo_job_id,
          j.estado::text  AS ultimo_job_estado
        FROM app.item_seguimiento i
        JOIN app.proveedor p ON p.proveedor_id = i.proveedor_id
        LEFT JOIN LATERAL (
          SELECT job_id, estado
          FROM app.job
          WHERE item_id = i.item_id
          ORDER BY job_id DESC
          LIMIT 1
        ) j ON true
        ${whereSql}
        ORDER BY i.updated_at DESC, i.item_id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      const result: any = await sql.query(q, [...params, limit, offset]);
      const list = Array.isArray(result) ? result : (result?.rows ?? []);

      return NextResponse.json({
        ok: true,
        limit,
        offset,
        count: list.length,
        items: list,
      });

    } catch {
      // Intento 2: sin job
      const q = `
        SELECT
          i.item_id,
          i.proveedor_id,
          p.codigo  AS proveedor_codigo,
          p.nombre  AS proveedor_nombre,
          i.motor_id,
          i.url_original,
          i.url_canonica,
          i.seleccionado,
          i.estado::text AS estado,
          i.created_at,
          i.updated_at
        FROM app.item_seguimiento i
        JOIN app.proveedor p ON p.proveedor_id = i.proveedor_id
        ${whereSql}
        ORDER BY i.updated_at DESC, i.item_id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      const rows = await sql.query(q, [...params, limit, offset]);

      return NextResponse.json({
        ok: true,
        limit,
        offset,
        count: rows.rows.length,
        items: rows.rows,
      });
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "error" },
      { status: 500 }
    );
  }
}

// ===== POST /api/items =====
// Mantengo lo que ya tenés funcionando: inserta item + job, y devuelve { item_id, job_id }.
// Si querés que el job se cree con defaults distintos, lo tocamos después.
export async function POST(req: NextRequest) {
  try {
    const sql = db();
    const body = await req.json().catch(() => ({} as any));

    // Acepta ambos formatos: el viejo (url/proveedor_codigo) y el nuevo (urlOriginal/proveedorCodigo)
    const urlRaw =
      typeof body?.url === "string" ? body.url.trim()
      : typeof body?.urlOriginal === "string" ? body.urlOriginal.trim()
      : typeof body?.url_original === "string" ? body.url_original.trim()
      : "";

    const proveedorCodigo =
      typeof body?.proveedor_codigo === "string" ? body.proveedor_codigo.trim()
      : typeof body?.proveedorCodigo === "string" ? body.proveedorCodigo.trim()
      : typeof body?.proveedor_codigo === "string" ? body.proveedor_codigo.trim()
      : "";

    const seleccionado =
      body?.seleccionado === true || body?.seleccionado === "true";

      
    if (!urlRaw) {
      return NextResponse.json({ ok: false, error: "url requerida" }, { status: 400 });
    }
    if (!proveedorCodigo) {
      return NextResponse.json(
        { ok: false, error: "proveedor_codigo requerido (ej: TD)" },
        { status: 400 }
      );
    }

    const urlCanonica = canonicalizeUrl(urlRaw);
    if (!urlCanonica) {
      return NextResponse.json({ ok: false, error: "URL inválida" }, { status: 400 });
    }

    // 1) resolver proveedor_id + motor_id_default
    const provRows = await sql.query(
      `
      SELECT proveedor_id, motor_id_default
      FROM app.proveedor
      WHERE codigo = $1
      LIMIT 1
      `,
      [proveedorCodigo]
    );

    const prov = provRows.rows[0];
    if (!prov) {
      return NextResponse.json(
        { ok: false, error: `proveedor inválido: ${proveedorCodigo}` },
        { status: 400 }
      );
    }
    if (!prov.motor_id_default) {
      return NextResponse.json(
        { ok: false, error: `proveedor ${proveedorCodigo} no tiene motor_id_default` },
        { status: 400 }
      );
    }

    // 2) dedupe por url_canonica
    const dup = await sql.query(
      `
      SELECT item_id
      FROM app.item_seguimiento
      WHERE url_canonica = $1
      LIMIT 1
      `,
      [urlCanonica]
    );

    if (dup.rows?.[0]?.item_id) {
      return NextResponse.json(
        { ok: false, error: "URL ya registrada", item_id: String(dup.rows[0].item_id) },
        { status: 409 }
      );
    }

    // 3) insertar item
    // item_estado enum real: PENDING_SCRAPE | WAITING_REVIEW | OK | ERROR_SCRAPE | MANUAL_OVERRIDE
    const insItem = await sql.query(
      `
      INSERT INTO app.item_seguimiento
        (proveedor_id, motor_id, url_original, url_canonica, seleccionado, estado)
      VALUES
        ($1, $2, $3, $4, $5, 'PENDING_SCRAPE')
      RETURNING item_id
      `,
      [prov.proveedor_id, prov.motor_id_default, urlRaw, urlCanonica, seleccionado]
    );

    const item_id = insItem.rows[0].item_id;

    // 4) insertar job (enums reales)
    // job_tipo enum real: SCRAPE_URL
    // job_estado enum real: PENDING | RUNNING | WAITING_REVIEW | SUCCEEDED | FAILED | CANCELLED
    // job_result_status enum real: OK | WARNING | ERROR  (si existe en tu tabla)
    //
    // OJO: acá asumo que app.job tiene (tipo, estado, item_id, proveedor_id, prioridad)
    // Si tu tabla job tiene nombres distintos, decime y lo ajusto en 30s.
    let job_id: any = null;
    try {
      const insJob = await sql.query(
        `
        INSERT INTO app.job
          (tipo, estado, item_id, proveedor_id, prioridad)
        VALUES
          ('SCRAPE_URL', 'PENDING', $1, $2, 0)
        RETURNING job_id
        `,
        [item_id, prov.proveedor_id]
      );
      job_id = insJob.rows?.[0]?.job_id ?? null;
    } catch {
      // si tu schema todavía no soporta insertar job así, igual devolvemos item_id
      job_id = null;
    }

    return NextResponse.json(
      { ok: true, item_id: String(item_id), job_id: job_id ? String(job_id) : null },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "error" },
      { status: 500 }
    );
  }
}
