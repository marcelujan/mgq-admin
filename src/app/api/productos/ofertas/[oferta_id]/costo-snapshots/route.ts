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

// /api/productos/ofertas/[oferta_id]/costo-snapshots
export async function GET(_req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id } = await ctx.params;
    const ofertaId = Number(oferta_id);
    if (!Number.isFinite(ofertaId)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const sql = db();

    const snapRows = normalizeQueryResult(
      await sql`
        SELECT
          snapshot_id,
          oferta_id,
          created_at,
          bulk_ars_kg_con_prod,
          base_costo_ars,
          packaging_costo_ars,
          total_costo_ars,
          masa_total_g,
          densidad_usada_g_ml
        FROM app.producto_oferta_costo_snapshot
        WHERE oferta_id = ${ofertaId}
        ORDER BY created_at DESC, snapshot_id DESC
        LIMIT 30
      `
    );

    const snapshots = snapRows.map((r: any) => ({
      snapshot_id: Number(r.snapshot_id),
      oferta_id: Number(r.oferta_id),
      created_at: r.created_at,
      bulk_ars_kg_con_prod: numOrNull(r.bulk_ars_kg_con_prod),
      base_costo_ars: numOrNull(r.base_costo_ars),
      packaging_costo_ars: numOrNull(r.packaging_costo_ars),
      total_costo_ars: numOrNull(r.total_costo_ars),
      masa_total_g: numOrNull(r.masa_total_g),
      densidad_usada_g_ml: numOrNull(r.densidad_usada_g_ml),
    }));

    // detalle packaging solo para el snapshot más reciente (si existe)
    let packaging: Record<number, any[]> = {};
    if (snapshots.length) {
      const sid = snapshots[0].snapshot_id;
      const packRows = normalizeQueryResult(
        await sql`
          SELECT
            snapshot_id,
            packaging_item_id,
            nombre,
            cantidad,
            costo_unitario_ars,
            subtotal_ars
          FROM app.producto_oferta_costo_snapshot_packaging
          WHERE snapshot_id = ${sid}
          ORDER BY snapshot_packaging_id ASC
        `
      );

      packaging = {
        [sid]: packRows.map((r: any) => ({
          snapshot_id: Number(r.snapshot_id),
          packaging_item_id: Number(r.packaging_item_id),
          nombre: String(r.nombre ?? ""),
          cantidad: Number(r.cantidad ?? 0),
          costo_unitario_ars: numOrNull(r.costo_unitario_ars) ?? 0,
          subtotal_ars: numOrNull(r.subtotal_ars) ?? 0,
        })),
      };
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

    const body = (await req.json().catch(() => ({} as any))) as any;
    const forceAuto = body?.force_auto === true;

    if (forceAuto || Object.keys(body || {}).length === 0) {
      const snapshot_id = await createAutoOfertaCostoSnapshot({
        oferta_id: ofertaId,
        fuente: "OFERTA_CHANGE",
        origin: "api/productos/ofertas/[oferta_id]/costo-snapshots:POST",
      });
      return NextResponse.json({ ok: true, snapshot_id });
    }

    // Manual insert (compat)
    const bulk_ars_kg_con_prod = numOrNull(body.bulk_ars_kg_con_prod);
    const base_costo_ars = numOrNull(body.base_costo_ars);
    const packaging_costo_ars = numOrNull(body.packaging_costo_ars);
    const total_costo_ars = numOrNull(body.total_costo_ars);
    const masa_total_g = numOrNull(body.masa_total_g);
    const densidad_usada_g_ml = numOrNull(body.densidad_usada_g_ml);

    const sql = db();
    const ins = normalizeQueryResult(
      await sql`
        INSERT INTO app.producto_oferta_costo_snapshot (
          oferta_id,
          bulk_ars_kg_con_prod,
          base_costo_ars,
          packaging_costo_ars,
          total_costo_ars,
          masa_total_g,
          densidad_usada_g_ml
        )
        VALUES (
          ${ofertaId},
          ${bulk_ars_kg_con_prod},
          ${base_costo_ars},
          ${packaging_costo_ars},
          ${total_costo_ars},
          ${masa_total_g},
          ${densidad_usada_g_ml}
        )
        RETURNING snapshot_id
      `
    );

    const snapshot_id = Number(ins?.[0]?.snapshot_id);
    if (!Number.isFinite(snapshot_id)) throw new Error("snapshot_id inválido");
    return NextResponse.json({ ok: true, snapshot_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}