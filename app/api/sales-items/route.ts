import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    const enabledParam = searchParams.get("enabled");
    const limit = Number(searchParams.get("limit") ?? 100);
    const offset = Number(searchParams.get("offset") ?? 0);

    const enabled = enabledParam === null ? null : enabledParam === "true";

    const sql = `
      SELECT
        id, sku, product_id, producto, tipo,
        vend_pres, vend_uom_id, vend_uom, densidad_usada,
        prov_pres, prov_uom, supplier_presentation_id,
        prov_precio_ars, prov_act_auto, vend_costo_auto,
        COALESCE(vend_lote, etiqueta_auto_lote)   AS lote,
        COALESCE(vend_vence, etiqueta_auto_vence) AS vence,
        COALESCE(vend_grado, etiqueta_auto_grado) AS grado,
        COALESCE(vend_origen, etiqueta_auto_origen) AS origen,
        COALESCE(vend_obs, etiqueta_auto_obs)     AS obs,
        COALESCE(vend_url, etiqueta_auto_url)     AS url,
        is_enabled
      FROM app.v_sales_items_enriched
      WHERE ($1::text IS NULL OR producto ILIKE '%'||$1||'%' OR sku ILIKE '%'||$1||'%')
        AND ($2::boolean IS NULL OR is_enabled = $2)
      ORDER BY producto
      LIMIT $3 OFFSET $4
    `;

    const { rows } = await query(sql, [q, enabled, limit, offset]);
    return NextResponse.json({ items: rows, limit, offset });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "unexpected" }, { status: 500 });
  }
}
