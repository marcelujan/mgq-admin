import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeQueryResult, numOrNull } from "@/lib/api";
import { recalcAndInsertOfertaSnapshot } from "@/lib/ofertaSnapshots";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ oferta_id: string; oferta_packaging_id: string }> }) {
  try {
    const { oferta_id: ofertaIdStr, oferta_packaging_id: opIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
    const oferta_packaging_id = Number(opIdStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });
    if (!Number.isFinite(oferta_packaging_id)) return NextResponse.json({ ok: false, error: "oferta_packaging_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const cantidad = body.hasOwnProperty("cantidad") ? numOrNull(body?.cantidad) : undefined;
    const costo_unitario_override_ars = body.hasOwnProperty("costo_unitario_override_ars") ? numOrNull(body?.costo_unitario_override_ars) : undefined;

    const sql = db();

    const r: any = await sql.query(
      `
      UPDATE app.oferta_packaging
      SET
        cantidad = COALESCE($3, cantidad),
        costo_unitario_override_ars = COALESCE($4, costo_unitario_override_ars)
      WHERE oferta_id=$1 AND oferta_packaging_id=$2
      RETURNING oferta_packaging_id
      `,
      [
        oferta_id,
        oferta_packaging_id,
        cantidad === undefined ? null : cantidad,
        costo_unitario_override_ars === undefined ? null : costo_unitario_override_ars,
      ]
    );

    const rows = normalizeQueryResult(r);
    if (!rows?.length) return NextResponse.json({ ok: false, error: "registro no encontrado" }, { status: 404 });

    // snapshot automático
    await recalcAndInsertOfertaSnapshot({ oferta_id, fuente: "PACKAGING_PATCH" });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, ctx: { params: Promise<{ oferta_id: string; oferta_packaging_id: string }> }) {
  try {
    const { oferta_id: ofertaIdStr, oferta_packaging_id: opIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
    const oferta_packaging_id = Number(opIdStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });
    if (!Number.isFinite(oferta_packaging_id)) return NextResponse.json({ ok: false, error: "oferta_packaging_id inválido" }, { status: 400 });

    const sql = db();

    const r: any = await sql.query(
      `
      DELETE FROM app.oferta_packaging
      WHERE oferta_id=$1 AND oferta_packaging_id=$2
      RETURNING oferta_packaging_id
      `,
      [oferta_id, oferta_packaging_id]
    );

    const rows = normalizeQueryResult(r);
    if (!rows?.length) return NextResponse.json({ ok: false, error: "registro no encontrado" }, { status: 404 });

    // snapshot automático
    await recalcAndInsertOfertaSnapshot({ oferta_id, fuente: "PACKAGING_DELETE" });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}