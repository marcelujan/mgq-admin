import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeBulkCost } from "@/lib/bulkCost";

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(_: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id) || producto_id <= 0) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

    const sql = db();

    const cost = await computeBulkCost(
      { query: (text: string, params?: any[]) => sql.query(text, params) },
      producto_id,
      [],
      0
    );

    return NextResponse.json({
      ok: true,
      producto_id,
      ars_por_kg: Number(cost.ars_por_kg),
      ars_por_g: Number(cost.ars_por_g),
      lote_ref_g: Number(cost.lote_ref_g),
      prod_ars_por_kg: Number(cost.prod_ars_por_kg),
      material_ars_por_kg: Number(cost.material_ars_por_kg),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e ?? "error") },
      { status: 500 }
    );
  }
}
