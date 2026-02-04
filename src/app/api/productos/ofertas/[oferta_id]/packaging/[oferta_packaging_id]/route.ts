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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { oferta_id: string; oferta_packaging_id: string } }
) {
  try {
    const oferta_id = Number(params.oferta_id);
    const oferta_packaging_id = Number(params.oferta_packaging_id);
    if (!Number.isFinite(oferta_id) || !Number.isFinite(oferta_packaging_id)) {
      return NextResponse.json({ ok: false, error: "ids inválidos" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    const hasCantidad = Object.prototype.hasOwnProperty.call(body, "cantidad");
    const cantidad = numOrNull(body?.cantidad);
    if (hasCantidad && (cantidad === null || cantidad <= 0)) return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 422 });

    const hasOverride = Object.prototype.hasOwnProperty.call(body, "costo_unitario_override_ars");
    const costo_unitario_override_ars = hasOverride ? numOrNull(body?.costo_unitario_override_ars) : null;
    if (hasOverride && costo_unitario_override_ars !== null && costo_unitario_override_ars < 0) {
      return NextResponse.json({ ok: false, error: "override inválido" }, { status: 422 });
    }

    const sql = db();

    const r: any = await sql.query(
      `
      UPDATE app.producto_oferta_packaging
      SET
        cantidad = CASE WHEN $1::boolean THEN $2 ELSE cantidad END,
        costo_unitario_override_ars = CASE WHEN $3::boolean THEN $4 ELSE costo_unitario_override_ars END,
        updated_at = now()
      WHERE oferta_packaging_id = $5 AND oferta_id = $6
      RETURNING oferta_packaging_id
      `,
      [hasCantidad, cantidad, hasOverride, costo_unitario_override_ars, oferta_packaging_id, oferta_id]
    );

    const rows = normalizeQueryResult(r);
    if (!rows.length) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { oferta_id: string; oferta_packaging_id: string } }
) {
  try {
    const oferta_id = Number(params.oferta_id);
    const oferta_packaging_id = Number(params.oferta_packaging_id);
    if (!Number.isFinite(oferta_id) || !Number.isFinite(oferta_packaging_id)) {
      return NextResponse.json({ ok: false, error: "ids inválidos" }, { status: 400 });
    }

    const sql = db();
    await sql.query(`DELETE FROM app.producto_oferta_packaging WHERE oferta_packaging_id = $1 AND oferta_id = $2`, [
      oferta_packaging_id,
      oferta_id,
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
