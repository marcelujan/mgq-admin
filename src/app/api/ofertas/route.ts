import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function toBigIntNullable(v: string | null): bigint | null {
  if (!v) return null;
  const s = v.trim();
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

function parseBool(v: string | null): boolean | null {
  if (v === null) return null;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "t" || s === "yes" || s === "y") return true;
  if (s === "false" || s === "0" || s === "f" || s === "no" || s === "n") return false;
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const sql = db();
    const { searchParams } = new URL(req.url);

    const itemId = toBigIntNullable(searchParams.get("item_id"));
    const habilitadasQ = parseBool(searchParams.get("habilitadas"));
    const habilitadas = habilitadasQ === null ? true : habilitadasQ;

    const rows = (await sql`
      WITH fx AS (
        SELECT valor::numeric AS fx_hoy
        FROM app.fx
        WHERE fecha = current_date
        LIMIT 1
      ),
      base AS (
        SELECT
          o.oferta_id,
          o.item_id,
          o.articulo_prov,
          o.presentacion,
          o.uom::text AS uom,
          o.costo_base_usd::numeric AS costo_base_usd,
          o.fx_usado_en_alta::numeric AS fx_usado_en_alta,
          o.fecha_scrape_base,
          o.densidad,
          o.descripcion,
          o.habilitada,
          o.created_at,
          o.updated_at,
          fx.fx_hoy
        FROM app.oferta_proveedor o
        CROSS JOIN fx
        WHERE (${itemId}::bigint IS NULL OR o.item_id = ${itemId})
          AND (${habilitadas}::boolean IS FALSE OR o.habilitada = TRUE)
      ),
      calc AS (
        SELECT
          b.*,
          CASE
            WHEN b.fx_hoy IS NOT NULL AND b.costo_base_usd IS NOT NULL
              THEN (b.costo_base_usd * b.fx_hoy)
            ELSE NULL
          END AS precio_ars_hoy,

          -- USD por unidad (estable; no depende del FX del día)
          CASE
            WHEN b.costo_base_usd IS NULL OR b.presentacion IS NULL OR b.presentacion::numeric = 0 THEN NULL
            WHEN b.uom = 'GR' THEN (b.costo_base_usd * 1000.0 / b.presentacion::numeric)
            WHEN b.uom = 'ML' THEN (b.costo_base_usd * 1000.0 / b.presentacion::numeric)
            WHEN b.uom = 'UN' THEN (b.costo_base_usd / b.presentacion::numeric)
            ELSE NULL
          END AS usd_por_unidad,

          -- ARS por unidad (depende del FX del día)
          CASE
            WHEN b.fx_hoy IS NULL OR b.costo_base_usd IS NULL OR b.presentacion IS NULL OR b.presentacion::numeric = 0 THEN NULL
            WHEN b.uom = 'GR' THEN ((b.costo_base_usd * b.fx_hoy) * 1000.0 / b.presentacion::numeric)
            WHEN b.uom = 'ML' THEN ((b.costo_base_usd * b.fx_hoy) * 1000.0 / b.presentacion::numeric)
            WHEN b.uom = 'UN' THEN ((b.costo_base_usd * b.fx_hoy) / b.presentacion::numeric)
            ELSE NULL
          END AS ars_por_unidad_hoy
        FROM base b
      )
      SELECT
        c.*,
        CASE
          WHEN c.usd_por_unidad IS NULL THEN NULL
          ELSE c.usd_por_unidad
            / NULLIF(MIN(c.usd_por_unidad) OVER (PARTITION BY c.item_id, c.uom), 0)
        END AS ratio_vs_min_usd
      FROM calc c
      ORDER BY c.item_id DESC, c.uom ASC, c.presentacion ASC NULLS LAST, c.oferta_id ASC
    `) as any[];

    return NextResponse.json({
      ok: true,
      item_id: itemId ? String(itemId) : null,
      habilitadas,
      count: rows.length,
      ofertas: rows,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
