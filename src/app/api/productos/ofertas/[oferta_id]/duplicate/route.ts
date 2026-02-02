import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const sql = db();
    const { oferta_id: ofertaIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const nombreNuevo = typeof body?.nombre === "string" ? body.nombre.trim() : null;

    const oRes: any = await sql.query(`SELECT * FROM app.producto_oferta WHERE oferta_id=$1 LIMIT 1`, [oferta_id]);
    const oferta = rows(oRes)?.[0];
    if (!oferta) return NextResponse.json({ ok: false, error: "oferta no encontrada" }, { status: 404 });

    const r: any = await sql.query(
      `INSERT INTO app.producto_oferta (
        producto_id, nombre, is_bulk, peso_neto_g, volumen_neto_ml, unidades_pack, masa_por_unidad_g, volumen_por_unidad_ml,
        densidad_override_g_ml, merma_pct, activo
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING oferta_id`,
      [
        oferta.producto_id,
        nombreNuevo ?? `${oferta.nombre} (copia)`,
        oferta.is_bulk,
        oferta.peso_neto_g,
        oferta.volumen_neto_ml,
        oferta.unidades_pack,
        oferta.masa_por_unidad_g,
        oferta.volumen_por_unidad_ml,
        oferta.densidad_override_g_ml,
        oferta.merma_pct,
        oferta.activo,
      ]
    );
    const new_id = rows(r)?.[0]?.oferta_id;

    // Duplicar extras solo si no es bulk
    if (oferta.is_bulk !== true) {
      const eRes: any = await sql.query(`SELECT * FROM app.producto_oferta_extra WHERE oferta_id=$1`, [oferta_id]);
      for (const ex of rows(eRes)) {
        await sql.query(
          `INSERT INTO app.producto_oferta_extra (oferta_id, tipo, insumo_id, cantidad, concepto, costo_ars, orden)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [new_id, ex.tipo, ex.insumo_id, ex.cantidad, ex.concepto, ex.costo_ars, ex.orden]
        );
      }
    }

    return NextResponse.json({ ok: true, oferta_id: new_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
