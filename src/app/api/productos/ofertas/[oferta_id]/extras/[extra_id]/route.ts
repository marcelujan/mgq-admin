import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ oferta_id: string; extra_id: string }> }) {
  try {
    const sql = db();
    const { oferta_id: ofertaIdStr, extra_id: extraIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
    const extra_id = Number(extraIdStr);
    if (!Number.isFinite(oferta_id) || !Number.isFinite(extra_id)) return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });

    const oRes: any = await sql.query(`SELECT is_bulk FROM app.producto_oferta WHERE oferta_id=$1 LIMIT 1`, [oferta_id]);
    const oferta = (Array.isArray(oRes?.rows) ? oRes.rows : [])?.[0];
    if (!oferta) return NextResponse.json({ ok: false, error: "oferta no encontrada" }, { status: 404 });
    if (oferta.is_bulk === true) return NextResponse.json({ ok: false, error: "No se permiten extras en ofertas BULK" }, { status: 422 });

    const body = await req.json().catch(() => ({} as any));
    const sets: string[] = [];
    const params: any[] = [];
    const pushSet = (frag: string, v: any) => {
      params.push(v);
      sets.push(frag.replace("?", `$${params.length}`));
    };

    if (body?.cantidad !== undefined) {
      const c = body.cantidad === null ? null : Number(body.cantidad);
      if (c !== null && (!Number.isFinite(c) || c < 0)) return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 422 });
      pushSet("cantidad = ?", c);
    }
    if (body?.concepto !== undefined) pushSet("concepto = ?", typeof body.concepto === "string" ? body.concepto : null);
    if (body?.costo_ars !== undefined) {
      const c = body.costo_ars === null ? null : Number(body.costo_ars);
      if (c !== null && (!Number.isFinite(c) || c < 0)) return NextResponse.json({ ok: false, error: "costo_ars inválido" }, { status: 422 });
      pushSet("costo_ars = ?", c);
    }
    if (body?.orden !== undefined) {
      const o = Number(body.orden);
      if (!Number.isFinite(o)) return NextResponse.json({ ok: false, error: "orden inválido" }, { status: 422 });
      pushSet("orden = ?", o);
    }

    if (!sets.length) return NextResponse.json({ ok: false, error: "sin cambios" }, { status: 400 });

    params.push(oferta_id);
    params.push(extra_id);
    const q = `UPDATE app.producto_oferta_extra SET ${sets.join(", ")} WHERE oferta_id=$${params.length - 1} AND extra_id=$${params.length}`;
    await sql.query(q, params);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ oferta_id: string; extra_id: string }> }) {
  try {
    const sql = db();
    const { oferta_id: ofertaIdStr, extra_id: extraIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
    const extra_id = Number(extraIdStr);
    if (!Number.isFinite(oferta_id) || !Number.isFinite(extra_id)) return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });

    await sql.query(`DELETE FROM app.producto_oferta_extra WHERE oferta_id=$1 AND extra_id=$2`, [oferta_id, extra_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
