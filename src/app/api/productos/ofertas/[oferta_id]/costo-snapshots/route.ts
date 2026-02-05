// src/app/api/productos/ofertas/[oferta_id]/costo-snapshots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAutoOfertaCostoSnapshot } from "@/lib/ofertaSnapshots";

function normalizeQueryResult(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(_: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id } = await ctx.params;
    const ofertaId = Number(oferta_id);
    if (!Number.isFinite(ofertaId)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const sql = db();

    const r = await sql`
      SELECT
        snapshot_id,
        oferta_id,
        created_at,
        bulk_ars_kg_con_prod,
        masa_total_g,
        volumen_total_ml,
        densidad_usada_g_ml,
        costo_base_ars,
        packaging_subtotal_ars,
        total_ars,
        fuente,
        origin
      FROM app.producto_oferta_costo_snapshot
      WHERE oferta_id = ${ofertaId}
      ORDER BY created_at DESC
      LIMIT 120
    `;
    const snapshots = normalizeQueryResult(r).map((x: any) => ({
      snapshot_id: Number(x.snapshot_id),
      oferta_id: Number(x.oferta_id),
      created_at: x.created_at,
      bulk_ars_kg_con_prod: numOrNull(x.bulk_ars_kg_con_prod),
      masa_total_g: numOrNull(x.masa_total_g),
      volumen_total_ml: numOrNull(x.volumen_total_ml),
      densidad_usada_g_ml: numOrNull(x.densidad_usada_g_ml),
      costo_base_ars: numOrNull(x.costo_base_ars),
      packaging_subtotal_ars: numOrNull(x.packaging_subtotal_ars),
      total_ars: numOrNull(x.total_ars),
      fuente: x.fuente,
      origin: x.origin,
    }));

    const snapIds = snapshots.map((s: any) => s.snapshot_id).filter((x: any) => Number.isFinite(x));
    let packaging: Record<number, any[]> = {};

    if (snapIds.length) {
      const rp = await sql`
        SELECT
          snapshot_id,
          oferta_packaging_id,
          cantidad,
          costo_unitario_ars
        FROM app.producto_oferta_costo_snapshot_packaging
        WHERE snapshot_id = ANY(${snapIds})
        ORDER BY snapshot_id DESC, oferta_packaging_id ASC
      `;
      const rows = normalizeQueryResult(rp);
      for (const row of rows) {
        const sid = Number(row.snapshot_id);
        if (!packaging[sid]) packaging[sid] = [];
        packaging[sid].push({
          snapshot_id: sid,
          oferta_packaging_id: Number(row.oferta_packaging_id),
          cantidad: numOrNull(row.cantidad),
          costo_unitario_ars: numOrNull(row.costo_unitario_ars),
        });
      }
    }

    return NextResponse.json({ ok: true, snapshots, packaging });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id } = await ctx.params;
    const ofertaId = Number(oferta_id);
    if (!Number.isFinite(ofertaId)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const origin = req.nextUrl.origin;

    const r = await createAutoOfertaCostoSnapshot({
      oferta_id: ofertaId,
      fuente: "MANUAL",
      origin,
    });

    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}