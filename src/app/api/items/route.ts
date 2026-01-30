import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";

// ===== util: canonicalizar URL =====
function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();

    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

// Helper: agrega cláusulas con placeholders correctos ($1..$n)
// Soporta 0, 1 o múltiples valores (reemplaza cada '?' en orden).
function addWhere(where: string[], params: any[], clause: string, values?: any | any[]) {
  if (values === undefined) {
    where.push(clause);
    return;
  }
  const vs = Array.isArray(values) ? values : [values];
  for (const v of vs) params.push(v);

  let i = params.length - vs.length + 1; // índice del 1er param recién agregado (1-based)
  const replaced = clause.replace(/\?/g, () => `$${i++}`);
  where.push(replaced);
}

function normalizeQueryResult(res: any): any[] {
  // Neon/serverless puede devolver { rows: [...] } o directamente un array
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

// ===== GET /api/items =====
export async function GET(req: NextRequest) {
  try {
    const sql = db();
    const { searchParams } = new URL(req.url);

    const search = (searchParams.get("search") || "").trim();
    const estado = (searchParams.get("estado") || "").trim();
    const seleccionadoStr = (searchParams.get("seleccionado") || "").trim();

    const limitRaw = Number(searchParams.get("limit") || 50);
    const offsetRaw = Number(searchParams.get("offset") || 0);

    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const where: string[] = [];
    const params: any[] = [];

    // ✅ FIX: search con 4 placeholders (sin '?' sueltos)
    if (search) {
      const like = `%${search}%`;
      addWhere(
        where,
        params,
        `(i.url_original ILIKE ? OR i.url_canonica ILIKE ? OR p.codigo ILIKE ? OR p.nombre ILIKE ?)`,
        [like, like, like, like]
      );
    }

    if (estado) addWhere(where, params, `i.estado::text = ?`, estado);

    if (seleccionadoStr === "true") addWhere(where, params, `i.seleccionado = ?`, true);
    if (seleccionadoStr === "false") addWhere(where, params, `i.seleccionado = ?`, false);

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Intento 1: traer también el “último job” (si el schema lo soporta)
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
          i.mensaje_error,
          i.created_at,
          i.updated_at,
          j.job_id AS ultimo_job_id,
          j.estado::text AS ultimo_job_estado
        FROM app.item_seguimiento i
        JOIN app.proveedor p ON p.proveedor_id = i.proveedor_id
        LEFT JOIN LATERAL (
          SELECT job_id, estado
          FROM app.job
          WHERE item_id = i.item_id
          ORDER BY created_at DESC, job_id DESC
          LIMIT 1
        ) j ON true
        ${whereSql}
        ORDER BY i.updated_at DESC, i.item_id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      const res: any = await sql.query(q, [...params, limit, offset]);
      const items = normalizeQueryResult(res);

      return NextResponse.json({
        ok: true,
        limit,
        offset,
        count: items.length,
        items,
      });
    } catch {
      // Intento 2: sin job (más compatible)
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
          i.mensaje_error,
          i.created_at,
          i.updated_at
        FROM app.item_seguimiento i
        JOIN app.proveedor p ON p.proveedor_id = i.proveedor_id
        ${whereSql}
        ORDER BY i.updated_at DESC, i.item_id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      const res: any = await sql.query(q, [...params, limit, offset]);
      const items = normalizeQueryResult(res);

      return NextResponse.json({
        ok: true,
        limit,
        offset,
        count: items.length,
        items,
      });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// ===== POST /api/items =====
// Acepta ambos formatos:
// - viejo:  { url, proveedor_codigo, seleccionado }
// - nuevo:  { urlOriginal, proveedorCodigo, seleccionado }
export async function POST(req: NextRequest) {
  try {
    const sql = db();
    const body = await req.json().catch(() => ({} as any));

    const urlRaw =
      typeof body?.url === "string"
        ? body.url.trim()
        : typeof body?.urlOriginal === "string"
        ? body.urlOriginal.trim()
        : typeof body?.url_original === "string"
        ? body.url_original.trim()
        : "";

    const proveedorCodigo =
      typeof body?.proveedor_codigo === "string"
        ? body.proveedor_codigo.trim()
        : typeof body?.proveedorCodigo === "string"
        ? body.proveedorCodigo.trim()
        : "";

    const seleccionado = body?.seleccionado === true || body?.seleccionado === "true";

    if (!urlRaw) return NextResponse.json({ ok: false, error: "url requerida" }, { status: 400 });
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

    // 1) resolver proveedor_id + motor_id (robusto: si no existe motor_id_default, usa motor_proveedor)
    let prov: any = null;

    // intento A: motor_id_default (si existe)
    try {
      const a: any = await sql.query(
        `
        SELECT proveedor_id, motor_id_default
        FROM app.proveedor
        WHERE codigo = $1
        LIMIT 1
        `,
        [proveedorCodigo]
      );
      const rowsA = normalizeQueryResult(a);
      prov = rowsA[0] ?? null;
    } catch {
      prov = null;
    }

    // intento B: fallback desde motor_proveedor
    if (!prov || !prov.motor_id_default) {
      const b: any = await sql.query(
        `
        SELECT p.proveedor_id,
               mp.motor_id AS motor_id_default
        FROM app.proveedor p
        LEFT JOIN LATERAL (
          SELECT motor_id
          FROM app.motor_proveedor
          WHERE proveedor_id = p.proveedor_id
          ORDER BY motor_id ASC
          LIMIT 1
        ) mp ON true
        WHERE p.codigo = $1
        LIMIT 1
        `,
        [proveedorCodigo]
      );
      const rowsB = normalizeQueryResult(b);
      prov = rowsB[0] ?? prov;
    }

    if (!prov?.proveedor_id) {
      return NextResponse.json(
        { ok: false, error: `proveedor inválido: ${proveedorCodigo}` },
        { status: 400 }
      );
    }
    if (!prov?.motor_id_default) {
      return NextResponse.json(
        { ok: false, error: `proveedor ${proveedorCodigo} no tiene motor asociado` },
        { status: 400 }
      );
    }

    // 2) dedupe por url_canonica
    const dupRes: any = await sql.query(
      `
      SELECT item_id
      FROM app.item_seguimiento
      WHERE url_canonica = $1
      LIMIT 1
      `,
      [urlCanonica]
    );
    const dupRows = normalizeQueryResult(dupRes);
    if (dupRows?.[0]?.item_id) {
      return NextResponse.json(
        { ok: false, error: "URL ya registrada", item_id: String(dupRows[0].item_id) },
        { status: 409 }
      );
    }

    // 3) insertar item
    const insItemRes: any = await sql.query(
      `
      INSERT INTO app.item_seguimiento
        (proveedor_id, motor_id, url_original, url_canonica, seleccionado, estado)
      VALUES
        ($1, $2, $3, $4, $5, 'PENDING_SCRAPE')
      RETURNING item_id
      `,
      [prov.proveedor_id, prov.motor_id_default, urlRaw, urlCanonica, seleccionado]
    );
    const insItemRows = normalizeQueryResult(insItemRes);
    const item_id = insItemRows?.[0]?.item_id;

    if (!item_id) {
      return NextResponse.json({ ok: false, error: "no se pudo crear item" }, { status: 500 });
    }

    // 4) insertar job (si la tabla permite)
    let job_id: any = null;
    try {
      const insJobRes: any = await sql.query(
        `
        INSERT INTO app.job
          (tipo, estado, item_id, proveedor_id, prioridad)
        VALUES
          ('SCRAPE_URL', 'PENDING', $1, $2, 0)
        RETURNING job_id
        `,
        [item_id, prov.proveedor_id]
      );
      const insJobRows = normalizeQueryResult(insJobRes);
      job_id = insJobRows?.[0]?.job_id ?? null;
    } catch {
      job_id = null;
    }

    return NextResponse.json(
      { ok: true, item_id: String(item_id), job_id: job_id ? String(job_id) : null },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}