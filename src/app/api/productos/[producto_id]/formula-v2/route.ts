import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeQueryResult, numOrNull } from "@/lib/api";
import { recalcAndInsertSnapshotsForProducto } from "@/lib/ofertaSnapshots";

export async function GET(_: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const sql = db();

    const fR: any = await sql.query(
      `
      SELECT producto_id, lote_ref_g::float8 as lote_ref_g, updated_at::text
      FROM app.producto_formula_v2
      WHERE producto_id=$1
      `,
      [producto_id]
    );
    const formula = (normalizeQueryResult(fR) as any[])[0] ?? null;

    const cR: any = await sql.query(
      `
      SELECT
        producto_id,
        lote_ref_kg::float8 as lote_ref_kg,
        costo_fijo_por_lote_ars::float8 as costo_fijo_por_lote_ars,
        costo_variable_por_kg_ars::float8 as costo_variable_por_kg_ars,
        updated_at::text
      FROM app.producto_costos_produccion
      WHERE producto_id=$1
      `,
      [producto_id]
    );
    const costos_produccion = (normalizeQueryResult(cR) as any[])[0] ?? null;

    return NextResponse.json({ ok: true, formula, costos_produccion });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// POST upsert header fórmula v2 + costos prod
export async function POST(req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    const lote_ref_g = Number(body?.lote_ref_g ?? 1000);
    if (!Number.isFinite(lote_ref_g) || lote_ref_g <= 0) {
      return NextResponse.json({ ok: false, error: "lote_ref_g inválido" }, { status: 400 });
    }

    const lote_ref_kg = numOrNull(body?.lote_ref_kg);
    const costo_fijo_por_lote_ars = numOrNull(body?.costo_fijo_por_lote_ars);
    const costo_variable_por_kg_ars = numOrNull(body?.costo_variable_por_kg_ars);

    const sql = db();

    await sql.query(
      `
      INSERT INTO app.producto_formula_v2 (producto_id, lote_ref_g)
      VALUES ($1, $2)
      ON CONFLICT (producto_id)
      DO UPDATE SET lote_ref_g=EXCLUDED.lote_ref_g, updated_at=now()
      `,
      [producto_id, lote_ref_g]
    );

    await sql.query(
      `
      INSERT INTO app.producto_costos_produccion
        (producto_id, lote_ref_kg, costo_fijo_por_lote_ars, costo_variable_por_kg_ars)
      VALUES
        ($1,$2,$3,$4)
      ON CONFLICT (producto_id)
      DO UPDATE SET
        lote_ref_kg=EXCLUDED.lote_ref_kg,
        costo_fijo_por_lote_ars=EXCLUDED.costo_fijo_por_lote_ars,
        costo_variable_por_kg_ars=EXCLUDED.costo_variable_por_kg_ars,
        updated_at=now()
      `,
      [producto_id, lote_ref_kg, costo_fijo_por_lote_ars, costo_variable_por_kg_ars]
    );

    // snapshots automáticos (todas las ofertas del producto)
    await recalcAndInsertSnapshotsForProducto({ producto_id, fuente: "FORMULA_V2_SAVE" });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}