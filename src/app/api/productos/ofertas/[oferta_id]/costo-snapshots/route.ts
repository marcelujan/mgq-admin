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

type Ctx = { params: Promise<{ oferta_id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { oferta_id: oferta_id_raw } = await ctx.params;
    const oferta_id = Number(oferta_id_raw);
    if (!Number.isFinite(oferta_id)) {
      return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });
    }

    const sql = db();

    const headRes: any = await sql.query(
      `
      SELECT
        snapshot_id,
        oferta_id,
        created_at,
        bulk_ars_kg_con_prod,
        masa_total_g,
        base_costo_ars,
        packaging_costo_ars,
        total_costo_ars,
        densidad_usada_g_ml
      FROM app.producto_oferta_costo_snapshot
      WHERE oferta_id = $1
      ORDER BY snapshot_id DESC
      LIMIT 90
      `,
      [oferta_id]
    );

    const snapshots = normalizeQueryResult(headRes).map((r: any) => ({
      snapshot_id: Number(r.snapshot_id),
      oferta_id: Number(r.oferta_id),
      created_at: r.created_at,
      bulk_ars_kg_con_prod: numOrNull(r.bulk_ars_kg_con_prod),
      masa_total_g: numOrNull(r.masa_total_g),
      base_costo_ars: numOrNull(r.base_costo_ars),
      packaging_costo_ars: numOrNull(r.packaging_costo_ars),
      total_costo_ars: numOrNull(r.total_costo_ars),
      densidad_usada_g_ml: numOrNull(r.densidad_usada_g_ml),
    }));

    if (!snapshots.length) {
      return NextResponse.json({ ok: true, snapshots, packaging: {} });
    }

    const snapshotIds = snapshots.map((s: any) => s.snapshot_id);

    const packRes: any = await sql.query(
      `
      SELECT
        snapshot_id,
        packaging_item_id,
        nombre,
        cantidad,
        costo_unitario_ars,
        subtotal_ars
      FROM app.producto_oferta_costo_snapshot_packaging
      WHERE snapshot_id = ANY($1::int[])
      ORDER BY snapshot_id DESC, snapshot_packaging_id ASC
      `,
      [snapshotIds]
    );

    const packagingRows = normalizeQueryResult(packRes).map((r: any) => ({
      snapshot_id: Number(r.snapshot_id),
      packaging_item_id: numOrNull(r.packaging_item_id),
      nombre: String(r.nombre ?? ""),
      cantidad: numOrNull(r.cantidad) ?? 0,
      costo_unitario_ars: numOrNull(r.costo_unitario_ars) ?? 0,
      subtotal_ars: numOrNull(r.subtotal_ars) ?? 0,
    }));

    const packaging: Record<number, any[]> = {};
    for (const row of packagingRows) {
      if (!packaging[row.snapshot_id]) packaging[row.snapshot_id] = [];
      packaging[row.snapshot_id].push(row);
    }

    return NextResponse.json({ ok: true, snapshots, packaging });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { oferta_id: oferta_id_raw } = await ctx.params;
    const oferta_id = Number(oferta_id_raw);
    if (!Number.isFinite(oferta_id)) {
      return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({} as any))) as any;
    const origin = String(body?.origin ?? "").trim();
    if (!origin) {
      return NextResponse.json({ ok: false, error: "origin requerido" }, { status: 400 });
    }

    const snapshot_id = await createAutoOfertaCostoSnapshot({ oferta_id, origin });

    return NextResponse.json({ ok: true, snapshot_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}