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
        e.item_envase_id,
        e.nombre,
        e.descripcion,
        e.activo,
        e.created_at,
        e.updated_at
      FROM app.item_envase e
      WHERE (
        $1::text = '' OR
        coalesce(e.nombre,'') ILIKE '%' || $1::text || '%' OR
        coalesce(e.descripcion,'') ILIKE '%' || $1::text || '%'
      )
      ORDER BY e.nombre ASC, e.item_envase_id ASC
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
      INSERT INTO app.item_envase (nombre, descripcion)
      VALUES ($1, $2)
      RETURNING item_envase_id
      `,
      [nombre, descripcion || null]
    );

    const item_envase_id = normalizeQueryResult(r)?.[0]?.item_envase_id;
    return NextResponse.json({ ok: true, item_envase_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
