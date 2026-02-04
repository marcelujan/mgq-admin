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
        bulk_ars_kg_con_prod::float8 as bulk_ars_kg_con_prod,
        masa_total_g::float8 as masa_total_g,
        base_costo_ars::float8 as base_costo_ars,
        packaging_costo_ars::float8 as packaging_costo_ars,
        total_costo_ars::float8 as total_costo_ars,
        densidad_usada_g_ml::float8 as densidad_usada_g_ml,
        created_at::text as created_at
      FROM app.producto_oferta_costo_snapshot
      WHERE oferta_id = $1
      ORDER BY snapshot_id DESC
      LIMIT 60
      `,
      [oferta_id]
    );

    return NextResponse.json({ ok: true, snapshots: normalizeQueryResult(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id: ofertaIdRaw } = await context.params;
    const oferta_id = Number(ofertaIdRaw);
    if (!Number.isFinite(oferta_id)) {
      return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    // AUTO (default): si body.auto === true o si no vienen campos numéricos esperados
    const wantsAuto =
      body?.auto === true ||
      (body?.bulk_ars_kg_con_prod === undefined &&
        body?.masa_total_g === undefined &&
        body?.base_costo_ars === undefined &&
        body?.packaging_costo_ars === undefined &&
        body?.total_costo_ars === undefined);

    if (wantsAuto) {
      const origin = req.nextUrl.origin;
      const snap = await createAutoOfertaCostoSnapshot({ oferta_id, origin });
      return NextResponse.json({ ok: true, mode: "auto", snapshot_id: snap.snapshot_id }, { status: 201 });
    }

    // MANUAL (compat con lo anterior)
    const sql = db();

    const bulk_ars_kg_con_prod = numOrNull(body?.bulk_ars_kg_con_prod);
    const masa_total_g = numOrNull(body?.masa_total_g);
    const base_costo_ars = numOrNull(body?.base_costo_ars);
    const packaging_costo_ars = numOrNull(body?.packaging_costo_ars);
    const total_costo_ars = numOrNull(body?.total_costo_ars);
    const densidad_usada_g_ml = numOrNull(body?.densidad_usada_g_ml);

    if (bulk_ars_kg_con_prod === null || bulk_ars_kg_con_prod < 0) {
      return NextResponse.json({ ok: false, error: "bulk_ars_kg_con_prod inválido" }, { status: 422 });
    }
    if (masa_total_g === null || masa_total_g <= 0) {
      return NextResponse.json({ ok: false, error: "masa_total_g inválida" }, { status: 422 });
    }
    if (base_costo_ars === null || base_costo_ars < 0) {
      return NextResponse.json({ ok: false, error: "base_costo_ars inválido" }, { status: 422 });
    }
    if (packaging_costo_ars === null || packaging_costo_ars < 0) {
      return NextResponse.json({ ok: false, error: "packaging_costo_ars inválido" }, { status: 422 });
    }
    if (total_costo_ars === null || total_costo_ars < 0) {
      return NextResponse.json({ ok: false, error: "total_costo_ars inválido" }, { status: 422 });
    }

    const packaging = Array.isArray(body?.packaging) ? body.packaging : [];

    await sql.query("BEGIN");

    try {
      const snapRes: any = await sql.query(
        `
        INSERT INTO app.producto_oferta_costo_snapshot
          (oferta_id, bulk_ars_kg_con_prod, masa_total_g, base_costo_ars, packaging_costo_ars, total_costo_ars, densidad_usada_g_ml)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING snapshot_id
        `,
        [oferta_id, bulk_ars_kg_con_prod, masa_total_g, base_costo_ars, packaging_costo_ars, total_costo_ars, densidad_usada_g_ml]
      );

      const snapshot_id = Number(normalizeQueryResult(snapRes)?.[0]?.snapshot_id);
      if (!Number.isFinite(snapshot_id)) throw new Error("snapshot_id inválido");

      for (const p of packaging) {
        const packaging_item_id = numOrNull(p?.packaging_item_id);
        const nombre = typeof p?.nombre === "string" ? p.nombre.trim() : "";
        const cantidad = numOrNull(p?.cantidad);
        const costo_unitario_ars = numOrNull(p?.costo_unitario_ars);
        const subtotal_ars = numOrNull(p?.subtotal_ars);

        if (!nombre) continue;
        if (cantidad === null || cantidad <= 0) continue;
        if (costo_unitario_ars === null || costo_unitario_ars < 0) continue;
        if (subtotal_ars === null || subtotal_ars < 0) continue;

        await sql.query(
          `
          INSERT INTO app.producto_oferta_costo_snapshot_packaging
            (snapshot_id, packaging_item_id, nombre, cantidad, costo_unitario_ars, subtotal_ars)
          VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [snapshot_id, packaging_item_id, nombre, cantidad, costo_unitario_ars, subtotal_ars]
        );
      }

      await sql.query("COMMIT");
      return NextResponse.json({ ok: true, mode: "manual", snapshot_id }, { status: 201 });
    } catch (e) {
      try {
        await sql.query("ROLLBACK");
      } catch {}
      throw e;
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}