import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const fRes: any = await sql.query(`SELECT * FROM app.producto_formula WHERE producto_id=$1 LIMIT 1`, [producto_id]);
    const formula = rows(fRes)?.[0] ?? null;
    const lRes: any = await sql.query(
      `SELECT * FROM app.producto_formula_linea WHERE producto_id=$1 ORDER BY orden ASC, linea_id ASC`,
      [producto_id]
    );
    return NextResponse.json({ ok: true, formula, lineas: rows(lRes) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const rendimiento_total_g = Number(body?.rendimiento_total_g ?? 1000);
    const densidad_formula_g_ml =
      body?.densidad_formula_g_ml === null || body?.densidad_formula_g_ml === undefined ? null : Number(body.densidad_formula_g_ml);

    if (!Number.isFinite(rendimiento_total_g) || rendimiento_total_g <= 0) {
      return NextResponse.json({ ok: false, error: "rendimiento_total_g inválido" }, { status: 422 });
    }
    if (densidad_formula_g_ml !== null && (!Number.isFinite(densidad_formula_g_ml) || densidad_formula_g_ml <= 0)) {
      return NextResponse.json({ ok: false, error: "densidad_formula_g_ml inválida" }, { status: 422 });
    }

    // Exclusividad: si seteas formula, elimina base
    await sql.query(`DELETE FROM app.producto_base WHERE producto_id=$1`, [producto_id]);

    await sql.query(
      `INSERT INTO app.producto_formula (producto_id, rendimiento_total_g, densidad_formula_g_ml)
       VALUES ($1,$2,$3)
       ON CONFLICT (producto_id) DO UPDATE SET
         rendimiento_total_g = EXCLUDED.rendimiento_total_g,
         densidad_formula_g_ml = EXCLUDED.densidad_formula_g_ml`,
      [producto_id, rendimiento_total_g, densidad_formula_g_ml]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    await sql.query(`DELETE FROM app.producto_formula_linea WHERE producto_id=$1`, [producto_id]);
    await sql.query(`DELETE FROM app.producto_formula WHERE producto_id=$1`, [producto_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
