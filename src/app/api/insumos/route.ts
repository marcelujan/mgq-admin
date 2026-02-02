import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const sql = db();
    const { searchParams } = new URL(req.url);

    const search = (searchParams.get("search") || "").trim();
    const tipo_uom = (searchParams.get("tipo_uom") || "").trim().toUpperCase();
    const activoRaw = (searchParams.get("activo") || "").trim();

    const limitRaw = Number(searchParams.get("limit") || 100);
    const offsetRaw = Number(searchParams.get("offset") || 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const where: string[] = [];
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`nombre ILIKE $${params.length}`);
    }
    if (tipo_uom && ["GR", "ML", "UN"].includes(tipo_uom)) {
      params.push(tipo_uom);
      where.push(`tipo_uom = $${params.length}`);
    }
    if (activoRaw === "true" || activoRaw === "false") {
      params.push(activoRaw === "true");
      where.push(`activo = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const q = `
      SELECT insumo_id, nombre, tipo_uom, densidad_g_ml, activo, notas, created_at, updated_at
      FROM app.insumo
      ${whereSql}
      ORDER BY updated_at DESC, insumo_id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const r: any = await sql.query(q, [...params, limit, offset]);

    return NextResponse.json({ ok: true, limit, offset, count: rows(r).length, insumos: rows(r) });
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
    const densidad_g_ml =
      body?.densidad_g_ml === null || body?.densidad_g_ml === undefined ? null : Number(body.densidad_g_ml);
    const activo = body?.activo === false ? false : true;
    const notas = typeof body?.notas === "string" ? body.notas : null;

    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });
    if (!["GR", "ML", "UN"].includes(tipo_uom)) {
      return NextResponse.json({ ok: false, error: "tipo_uom inválido (GR|ML|UN)" }, { status: 422 });
    }
    if (densidad_g_ml !== null && (!Number.isFinite(densidad_g_ml) || densidad_g_ml <= 0)) {
      return NextResponse.json({ ok: false, error: "densidad_g_ml inválida" }, { status: 422 });
    }

    const q = `
      INSERT INTO app.insumo (nombre, tipo_uom, densidad_g_ml, activo, notas)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING insumo_id
    `;
    const r: any = await sql.query(q, [nombre, tipo_uom, densidad_g_ml, activo, notas]);
    const insumo_id = rows(r)?.[0]?.insumo_id;

    return NextResponse.json({ ok: true, insumo_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
