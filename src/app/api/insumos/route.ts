import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

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

export async function GET(req: NextRequest) {
  try {
    const sql = db();
    const { searchParams } = new URL(req.url);

    const search = (searchParams.get("search") || "").trim();
    const tipo_uom = (searchParams.get("tipo_uom") || "").trim().toUpperCase();
    const activoRaw = (searchParams.get("activo") || "").trim();

    const limitRaw = Number(searchParams.get("limit") || 50);
    const offsetRaw = Number(searchParams.get("offset") || 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const where: string[] = [];
    const params: any[] = [];

    if (search) addWhere(where, params, `nombre ILIKE ?`, `%${search}%`);
    if (tipo_uom && ["GR", "ML", "UN"].includes(tipo_uom)) addWhere(where, params, `tipo_uom = ?`, tipo_uom);
    if (activoRaw === "true") addWhere(where, params, `activo = ?`, true);
    if (activoRaw === "false") addWhere(where, params, `activo = ?`, false);

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const q = `
      SELECT insumo_id, nombre, tipo_uom, densidad_g_ml, activo, notas, created_at, updated_at
      FROM app.insumo
      ${whereSql}
      ORDER BY updated_at DESC, insumo_id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const res: any = await sql.query(q, [...params, limit, offset]);
    const insumos = normalizeQueryResult(res);
    return NextResponse.json({ ok: true, limit, offset, count: insumos.length, insumos });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sql = db();
    const body = await req.json().catch(() => ({} as any));

    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    const tipo_uom = typeof body?.tipo_uom === "string" ? body.tipo_uom.trim().toUpperCase() : "";
    const densidad_g_ml = body?.densidad_g_ml === null || body?.densidad_g_ml === undefined ? null : Number(body.densidad_g_ml);
    const activo = body?.activo === false ? false : true;
    const notas = typeof body?.notas === "string" ? body.notas : null;

    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });
    if (!["GR", "ML", "UN"].includes(tipo_uom)) {
      return NextResponse.json({ ok: false, error: "tipo_uom inválido (GR|ML|UN)" }, { status: 422 });
    }
    if (densidad_g_ml !== null && (!Number.isFinite(densidad_g_ml) || densidad_g_ml <= 0)) {
      return NextResponse.json({ ok: false, error: "densidad_g_ml inválida" }, { status: 422 });
    }

    const r: any = await sql.query(
      `INSERT INTO app.insumo (nombre, tipo_uom, densidad_g_ml, activo, notas)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING insumo_id`,
      [nombre, tipo_uom, densidad_g_ml, activo, notas]
    );
    const insumo_id = normalizeQueryResult(r)?.[0]?.insumo_id;
    return NextResponse.json({ ok: true, insumo_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
