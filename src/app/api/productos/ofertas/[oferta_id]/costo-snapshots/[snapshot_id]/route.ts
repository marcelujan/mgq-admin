import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { oferta_id: string; snapshot_id: string } }
) {
  try {
    const oferta_id = Number(params.oferta_id);
    const snapshot_id = Number(params.snapshot_id);
    if (!Number.isFinite(oferta_id) || !Number.isFinite(snapshot_id)) {
      return NextResponse.json({ ok: false, error: "ids inválidos" }, { status: 400 });
    }

    const sql = db();

    const headRes: any = await sql.query(
      `
      SELECT
        snapshot_id,
        oferta_id,
        bulk_ars_kg_con_prod::float8 as bulk_ars_kg_con_prod,
        masa_total_g::float8 as masa_total_g,
        base_costo_ars::float8 as base_costo_ars,
        packaging_costo_ars::float8 as packaging_costo_ars,
        total_costo_ars::float8 as total_costo_ars,
        densidad_usada_g_ml::float8 as densidad_usada_g_ml,
        created_at::text as created_at
      FROM app.producto_oferta_costo_snapshot
      WHERE snapshot_id = $1 AND oferta_id = $2
      `,
      [snapshot_id, oferta_id]
    );

    const head = normalizeQueryResult(headRes)?.[0];
    if (!head) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });

    const detRes: any = await sql.query(
      `
      SELECT
        snapshot_packaging_id,
        snapshot_id,
        packaging_item_id,
        nombre,
        cantidad::float8 as cantidad,
        costo_unitario_ars::float8 as costo_unitario_ars,
        subtotal_ars::float8 as subtotal_ars
      FROM app.producto_oferta_costo_snapshot_packaging
      WHERE snapshot_id = $1
      ORDER BY snapshot_packaging_id ASC
      `,
      [snapshot_id]
    );

    return NextResponse.json({ ok: true, snapshot: head, packaging: normalizeQueryResult(detRes) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
