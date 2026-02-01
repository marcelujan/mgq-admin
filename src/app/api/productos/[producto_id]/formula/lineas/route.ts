import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

// GET líneas
export async function GET(_: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const { producto_id: producto_idStr } = await ctx.params;

    const sql = db();
    const producto_id = Number(producto_idStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const r: any = await sql.query(
      `SELECT linea_id, producto_id, insumo_id, pct_peso, orden
       FROM app.producto_formula_linea
       WHERE producto_id=$1
       ORDER BY orden ASC, linea_id ASC`,
      [producto_id]
    );
    const lineas = normalizeQueryResult(r);
    return NextResponse.json({ ok: true, lineas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// POST línea
export async function POST(req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const sql = db();
    const producto_id = Number(producto_idStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const insumo_id = Number(body?.insumo_id);
    const pct_peso = Number(body?.pct_peso);
    const orden = Number.isFinite(Number(body?.orden)) ? Number(body.orden) : 0;

    if (!Number.isFinite(insumo_id) || insumo_id <= 0) {
      return NextResponse.json({ ok: false, error: "insumo_id requerido" }, { status: 422 });
    }
    if (!Number.isFinite(pct_peso) || pct_peso < 0 || pct_peso > 100) {
      return NextResponse.json({ ok: false, error: "pct_peso inválido" }, { status: 422 });
    }

    // Validar que el insumo no sea UN
    const iRes: any = await sql.query(`SELECT tipo_uom FROM app.insumo WHERE insumo_id=$1 LIMIT 1`, [insumo_id]);
    const tipo_uom = normalizeQueryResult(iRes)?.[0]?.tipo_uom;
    if (!tipo_uom) return NextResponse.json({ ok: false, error: "insumo no existe" }, { status: 422 });
    if (String(tipo_uom).toUpperCase() === "UN") {
      return NextResponse.json({ ok: false, error: "Insumo UN no puede estar en % p/p" }, { status: 422 });
    }

    const r: any = await sql.query(
      `INSERT INTO app.producto_formula_linea (producto_id, insumo_id, pct_peso, orden)
       VALUES ($1,$2,$3,$4)
       RETURNING linea_id`,
      [producto_id, insumo_id, pct_peso, orden]
    );
    const linea_id = normalizeQueryResult(r)?.[0]?.linea_id;
    return NextResponse.json({ ok: true, linea_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
