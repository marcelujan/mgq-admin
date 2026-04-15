import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") ?? "").trim();
    const sql = db();

    const r: any = await sql.query(
      `
      SELECT
        p.item_paqueteria_id,
        p.nombre,
        p.descripcion,
        p.activo,
        p.created_at,
        p.updated_at
      FROM app.item_paqueteria p
      WHERE (
        $1::text = '' OR
        coalesce(p.nombre,'') ILIKE '%' || $1::text || '%' OR
        coalesce(p.descripcion,'') ILIKE '%' || $1::text || '%'
      )
      ORDER BY p.nombre ASC, p.item_paqueteria_id ASC
      `,
      [search]
    );

    return NextResponse.json({ ok: true, items: normalizeQueryResult(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : "";

    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });

    const sql = db();
    const r: any = await sql.query(
      `
      INSERT INTO app.item_paqueteria (nombre, descripcion)
      VALUES ($1, $2)
      RETURNING item_paqueteria_id
      `,
      [nombre, descripcion || null]
    );

    const item_paqueteria_id = normalizeQueryResult(r)?.[0]?.item_paqueteria_id;
    return NextResponse.json({ ok: true, item_paqueteria_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
