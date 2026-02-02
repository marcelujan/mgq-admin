import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

async function wouldCreateCycle(sql: ReturnType<typeof db>, currentProductoId: number, targetProductoId: number): Promise<boolean> {
  // Would adding edge current -> target create a cycle?
  // Equivalent: is current reachable from target via existing OFERTA_BULK dependencies?
  const q = `
    WITH RECURSIVE deps(prod_id) AS (
      SELECT po.producto_id
      FROM app.producto_formula_linea l
      JOIN app.producto_oferta po ON po.oferta_id = l.oferta_bulk_id
      WHERE l.producto_id = $1 AND l.componente_tipo = 'OFERTA_BULK'
      UNION
      SELECT po2.producto_id
      FROM deps d
      JOIN app.producto_formula_linea l2 ON l2.producto_id = d.prod_id AND l2.componente_tipo = 'OFERTA_BULK'
      JOIN app.producto_oferta po2 ON po2.oferta_id = l2.oferta_bulk_id
    )
    SELECT 1 AS found FROM deps WHERE prod_id = $2 LIMIT 1
  `;
  const r: any = await sql.query(q, [targetProductoId, currentProductoId]);
  return rows(r).length > 0;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const componente_tipo = typeof body?.componente_tipo === "string" ? body.componente_tipo.trim().toUpperCase() : "INSUMO";
    const pct_peso = Number(body?.pct_peso);
    const orden = Number.isFinite(Number(body?.orden)) ? Number(body.orden) : 0;

    if (!Number.isFinite(pct_peso) || pct_peso < 0 || pct_peso > 100) {
      return NextResponse.json({ ok: false, error: "pct_peso inválido" }, { status: 422 });
    }

    let insumo_id: number | null = null;
    let oferta_bulk_id: number | null = null;

    if (componente_tipo === "INSUMO") {
      insumo_id = Number(body?.insumo_id);
      if (!Number.isFinite(insumo_id) || insumo_id <= 0) {
        return NextResponse.json({ ok: false, error: "insumo_id requerido" }, { status: 422 });
      }

      const iRes: any = await sql.query(`SELECT tipo_uom FROM app.insumo WHERE insumo_id=$1 LIMIT 1`, [insumo_id]);
      const tipo_uom = (rows(iRes)?.[0]?.tipo_uom ?? "").toUpperCase();
      if (tipo_uom === "UN") {
        return NextResponse.json({ ok: false, error: "Insumo UN no puede estar en % p/p" }, { status: 422 });
      }
    } else if (componente_tipo === "OFERTA_BULK") {
      oferta_bulk_id = Number(body?.oferta_bulk_id);
      if (!Number.isFinite(oferta_bulk_id) || oferta_bulk_id <= 0) {
        return NextResponse.json({ ok: false, error: "oferta_bulk_id requerido" }, { status: 422 });
      }

      const oRes: any = await sql.query(
        `SELECT oferta_id, producto_id, is_bulk, peso_neto_g, volumen_neto_ml, unidades_pack
         FROM app.producto_oferta
         WHERE oferta_id=$1 LIMIT 1`,
        [oferta_bulk_id]
      );
      const oferta = rows(oRes)?.[0];
      if (!oferta) return NextResponse.json({ ok: false, error: "oferta_bulk no encontrada" }, { status: 404 });
      if (oferta.is_bulk !== true) return NextResponse.json({ ok: false, error: "La oferta seleccionada no es BULK" }, { status: 422 });
      if (oferta.unidades_pack !== null && oferta.unidades_pack !== undefined) {
        return NextResponse.json({ ok: false, error: "Una oferta BULK no debe ser UN" }, { status: 422 });
      }
      const targetProductoId = Number(oferta.producto_id);
      if (targetProductoId === producto_id) {
        return NextResponse.json({ ok: false, error: "Ciclo: un producto no puede depender de sí mismo" }, { status: 422 });
      }
      if (await wouldCreateCycle(sql, producto_id, targetProductoId)) {
        return NextResponse.json({ ok: false, error: "Ciclo detectado: esa oferta BULK generaría dependencia circular" }, { status: 422 });
      }
    } else {
      return NextResponse.json({ ok: false, error: "componente_tipo inválido (INSUMO|OFERTA_BULK)" }, { status: 422 });
    }

    const r: any = await sql.query(
      `INSERT INTO app.producto_formula_linea (producto_id, componente_tipo, insumo_id, oferta_bulk_id, pct_peso, orden)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING linea_id`,
      [producto_id, componente_tipo, insumo_id, oferta_bulk_id, pct_peso, orden]
    );

    return NextResponse.json({ ok: true, linea_id: rows(r)?.[0]?.linea_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
