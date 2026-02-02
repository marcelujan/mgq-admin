import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

async function wouldCreateCycle(sql: ReturnType<typeof db>, currentProductoId: number, targetProductoId: number): Promise<boolean> {
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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ producto_id: string; linea_id: string }> }) {
  try {
    const sql = db();
    const { producto_id: productoIdStr, linea_id: lineaIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    const linea_id = Number(lineaIdStr);
    if (!Number.isFinite(producto_id) || !Number.isFinite(linea_id)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const sets: string[] = [];
    const params: any[] = [];
    const pushSet = (frag: string, v: any) => {
      params.push(v);
      sets.push(frag.replace("?", `$${params.length}`));
    };

    if (body?.pct_peso !== undefined) {
      const pct = Number(body.pct_peso);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ ok: false, error: "pct_peso inválido" }, { status: 422 });
      pushSet("pct_peso = ?", pct);
    }
    if (body?.orden !== undefined) {
      const o = Number(body.orden);
      if (!Number.isFinite(o)) return NextResponse.json({ ok: false, error: "orden inválido" }, { status: 422 });
      pushSet("orden = ?", o);
    }

    // Allow changing component (advanced): validate if provided
    if (body?.componente_tipo !== undefined) {
      const t = typeof body.componente_tipo === "string" ? body.componente_tipo.trim().toUpperCase() : "";
      if (!["INSUMO", "OFERTA_BULK"].includes(t)) return NextResponse.json({ ok: false, error: "componente_tipo inválido" }, { status: 422 });
      pushSet("componente_tipo = ?", t);
    }
    if (body?.insumo_id !== undefined) {
      const insumo_id = body.insumo_id === null ? null : Number(body.insumo_id);
      if (insumo_id !== null && (!Number.isFinite(insumo_id) || insumo_id <= 0)) return NextResponse.json({ ok: false, error: "insumo_id inválido" }, { status: 422 });
      if (insumo_id !== null) {
        const iRes: any = await sql.query(`SELECT tipo_uom FROM app.insumo WHERE insumo_id=$1 LIMIT 1`, [insumo_id]);
        const tipo_uom = (rows(iRes)?.[0]?.tipo_uom ?? "").toUpperCase();
        if (tipo_uom === "UN") return NextResponse.json({ ok: false, error: "Insumo UN no puede estar en % p/p" }, { status: 422 });
      }
      pushSet("insumo_id = ?", insumo_id);
    }
    if (body?.oferta_bulk_id !== undefined) {
      const oferta_bulk_id = body.oferta_bulk_id === null ? null : Number(body.oferta_bulk_id);
      if (oferta_bulk_id !== null && (!Number.isFinite(oferta_bulk_id) || oferta_bulk_id <= 0)) {
        return NextResponse.json({ ok: false, error: "oferta_bulk_id inválido" }, { status: 422 });
      }
      if (oferta_bulk_id !== null) {
        const oRes: any = await sql.query(`SELECT producto_id, is_bulk, unidades_pack FROM app.producto_oferta WHERE oferta_id=$1 LIMIT 1`, [oferta_bulk_id]);
        const oferta = rows(oRes)?.[0];
        if (!oferta) return NextResponse.json({ ok: false, error: "oferta_bulk no encontrada" }, { status: 404 });
        if (oferta.is_bulk !== true) return NextResponse.json({ ok: false, error: "La oferta seleccionada no es BULK" }, { status: 422 });
        if (oferta.unidades_pack !== null && oferta.unidades_pack !== undefined) return NextResponse.json({ ok: false, error: "Una oferta BULK no debe ser UN" }, { status: 422 });
        const targetProductoId = Number(oferta.producto_id);
        if (targetProductoId === producto_id) return NextResponse.json({ ok: false, error: "Ciclo: un producto no puede depender de sí mismo" }, { status: 422 });
        if (await wouldCreateCycle(sql, producto_id, targetProductoId)) {
          return NextResponse.json({ ok: false, error: "Ciclo detectado: esa oferta BULK generaría dependencia circular" }, { status: 422 });
        }
      }
      pushSet("oferta_bulk_id = ?", oferta_bulk_id);
    }

    if (!sets.length) return NextResponse.json({ ok: false, error: "sin cambios" }, { status: 400 });

    params.push(producto_id);
    params.push(linea_id);

    const q = `UPDATE app.producto_formula_linea SET ${sets.join(", ")} WHERE producto_id=$${params.length - 1} AND linea_id=$${params.length}`;
    await sql.query(q, params);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ producto_id: string; linea_id: string }> }) {
  try {
    const sql = db();
    const { producto_id: productoIdStr, linea_id: lineaIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    const linea_id = Number(lineaIdStr);
    if (!Number.isFinite(producto_id) || !Number.isFinite(linea_id)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }

    await sql.query(`DELETE FROM app.producto_formula_linea WHERE producto_id=$1 AND linea_id=$2`, [producto_id, linea_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
