import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ insumo_id: string; fuente_id: string }> }) {
  try {
    const { insumo_id: insumo_idStr, fuente_id: fuente_idStr } = await ctx.params;

    const sql = db();
    const insumo_id = Number(insumo_idStr);
    const fuente_id = Number(fuente_idStr);
    if (!Number.isFinite(insumo_id) || !Number.isFinite(fuente_id)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const sets: string[] = [];
    const params: any[] = [];
    const pushSet = (frag: string, v: any) => {
      params.push(v);
      sets.push(frag.replace("?", `$${params.length}`));
    };

    if (body?.habilitada !== undefined) pushSet("habilitada = ?", body.habilitada === true);
    if (body?.prioridad !== undefined) {
      const p = Number(body.prioridad);
      if (!Number.isFinite(p)) return NextResponse.json({ ok: false, error: "prioridad inválida" }, { status: 422 });
      pushSet("prioridad = ?", p);
    }
    if (body?.costo_por_uom_ars !== undefined) {
      const c = Number(body.costo_por_uom_ars);
      if (!Number.isFinite(c) || c < 0) return NextResponse.json({ ok: false, error: "costo_por_uom_ars inválido" }, { status: 422 });
      pushSet("costo_por_uom_ars = ?", c);
    }
    if (body?.vigente_desde !== undefined) pushSet("vigente_desde = ?", typeof body.vigente_desde === "string" ? body.vigente_desde : null);
    if (body?.presentacion_preferida !== undefined) {
      const pref = Number(body.presentacion_preferida);
      if (!Number.isFinite(pref) || pref <= 0) return NextResponse.json({ ok: false, error: "presentacion_preferida inválida" }, { status: 422 });
      pushSet("presentacion_preferida = ?", pref);
    }

    if (body?.oferta_id !== undefined) {
      const oid = body.oferta_id === null ? null : Number(body.oferta_id);
      if (oid !== null && (!Number.isFinite(oid) || oid <= 0)) {
        return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 422 });
      }
      pushSet("oferta_id = ?", oid);
    }

    if (!sets.length) return NextResponse.json({ ok: false, error: "sin cambios" }, { status: 400 });

    params.push(insumo_id);
    params.push(fuente_id);
    const q = `UPDATE app.insumo_fuente SET ${sets.join(", ")} WHERE insumo_id=$${params.length - 1} AND fuente_id=$${params.length}`;
    await sql.query(q, params);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, ctx: { params: Promise<{ insumo_id: string; fuente_id: string }> }) {
  try {
    
    const { fuente_id: fuente_idStr, insumo_id: insumo_idStr } = await ctx.params;
const sql = db();
    const insumo_id = Number(insumo_idStr);
    const fuente_id = Number(fuente_idStr);
    if (!Number.isFinite(insumo_id) || !Number.isFinite(fuente_id)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }
    await sql.query(`DELETE FROM app.insumo_fuente WHERE insumo_id=$1 AND fuente_id=$2`, [insumo_id, fuente_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
