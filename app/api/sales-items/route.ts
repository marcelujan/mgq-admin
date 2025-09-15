export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const enabled = searchParams.get('enabled');
  const limit = Number(searchParams.get('limit') ?? '100');
  const offset = Number(searchParams.get('offset') ?? '0');

  const rows = await sql`
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
    WHERE (${q}::text IS NULL OR producto ILIKE '%'||${q}||'%' OR sku ILIKE '%'||${q}||'%')
      AND (${enabled}::boolean IS NULL OR is_enabled = ${enabled})
    ORDER BY producto
    LIMIT ${limit} OFFSET ${offset}
  `;
  return NextResponse.json({ items: rows, limit, offset });
}
