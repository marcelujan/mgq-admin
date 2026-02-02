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
    const activoRaw = (searchParams.get("activo") || "").trim();

    const limitRaw = Number(searchParams.get("limit") || 50);
    const offsetRaw = Number(searchParams.get("offset") || 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const where: string[] = [];
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`nombre ILIKE $${params.length}`);
    }
    if (activoRaw === "true" || activoRaw === "false") {
      params.push(activoRaw === "true");
      where.push(`activo = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const q = `
      SELECT producto_id, nombre, descripcion, categoria, activo, densidad_producto_g_ml, created_at, updated_at
      FROM app.producto
      ${whereSql}
      ORDER BY updated_at DESC, producto_id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const r: any = await sql.query(q, [...params, limit, offset]);

    return NextResponse.json({ ok: true, limit, offset, count: rows(r).length, productos: rows(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

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
      `INSERT INTO app.producto (nombre, descripcion, categoria, activo, densidad_producto_g_ml)
       VALUES ($1,$2,$3,$4,$5) RETURNING producto_id`,
      [nombre, descripcion, categoria, activo, densidad_producto_g_ml]
    );
    return NextResponse.json({ ok: true, producto_id: rows(r)?.[0]?.producto_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
