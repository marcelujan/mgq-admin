// src/app/api/productos/ofertas/[oferta_id]/costo-snapshots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAutoOfertaCostoSnapshot } from "@/lib/ofertaSnapshots";

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

export async function GET(_req: NextRequest, context: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id: ofertaIdRaw } = await context.params;
    const oferta_id = Number(ofertaIdRaw);
    if (!Number.isFinite(oferta_id)) {
      return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });
    }

    const sql = db();

    const r: any = await sql.query(
      `
      SELECT
        snapshot_id,
        oferta_id,
        created_at,
        bulk_ars_kg_con_prod::float8 as bulk_ars_kg_con_prod,
        densidad_usada_g_ml::float8 as densidad_usada_g_ml,
        masa_total_g::float8 as masa_total_g,
        costo_base_ars::float8 as costo_base_ars,
        packaging_subtotal_ars::float8 as packaging_subtotal_ars,
        total_ars::float8 as total_ars
      FROM app.oferta_costo_snapshot
      WHERE oferta_id = $1
      ORDER BY created_at DESC, snapshot_id DESC
      LIMIT 60
      `,
      [oferta_id]
    );

    return NextResponse.json({ ok: true, snapshots: normalizeQueryResult(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, context: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id: ofertaIdRaw } = await context.params;
    const oferta_id = Number(ofertaIdRaw);
    if (!Number.isFinite(oferta_id)) {
      return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });
    }

    await createAutoOfertaCostoSnapshot({
      oferta_id,
      fuente: "FORMULA_V2_SAVE",
      origin: "api/productos/ofertas/[oferta_id]/costo-snapshots",
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}