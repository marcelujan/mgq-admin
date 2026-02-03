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

// GET header fórmula v2 + costos de producción
export async function GET(_: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

    const sql = db();

    const fRes: any = await sql.query(
      `SELECT producto_id, lote_ref_g, updated_at
       FROM app.producto_formula_v2
       WHERE producto_id=$1`,
      [producto_id]
    );
    const fRows = normalizeQueryResult(fRes);
    const formula = fRows[0] ?? null;

    const cRes: any = await sql.query(
      `SELECT producto_id, lote_ref_kg, costo_fijo_por_lote_ars, costo_variable_por_kg_ars, updated_at
       FROM app.producto_costos_produccion
       WHERE producto_id=$1`,
      [producto_id]
    );
    const cRows = normalizeQueryResult(cRes);
    const costos_produccion = cRows[0] ?? null;

    return NextResponse.json({
      ok: true,
      formula: formula
        ? {
            producto_id: Number(formula.producto_id),
            lote_ref_g: Number(formula.lote_ref_g),
            updated_at: String(formula.updated_at),
          }
        : null,
      costos_produccion: costos_produccion
        ? {
            producto_id: Number(costos_produccion.producto_id),
            lote_ref_kg: numOrNull(costos_produccion.lote_ref_kg),
            costo_fijo_por_lote_ars: numOrNull(costos_produccion.costo_fijo_por_lote_ars),
            costo_variable_por_kg_ars: numOrNull(costos_produccion.costo_variable_por_kg_ars),
            updated_at: String(costos_produccion.updated_at),
          }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// UPSERT header fórmula v2 y/o costos producción
export async function POST(req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    const lote_ref_g = Number(body?.lote_ref_g ?? 1000);
    const lote_ref_g_ok = Number.isFinite(lote_ref_g) && lote_ref_g > 0 ? lote_ref_g : 1000;

    const lote_ref_kg = body?.lote_ref_kg === null || body?.lote_ref_kg === undefined ? null : Number(body?.lote_ref_kg);
    const costo_fijo_por_lote_ars =
      body?.costo_fijo_por_lote_ars === null || body?.costo_fijo_por_lote_ars === undefined ? null : Number(body?.costo_fijo_por_lote_ars);
    const costo_variable_por_kg_ars =
      body?.costo_variable_por_kg_ars === null || body?.costo_variable_por_kg_ars === undefined ? null : Number(body?.costo_variable_por_kg_ars);

    const sql = db();

    // header fórmula v2
    await sql.query(
      `
      INSERT INTO app.producto_formula_v2 (producto_id, lote_ref_g)
      VALUES ($1, $2)
      ON CONFLICT (producto_id) DO UPDATE SET lote_ref_g = excluded.lote_ref_g, updated_at=now()
      `,
      [producto_id, lote_ref_g_ok]
    );

    // costos de producción (opcional: si todos null -> borrar)
    const allNull = lote_ref_kg === null && costo_fijo_por_lote_ars === null && costo_variable_por_kg_ars === null;
    if (allNull) {
      await sql.query(`DELETE FROM app.producto_costos_produccion WHERE producto_id=$1`, [producto_id]);
    } else {
      await sql.query(
        `
        INSERT INTO app.producto_costos_produccion (producto_id, lote_ref_kg, costo_fijo_por_lote_ars, costo_variable_por_kg_ars)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (producto_id) DO UPDATE SET
          lote_ref_kg = excluded.lote_ref_kg,
          costo_fijo_por_lote_ars = excluded.costo_fijo_por_lote_ars,
          costo_variable_por_kg_ars = excluded.costo_variable_por_kg_ars,
          updated_at = now()
        `,
        [producto_id, lote_ref_kg, costo_fijo_por_lote_ars, costo_variable_por_kg_ars]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
