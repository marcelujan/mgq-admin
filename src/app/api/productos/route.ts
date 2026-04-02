import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

// Helper: agrega cláusulas con placeholders correctos ($1..$n)
function addWhere(where: string[], params: any[], clause: string, values?: any | any[]) {
  if (values === undefined) {
    where.push(clause);
    return;
  }
  const vs = Array.isArray(values) ? values : [values];
  for (const v of vs) params.push(v);
  let i = params.length - vs.length + 1;
  const replaced = clause.replace(/\?/g, () => `$${i++}`);
  where.push(replaced);
}

// GET /api/productos
export async function GET(req: NextRequest) {
  try {
    const sql = db();
    const { searchParams } = new URL(req.url);

    const search = (searchParams.get("search") || "").trim();
    const activoRaw = (searchParams.get("activo") || "").trim();

    const limitRaw = Number(searchParams.get("limit") || 50);
    const offsetRaw = Number(searchParams.get("offset") || 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const where: string[] = [];
    const params: any[] = [];

    if (search) addWhere(where, params, `p.nombre ILIKE ?`, `%${search}%`);
    if (activoRaw === "true") addWhere(where, params, `p.activo = ?`, true);
    if (activoRaw === "false") addWhere(where, params, `p.activo = ?`, false);

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Además de los datos del producto, devolvemos flags para UI:
    // - tiene_base: presencia de producto_base
    // - tiene_formula: presencia de líneas de fórmula v2 (estado operativo real del editor)
    const q = `
      SELECT
        p.producto_id,
        p.nombre,
        p.descripcion,
        p.categoria,
        p.densidad_producto_g_ml,
        p.activo,
        p.created_at,
        p.updated_at,
        (pb.producto_id IS NOT NULL) AS tiene_base,
        EXISTS (
          SELECT 1
          FROM app.producto_formula_linea_v2 pfl2
          WHERE pfl2.producto_id = p.producto_id
        ) AS tiene_formula
      FROM app.producto p
      LEFT JOIN app.producto_base pb ON pb.producto_id = p.producto_id
      ${whereSql}
      ORDER BY p.updated_at DESC, p.producto_id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const res: any = await sql.query(q, [...params, limit, offset]);
    const productos = normalizeQueryResult(res);

    return NextResponse.json({ ok: true, limit, offset, count: productos.length, productos });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// POST /api/productos
export async function POST(req: NextRequest) {
  try {
    const sql = db();
    const body = await req.json().catch(() => ({} as any));

    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    const descripcion = typeof body?.descripcion === "string" ? body.descripcion : null;
    const categoria = typeof body?.categoria === "string" ? body.categoria : null;
    const activo = body?.activo === false ? false : true;
    const densidad_producto_g_ml =
      body?.densidad_producto_g_ml === null || body?.densidad_producto_g_ml === undefined
        ? null
        : Number(body.densidad_producto_g_ml);

    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });
    if (densidad_producto_g_ml !== null && (!Number.isFinite(densidad_producto_g_ml) || densidad_producto_g_ml <= 0)) {
      return NextResponse.json({ ok: false, error: "densidad_producto_g_ml inválida" }, { status: 422 });
    }

    const r: any = await sql.query(
      `INSERT INTO app.producto (nombre, descripcion, categoria, densidad_producto_g_ml, activo)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING producto_id`,
      [nombre, descripcion, categoria, densidad_producto_g_ml, activo]
    );
    const producto_id = normalizeQueryResult(r)?.[0]?.producto_id;
    return NextResponse.json({ ok: true, producto_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
