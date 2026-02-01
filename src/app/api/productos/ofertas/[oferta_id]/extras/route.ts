import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id: oferta_idStr } = await ctx.params;

    const sql = db();
    const oferta_id = Number(oferta_idStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const tipo = typeof body?.tipo === "string" ? body.tipo.trim().toUpperCase() : "";
    if (!["INSUMO_UN", "INSUMO_GR", "INSUMO_ML", "MANUAL"].includes(tipo)) {
      return NextResponse.json({ ok: false, error: "tipo inválido" }, { status: 422 });
    }

    const insumo_id = body?.insumo_id === null || body?.insumo_id === undefined ? null : Number(body.insumo_id);
    const cantidad = body?.cantidad === null || body?.cantidad === undefined ? null : Number(body.cantidad);
    const concepto = typeof body?.concepto === "string" ? body.concepto : null;
    const costo_ars = body?.costo_ars === null || body?.costo_ars === undefined ? null : Number(body.costo_ars);
    const orden = Number.isFinite(Number(body?.orden)) ? Number(body.orden) : 0;

    if (tipo === "MANUAL") {
      if (costo_ars === null || !Number.isFinite(costo_ars) || costo_ars < 0) {
        return NextResponse.json({ ok: false, error: "costo_ars requerido para MANUAL" }, { status: 422 });
      }
    } else {
      if (!Number.isFinite(insumo_id) || (insumo_id as number) <= 0) {
        return NextResponse.json({ ok: false, error: "insumo_id requerido" }, { status: 422 });
      }
      if (cantidad === null || !Number.isFinite(cantidad) || cantidad < 0) {
        return NextResponse.json({ ok: false, error: "cantidad requerida" }, { status: 422 });
      }
      // Validación UOM vs tipo
      const tRes: any = await sql.query(`SELECT tipo_uom FROM app.insumo WHERE insumo_id=$1 LIMIT 1`, [insumo_id]);
      const tipo_uom = normalizeQueryResult(tRes)?.[0]?.tipo_uom;
      if (!tipo_uom) return NextResponse.json({ ok: false, error: "insumo no existe" }, { status: 422 });
      const u = String(tipo_uom).toUpperCase();
      const ok = (tipo === "INSUMO_UN" && u === "UN") || (tipo === "INSUMO_GR" && u === "GR") || (tipo === "INSUMO_ML" && u === "ML");
      if (!ok) return NextResponse.json({ ok: false, error: `UOM del insumo (${u}) no coincide con ${tipo}` }, { status: 422 });
    }

    const r: any = await sql.query(
      `INSERT INTO app.producto_oferta_extra (oferta_id, tipo, insumo_id, cantidad, concepto, costo_ars, orden)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING extra_id`,
      [oferta_id, tipo, insumo_id, cantidad, concepto, costo_ars, orden]
    );
    const extra_id = normalizeQueryResult(r)?.[0]?.extra_id;
    return NextResponse.json({ ok: true, extra_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
