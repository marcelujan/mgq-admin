import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ oferta_id: string; extra_id: string }> }) {
  try {
    const { oferta_id: oferta_idStr, extra_id: extra_idStr } = await ctx.params;

    const sql = db();
    const oferta_id = Number(oferta_idStr);
    const extra_id = Number(extra_idStr);
    if (!Number.isFinite(oferta_id) || !Number.isFinite(extra_id)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const sets: string[] = [];
    const params: any[] = [];
    const pushSet = (frag: string, v: any) => {
      params.push(v);
      sets.push(frag.replace("?", `$${params.length}`));
    };

    if (body?.orden !== undefined) {
      const o = Number(body.orden);
      if (!Number.isFinite(o)) return NextResponse.json({ ok: false, error: "orden inválido" }, { status: 422 });
      pushSet("orden = ?", o);
    }
    if (body?.cantidad !== undefined) {
      const c = body.cantidad === null || body.cantidad === "" ? null : Number(body.cantidad);
      if (c !== null && (!Number.isFinite(c) || c < 0)) return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 422 });
      pushSet("cantidad = ?", c);
    }
    if (body?.concepto !== undefined) pushSet("concepto = ?", typeof body.concepto === "string" ? body.concepto : null);
    if (body?.costo_ars !== undefined) {
      const v = body.costo_ars === null || body.costo_ars === "" ? null : Number(body.costo_ars);
      if (v !== null && (!Number.isFinite(v) || v < 0)) return NextResponse.json({ ok: false, error: "costo_ars inválido" }, { status: 422 });
      pushSet("costo_ars = ?", v);
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

export async function DELETE(_: NextRequest, ctx: { params: Promise<{ oferta_id: string; extra_id: string }> }) {
  try {
    const sql = db();
    const oferta_id = Number(oferta_idStr);
    const extra_id = Number(extra_idStr);
    if (!Number.isFinite(oferta_id) || !Number.isFinite(extra_id)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }
    await sql.query(`DELETE FROM app.producto_oferta_extra WHERE oferta_id=$1 AND extra_id=$2`, [oferta_id, extra_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
