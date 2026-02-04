import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(_req: NextRequest, { params }: { params: { oferta_id: string } }) {
  try {
    const oferta_id = Number(params.oferta_id);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const sql = db();
    const r: any = await sql.query(
      `
      SELECT
        op.oferta_packaging_id,
        op.oferta_id,
        op.packaging_item_id,
        op.cantidad::float8 as cantidad,
        op.costo_unitario_override_ars::float8 as costo_unitario_override_ars,
        pi.nombre,
        pi.unidad,
        pi.costo_unitario_ars::float8 as costo_unitario_ars
      FROM app.producto_oferta_packaging op
      JOIN app.packaging_item pi ON pi.packaging_item_id = op.packaging_item_id
      WHERE op.oferta_id = $1
      ORDER BY pi.nombre ASC, op.oferta_packaging_id ASC
      `,
      [oferta_id]
    );

    return NextResponse.json({ ok: true, rows: normalizeQueryResult(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { oferta_id: string } }) {
  try {
    const oferta_id = Number(params.oferta_id);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const packaging_item_id = Number(body?.packaging_item_id);
    const cantidad = numOrNull(body?.cantidad);
    const costo_unitario_override_ars = numOrNull(body?.costo_unitario_override_ars);

    if (!Number.isFinite(packaging_item_id)) {
      return NextResponse.json({ ok: false, error: "packaging_item_id inválido" }, { status: 400 });
    }
    if (cantidad === null || cantidad <= 0) return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 422 });
    if (costo_unitario_override_ars !== null && costo_unitario_override_ars < 0) {
      return NextResponse.json({ ok: false, error: "override inválido" }, { status: 422 });
    }

    const sql = db();

    await sql.query(
      `
      INSERT INTO app.producto_oferta_packaging (oferta_id, packaging_item_id, cantidad, costo_unitario_override_ars)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (oferta_id, packaging_item_id)
      DO UPDATE SET
        cantidad = app.producto_oferta_packaging.cantidad + excluded.cantidad,
        costo_unitario_override_ars = coalesce(excluded.costo_unitario_override_ars, app.producto_oferta_packaging.costo_unitario_override_ars),
        updated_at = now()
      `,
      [oferta_id, packaging_item_id, cantidad, costo_unitario_override_ars]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
