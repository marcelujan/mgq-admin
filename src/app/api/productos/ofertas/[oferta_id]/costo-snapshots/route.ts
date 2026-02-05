import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id: ofertaIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
    if (!Number.isFinite(oferta_id)) {
      return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });
    }

    const sql = db();

    const r: any = await sql.query(
      `
      SELECT
        s.snapshot_id,
        s.oferta_id,
        s.producto_id,
        s.created_at,
        s.fuente,
        s.origin,
        s.bulk_ars_kg_sin_prod::float8 as bulk_ars_kg_sin_prod,
        s.prod_ars_kg::float8 as prod_ars_kg,
        s.bulk_ars_kg_con_prod::float8 as bulk_ars_kg_con_prod,
        s.densidad_usada_g_ml::float8 as densidad_usada_g_ml,
        s.masa_total_g::float8 as masa_total_g,
        s.vol_total_ml::float8 as vol_total_ml,
        s.costo_base_ars::float8 as costo_base_ars,
        s.packaging_subtotal_ars::float8 as packaging_subtotal_ars,
        s.total_ars::float8 as total_ars
      FROM app.oferta_costo_snapshot s
      WHERE s.oferta_id = $1
      ORDER BY s.created_at DESC, s.snapshot_id DESC
      LIMIT 200
      `,
      [oferta_id]
    );

    return NextResponse.json({ ok: true, snapshots: normalizeQueryResult(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}