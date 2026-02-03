import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: any): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

// GET líneas v2
export async function GET(_: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const sql = db();

    const r: any = await sql.query(
      `
      SELECT
        l.linea_id, l.producto_id, l.cost_option_id, l.pct_peso, l.is_csp, l.orden,
        co.tipo,
        co.item_id, co.item_presentacion,
        co.manual_nombre, co.manual_uom, co.manual_cantidad, co.manual_costo_ars,
        co.bulk_producto_id,
        co.densidad_g_ml
      FROM app.producto_formula_linea_v2 l
      JOIN app.cost_option co ON co.cost_option_id = l.cost_option_id
      WHERE l.producto_id=$1
      ORDER BY l.orden ASC, l.linea_id ASC
      `,
      [producto_id]
    );

    return NextResponse.json({ ok: true, lineas: normalizeQueryResult(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// POST crear línea
export async function POST(req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    const cost_option_id = Number(body?.cost_option_id);
    if (!Number.isFinite(cost_option_id)) return NextResponse.json({ ok: false, error: "cost_option_id inválido" }, { status: 400 });

    const pct_peso = numOrNull(body?.pct_peso);
    const is_csp = bool(body?.is_csp);
    const orden = Number(body?.orden ?? 999);

    const sql = db();

    if (is_csp) {
      // asegurar 1 solo CSP
      await sql.query(`UPDATE app.producto_formula_linea_v2 SET is_csp=false WHERE producto_id=$1`, [producto_id]);
    }

    const r: any = await sql.query(
      `
      INSERT INTO app.producto_formula_linea_v2 (producto_id, cost_option_id, pct_peso, is_csp, orden)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING linea_id
      `,
      [producto_id, cost_option_id, pct_peso, is_csp, Number.isFinite(orden) ? orden : 999]
    );
    const rows = normalizeQueryResult(r);
    const linea_id = rows?.[0]?.linea_id;

    return NextResponse.json({ ok: true, linea_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
