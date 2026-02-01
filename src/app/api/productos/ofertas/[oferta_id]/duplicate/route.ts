import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function POST(req: NextRequest, ctx: { params: { oferta_id: string } }) {
  try {
    const sql = db();
    const oferta_id = Number(ctx.params.oferta_id);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const newNombre = typeof body?.nombre === "string" ? body.nombre.trim() : null;

    const oRes: any = await sql.query(
      `SELECT * FROM app.producto_oferta WHERE oferta_id=$1 LIMIT 1`,
      [oferta_id]
    );
    const oferta = normalizeQueryResult(oRes)?.[0];
    if (!oferta) return NextResponse.json({ ok: false, error: "no encontrada" }, { status: 404 });

    const nombre = newNombre || `${oferta.nombre} (copia)`;

    const ins: any = await sql.query(
      `INSERT INTO app.producto_oferta (
          producto_id, nombre,
          peso_neto_g, volumen_neto_ml, unidades_pack,
          masa_por_unidad_g, volumen_por_unidad_ml,
          densidad_override_g_ml, merma_pct, activo
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING oferta_id`,
      [
        oferta.producto_id,
        nombre,
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
    const new_oferta_id = normalizeQueryResult(ins)?.[0]?.oferta_id;

    // copiar extras
    await sql.query(
      `INSERT INTO app.producto_oferta_extra (oferta_id, tipo, insumo_id, cantidad, concepto, costo_ars, orden)
       SELECT $1, tipo, insumo_id, cantidad, concepto, costo_ars, orden
       FROM app.producto_oferta_extra
       WHERE oferta_id=$2`,
      [new_oferta_id, oferta_id]
    );

    return NextResponse.json({ ok: true, oferta_id: new_oferta_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
