import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const sql = db();
    const { oferta_id: ofertaIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const oRes: any = await sql.query(`SELECT * FROM app.producto_oferta WHERE oferta_id=$1 LIMIT 1`, [oferta_id]);
    const oferta = rows(oRes)?.[0];
    if (!oferta) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });

    const eRes: any = await sql.query(
      `SELECT * FROM app.producto_oferta_extra WHERE oferta_id=$1 ORDER BY orden ASC, extra_id ASC`,
      [oferta_id]
    );
    return NextResponse.json({ ok: true, oferta, extras: rows(eRes) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const sql = db();
    const { oferta_id: ofertaIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    const sets: string[] = [];
    const params: any[] = [];
    const pushSet = (frag: string, v: any) => {
      params.push(v);
      sets.push(frag.replace("?", `$${params.length}`));
    };

    const numericField = (key: string) => {
      if (body?.[key] !== undefined) {
        const v = body[key] === null ? null : Number(body[key]);
        if (v !== null && !Number.isFinite(v)) throw new Error(`${key} inválido`);
        pushSet(`${key} = ?`, v);
      }
    };

    if (typeof body?.nombre === "string") pushSet("nombre = ?", body.nombre.trim());
    if (body?.activo !== undefined) pushSet("activo = ?", body.activo === true);
    if (body?.is_bulk !== undefined) pushSet("is_bulk = ?", body.is_bulk === true);

    numericField("peso_neto_g");
    numericField("volumen_neto_ml");
    numericField("unidades_pack");
    numericField("masa_por_unidad_g");
    numericField("volumen_por_unidad_ml");
    numericField("densidad_override_g_ml");
    numericField("merma_pct");

    if (!sets.length) return NextResponse.json({ ok: false, error: "sin cambios" }, { status: 400 });

    // si pasa a BULK, borrar extras para evitar doble conteo
    if (body?.is_bulk === true) {
      await sql.query(`DELETE FROM app.producto_oferta_extra WHERE oferta_id=$1`, [oferta_id]);
    }

    sets.push("updated_at = now()");
    params.push(oferta_id);

    await sql.query(`UPDATE app.producto_oferta SET ${sets.join(", ")} WHERE oferta_id=$${params.length}`, params);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message ?? "error";
    const status = /inválido/.test(msg) ? 422 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
