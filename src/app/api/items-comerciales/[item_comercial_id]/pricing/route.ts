
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ item_comercial_id: string }> };

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function nonNeg(v: number | null): boolean {
  return v === null || v >= 0;
}

export async function GET(_: NextRequest, ctx: Ctx) {
  try {
    const { item_comercial_id } = await ctx.params;
    const id = Number(item_comercial_id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: "item_comercial_id inválido" }, { status: 400 });
    }

    const sql = db();
    const pricing: any = await sql.query(
      `
      SELECT
        p.item_comercial_pricing_id,
        p.item_comercial_id,
        p.costo_referencia_ars,
        p.margen_referencia_pct,
        p.precio_sin_impuestos,
        p.precio_directo,
        p.precio_web,
        p.precio_ml,
        p.updated_at
      FROM app.item_comercial_pricing p
      WHERE p.item_comercial_id = $1
      LIMIT 1
      `,
      [id]
    );

    const rows = Array.isArray(pricing?.rows) ? pricing.rows : Array.isArray(pricing) ? pricing : [];
    const item = rows[0] ?? null;

    // Sugerencia mínima: tomar costo total desde el item comercial si existe
    // Si el frontend ya muestra el costeo actual, esta sugerencia sirve solo como referencia.
    let suggested = { costo_referencia_ars: null }
try {
      const s: any = await sql.query(
        `
        SELECT
          CASE
            WHEN c.costo_total_ars IS NOT NULL THEN c.costo_total_ars
            WHEN c.costeo_total_ars IS NOT NULL THEN c.costeo_total_ars
            ELSE NULL
          END AS costo_ref
        FROM app.item_comercial c
        WHERE c.item_comercial_id = $1
        LIMIT 1
        `,
        [id]
      );
      const srows = Array.isArray(s?.rows) ? s.rows : Array.isArray(s) ? s : [];
      suggested = {
        costo_referencia_ars: srows[0]?.costo_ref ?? null,
      };
    } catch {
      // no bloquear si no existe todavía una columna de costeo consolidado
    }

    return NextResponse.json({ ok: true, pricing: item, suggested });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { item_comercial_id } = await ctx.params;
    const id = Number(item_comercial_id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: "item_comercial_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    const costo_referencia_ars = n((body as any)?.costo_referencia_ars);
    const margen_referencia_pct = n((body as any)?.margen_referencia_pct);
    const precio_sin_impuestos = n((body as any)?.precio_sin_impuestos);
    const precio_directo = n((body as any)?.precio_directo);
    const precio_web = n((body as any)?.precio_web);
    const precio_ml = n((body as any)?.precio_ml);

    for (const [name, value] of Object.entries({
      costo_referencia_ars,
      margen_referencia_pct,
      precio_sin_impuestos,
      precio_directo,
      precio_web,
      precio_ml,
    })) {
      if (!nonNeg(value)) {
        return NextResponse.json({ ok: false, error: `${name} inválido` }, { status: 422 });
      }
    }

    const sql = db();

    const exists: any = await sql.query(
      `SELECT 1 FROM app.item_comercial WHERE item_comercial_id = $1 LIMIT 1`,
      [id]
    );
    const erows = Array.isArray(exists?.rows) ? exists.rows : Array.isArray(exists) ? exists : [];
    if (!erows[0]) {
      return NextResponse.json({ ok: false, error: "item comercial no encontrado" }, { status: 404 });
    }

    const r: any = await sql.query(
      `
      INSERT INTO app.item_comercial_pricing (
        item_comercial_id,
        costo_referencia_ars,
        margen_referencia_pct,
        precio_sin_impuestos,
        precio_directo,
        precio_web,
        precio_ml,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7, now())
      ON CONFLICT (item_comercial_id) DO UPDATE SET
        costo_referencia_ars = EXCLUDED.costo_referencia_ars,
        margen_referencia_pct = EXCLUDED.margen_referencia_pct,
        precio_sin_impuestos = EXCLUDED.precio_sin_impuestos,
        precio_directo = EXCLUDED.precio_directo,
        precio_web = EXCLUDED.precio_web,
        precio_ml = EXCLUDED.precio_ml,
        updated_at = now()
      RETURNING
        item_comercial_pricing_id,
        item_comercial_id,
        costo_referencia_ars,
        margen_referencia_pct,
        precio_sin_impuestos,
        precio_directo,
        precio_web,
        precio_ml,
        updated_at
      `,
      [id, costo_referencia_ars, margen_referencia_pct, precio_sin_impuestos, precio_directo, precio_web, precio_ml]
    );

    const rows = Array.isArray(r?.rows) ? r.rows : Array.isArray(r) ? r : [];
    return NextResponse.json({ ok: true, pricing: rows[0] ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
