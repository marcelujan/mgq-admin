import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeQueryResult, numOrNull } from "@/lib/api";
import { recalcAndInsertOfertaSnapshot } from "@/lib/ofertaSnapshots";

export async function GET(_: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id: ofertaIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
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
      FROM app.oferta_packaging op
      JOIN app.packaging_item pi ON pi.packaging_item_id = op.packaging_item_id
      WHERE op.oferta_id=$1
      ORDER BY op.oferta_packaging_id ASC
      `,
      [oferta_id]
    );

    return NextResponse.json({ ok: true, rows: normalizeQueryResult(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id: ofertaIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const packaging_item_id = Number(body?.packaging_item_id);
    const cantidad = numOrNull(body?.cantidad);

    if (!Number.isFinite(packaging_item_id)) return NextResponse.json({ ok: false, error: "packaging_item_id inválido" }, { status: 400 });
    if (!cantidad || cantidad <= 0) return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 400 });

    const sql = db();

    await sql.query(
      `
      INSERT INTO app.oferta_packaging (oferta_id, packaging_item_id, cantidad)
      VALUES ($1, $2, $3)
      `,
      [oferta_id, packaging_item_id, cantidad]
    );

    // snapshot automático de la oferta
    await recalcAndInsertOfertaSnapshot({ oferta_id, fuente: "PACKAGING_ADD" });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}