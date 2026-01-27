import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ===== util: canonicalizar URL =====
function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(String(raw ?? "").trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();

    // normalizar pathname (sin trailing slash salvo "/")
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }

    // opcional: limpiar params vacíos (no tocamos tracking agresivo por ahora)
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

    // Intento 1: con último job si existe app.job
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

      return NextResponse.json({ ok: true, limit, offset, count: items.length, items });
    } catch {
      // Intento 2: sin app.job
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

      const res: any = await sql.query(q, [...params, limit, offset]);
      const items = normalizeQueryResult(res);

      return NextResponse.json({ ok: true, limit, offset, count: items.length, items });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// ===== POST /api/items =====
//
// Acepta formatos:
// - { url, proveedor_codigo, seleccionado }
// - { urlOriginal, proveedorCodigo, seleccionado }
// - { url_original, proveedor_id, motor_id, seleccionado }
//
// Importante:
// - En tu DB, app.proveedor tiene motor_id_default.
// - app.motor_proveedor NO tiene proveedor_id (según tu screenshot), así que no se usa como fallback.
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

    const proveedorId =
      body?.proveedor_id !== undefined && body?.proveedor_id !== null
        ? Number(body.proveedor_id)
        : null;

    const motorIdOverride =
      body?.motor_id !== undefined && body?.motor_id !== null ? Number(body.motor_id) : null;

    const seleccionado = body?.seleccionado === true || body?.seleccionado === "true";

    if (!urlRaw) return NextResponse.json({ ok: false, error: "url requerida" }, { status: 400 });

    const urlCanonica = canonicalizeUrl(urlRaw);
    if (!urlCanonica) {
      return NextResponse.json({ ok: false, error: "URL inválida" }, { status: 400 });
    }

    // 1) Resolver proveedor_id + motor_id_default desde app.proveedor
    //    Permitimos que el cliente mande proveedor_id directamente (más simple para la UI).
    let provRow: any = null;

    if (Number.isFinite(proveedorId) && (proveedorId as number) > 0) {
      const r: any = await sql.query(
        `
        SELECT proveedor_id, motor_id_default, codigo, nombre, activo
        FROM app.proveedor
        WHERE proveedor_id = $1
        LIMIT 1
        `,
        [proveedorId]
      );
      provRow = normalizeQueryResult(r)[0] ?? null;
    } else {
      if (!proveedorCodigo) {
        return NextResponse.json(
          { ok: false, error: "proveedor_id o proveedor_codigo requerido" },
          { status: 400 }
        );
      }

      const r: any = await sql.query(
        `
        SELECT proveedor_id, motor_id_default, codigo, nombre, activo
        FROM app.proveedor
        WHERE codigo = $1
        LIMIT 1
        `,
        [proveedorCodigo]
      );
      provRow = normalizeQueryResult(r)[0] ?? null;
    }

    if (!provRow?.proveedor_id) {
      return NextResponse.json({ ok: false, error: "proveedor no encontrado" }, { status: 400 });
    }
    if (provRow.activo === false) {
      return NextResponse.json({ ok: false, error: "proveedor inactivo" }, { status: 400 });
    }

    const proveedor_id = Number(provRow.proveedor_id);

    // motor_id: viene de override o del proveedor.motor_id_default
    const motor_id =
      Number.isFinite(motorIdOverride as any) && (motorIdOverride as number) > 0
        ? Number(motorIdOverride)
        : provRow.motor_id_default !== null && provRow.motor_id_default !== undefined
        ? Number(provRow.motor_id_default)
        : NaN;

    if (!Number.isFinite(motor_id) || motor_id <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "motor_id no disponible. Seteá motor_id_default en app.proveedor o mandá motor_id.",
        },
        { status: 400 }
      );
    }

    // 2) Insert idempotente: si ya existe la canónica, devolvemos el item existente.
    //    Si no existe, insertamos y devolvemos el nuevo.
    const ins: any = await sql.query(
      `
      INSERT INTO app.item_seguimiento
        (proveedor_id, motor_id, url_original, url_canonica, seleccionado, estado)
      VALUES
        ($1, $2, $3, $4, $5, 'PENDING_SCRAPE')
      ON CONFLICT (url_canonica)
      DO UPDATE SET
        proveedor_id = EXCLUDED.proveedor_id,
        motor_id     = EXCLUDED.motor_id,
        url_original = EXCLUDED.url_original,
        seleccionado = EXCLUDED.seleccionado,
        updated_at   = now()
      RETURNING item_id, proveedor_id, motor_id, url_original, url_canonica, seleccionado, estado::text as estado;
      `,
      [proveedor_id, motor_id, urlRaw, urlCanonica, seleccionado]
    );

    const row = normalizeQueryResult(ins)[0] ?? null;

    if (!row?.item_id) {
      return NextResponse.json(
        { ok: false, error: "no se pudo crear/actualizar el item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, item: row });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
