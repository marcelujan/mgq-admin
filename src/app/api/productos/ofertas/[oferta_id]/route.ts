import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(_: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id: oferta_idStr } = await ctx.params;

    const sql = db();
    const oferta_id = Number(oferta_idStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const oRes: any = await sql.query(
      `SELECT oferta_id, producto_id, nombre,
              peso_neto_g, volumen_neto_ml, unidades_pack,
              masa_por_unidad_g, volumen_por_unidad_ml,
              densidad_override_g_ml, merma_pct, is_bulk, activo, created_at, updated_at
       FROM app.producto_oferta
       WHERE oferta_id=$1
       LIMIT 1`,
      [oferta_id]
    );
    const oferta = normalizeQueryResult(oRes)?.[0];
    if (!oferta) return NextResponse.json({ ok: false, error: "no encontrada" }, { status: 404 });

    const eRes: any = await sql.query(
      `SELECT extra_id, oferta_id, tipo, insumo_id, cantidad, concepto, costo_ars, orden
       FROM app.producto_oferta_extra
       WHERE oferta_id=$1
       ORDER BY orden ASC, extra_id ASC`,
      [oferta_id]
    );
    const extras = normalizeQueryResult(eRes);

    return NextResponse.json({ ok: true, oferta, extras });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    
    const { oferta_id: oferta_idStr } = await ctx.params;
const sql = db();
    const oferta_id = Number(oferta_idStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const sets: string[] = [];
    const params: any[] = [];
    const pushSet = (frag: string, v: any) => {
      params.push(v);
      sets.push(frag.replace("?", `$${params.length}`));
    };

    if (typeof body?.nombre === "string") pushSet("nombre = ?", body.nombre.trim());
    if (body?.activo !== undefined) pushSet("activo = ?", body.activo === true);

    const pick = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
    if (body?.peso_neto_g !== undefined) pushSet("peso_neto_g = ?", pick(body.peso_neto_g));
    if (body?.volumen_neto_ml !== undefined) pushSet("volumen_neto_ml = ?", pick(body.volumen_neto_ml));
    if (body?.unidades_pack !== undefined) pushSet("unidades_pack = ?", pick(body.unidades_pack));
    if (body?.masa_por_unidad_g !== undefined) pushSet("masa_por_unidad_g = ?", pick(body.masa_por_unidad_g));
    if (body?.volumen_por_unidad_ml !== undefined) pushSet("volumen_por_unidad_ml = ?", pick(body.volumen_por_unidad_ml));
    if (body?.densidad_override_g_ml !== undefined) pushSet("densidad_override_g_ml = ?", pick(body.densidad_override_g_ml));
    if (body?.merma_pct !== undefined) pushSet("merma_pct = ?", pick(body.merma_pct));

    if (!sets.length) return NextResponse.json({ ok: false, error: "sin cambios" }, { status: 400 });
    sets.push("updated_at = now()");

    params.push(oferta_id);
    const q = `UPDATE app.producto_oferta SET ${sets.join(", ")} WHERE oferta_id = $${params.length}`;
    await sql.query(q, params);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
