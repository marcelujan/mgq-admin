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

    const oRes: any = await sql.query(`SELECT is_bulk FROM app.producto_oferta WHERE oferta_id=$1 LIMIT 1`, [oferta_id]);
    const oferta = rows(oRes)?.[0];
    if (!oferta) return NextResponse.json({ ok: false, error: "oferta no encontrada" }, { status: 404 });
    if (oferta.is_bulk === true) return NextResponse.json({ ok: false, error: "No se permiten extras en ofertas BULK" }, { status: 422 });

    const body = await req.json().catch(() => ({} as any));
    const tipo = typeof body?.tipo === "string" ? body.tipo.trim().toUpperCase() : "";
    const insumo_id = body?.insumo_id === null || body?.insumo_id === undefined ? null : Number(body.insumo_id);
    const cantidad = body?.cantidad === null || body?.cantidad === undefined ? null : Number(body.cantidad);
    const concepto = typeof body?.concepto === "string" ? body.concepto : null;
    const costo_ars = body?.costo_ars === null || body?.costo_ars === undefined ? null : Number(body.costo_ars);
    const orden = Number.isFinite(Number(body?.orden)) ? Number(body.orden) : 0;

    if (!["INSUMO_UN", "INSUMO_GR", "INSUMO_ML", "MANUAL"].includes(tipo)) {
      return NextResponse.json({ ok: false, error: "tipo inválido" }, { status: 422 });
    }

    if (tipo === "MANUAL") {
      if (costo_ars === null || !Number.isFinite(costo_ars) || costo_ars < 0) {
        return NextResponse.json({ ok: false, error: "costo_ars requerido (>=0)" }, { status: 422 });
      }
    } else {
      if (!Number.isFinite(insumo_id) || (insumo_id as number) <= 0) return NextResponse.json({ ok: false, error: "insumo_id requerido" }, { status: 422 });
      if (cantidad === null || !Number.isFinite(cantidad) || cantidad < 0) return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 422 });

      const iRes: any = await sql.query(`SELECT tipo_uom FROM app.insumo WHERE insumo_id=$1 LIMIT 1`, [insumo_id]);
      const uom = (rows(iRes)?.[0]?.tipo_uom ?? "").toUpperCase();
      const ok =
        (tipo === "INSUMO_UN" && uom === "UN") || (tipo === "INSUMO_GR" && uom === "GR") || (tipo === "INSUMO_ML" && uom === "ML");
      if (!ok) return NextResponse.json({ ok: false, error: "UOM del insumo no coincide con tipo de extra" }, { status: 422 });
    }

    const r: any = await sql.query(
      `INSERT INTO app.producto_oferta_extra (oferta_id, tipo, insumo_id, cantidad, concepto, costo_ars, orden)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING extra_id`,
      [oferta_id, tipo, insumo_id, cantidad, concepto, costo_ars, orden]
    );

    return NextResponse.json({ ok: true, extra_id: rows(r)?.[0]?.extra_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
