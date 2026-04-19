import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type Ctx = { params: Promise<{ item_comercial_id: string; item_comercial_etiqueta_id: string }> };

export async function GET(_: NextRequest, { params }: Ctx) {
  try {
    const { item_comercial_id: itemComercialIdStr } = await params;
    const item_comercial_id = Number(itemComercialIdStr);
    if (!Number.isFinite(item_comercial_id) || item_comercial_id <= 0) {
      return NextResponse.json({ ok: false, error: "item_comercial_id inválido" }, { status: 400 });
    }

    const sql = db();
    const r: any = await sql.query(
      `
      SELECT
        r.item_comercial_etiqueta_id,
        r.item_comercial_id,
        r.item_etiqueta_id,
        r.cantidad::float8 as cantidad,
        r.obligatorio,
        e.nombre,
        e.uom,
        e.cantidad_referencia::float8 as cantidad_referencia,
        e.costo_ars::float8 as costo_ars,
        e.ancho_mm,
        e.largo_mm,
        e.activo
      FROM app.item_comercial_etiqueta r
      JOIN app.item_etiqueta e ON e.item_etiqueta_id = r.item_etiqueta_id
      WHERE r.item_comercial_id = $1
      ORDER BY e.nombre ASC, r.item_comercial_etiqueta_id ASC
      `,
      [item_comercial_id]
    );

    return NextResponse.json({ ok: true, items: rowsOf(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { item_comercial_id: itemComercialIdStr } = await params;
    const item_comercial_id = Number(itemComercialIdStr);
    if (!Number.isFinite(item_comercial_id) || item_comercial_id <= 0) {
      return NextResponse.json({ ok: false, error: "item_comercial_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const item_etiqueta_id = numOrNull(body?.item_etiqueta_id);
    const cantidad = numOrNull(body?.cantidad);
    const obligatorio = body?.obligatorio === false ? false : true;

    if (!Number.isFinite(item_etiqueta_id as number) || Number(item_etiqueta_id) <= 0) {
      return NextResponse.json({ ok: false, error: "item_etiqueta_id inválido" }, { status: 422 });
    }
    if (!Number.isFinite(cantidad as number) || Number(cantidad) <= 0) {
      return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 422 });
    }

    const sql = db();
    const r: any = await sql.query(
      `
      INSERT INTO app.item_comercial_etiqueta (item_comercial_id, item_etiqueta_id, cantidad, obligatorio)
      VALUES ($1, $2, $3, $4)
      RETURNING item_comercial_etiqueta_id
      `,
      [item_comercial_id, item_etiqueta_id, cantidad, obligatorio]
    );

    return NextResponse.json({ ok: true, item_comercial_etiqueta_id: rowsOf(r)?.[0]?.item_comercial_etiqueta_id }, { status: 201 });
  } catch (e: any) {
    const msg = String(e?.message ?? "error");
    if (msg.includes("item_comercial_etiqueta_unique")) {
      return NextResponse.json({ ok: false, error: "la etiqueta ya está asociada" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
