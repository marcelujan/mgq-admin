import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const REBUILD_SQL = `
WITH
pp AS (
  SELECT id AS product_presentation_id, product_id, prov_pres AS qty, prov_uom_id AS uom_id
  FROM app.product_presentations
),
map AS (
  SELECT psp.product_id, psp.supplier_presentation_id
  FROM app.product_source_presentations psp
),
sp AS (
  SELECT sp.id AS supplier_presentation_id, sp.supplier_item_id, sp.qty, sp.uom_id
  FROM src.supplier_presentations sp
),
si AS (
  SELECT si.id AS supplier_item_id,
         si.nombre_proveedor      AS prov_articulo,
         si.descripcion_proveedor AS prov_desc,
         si.url                   AS prov_url,
         si.updated_at
  FROM src.supplier_items si
),
u AS (
  SELECT id, codigo FROM ref.uoms
),
cost AS (
  SELECT c.product_presentation_id, c.costo_ars
  FROM app.v_product_costs c
),
dens AS (
  SELECT product_id, g_per_ml FROM app.product_meta
),
match_full AS (
  SELECT
    pp.product_id,
    pp.product_presentation_id,
    sp.qty,
    sp.uom_id,
    si.prov_articulo,
    si.prov_desc,
    si.prov_url,
    si.updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY pp.product_presentation_id
      ORDER BY si.updated_at DESC NULLS LAST, si.supplier_item_id DESC NULLS LAST
    ) AS rn
  FROM pp
  LEFT JOIN map m ON m.product_id = pp.product_id
  LEFT JOIN sp  ON sp.supplier_presentation_id = m.supplier_presentation_id
  LEFT JOIN si  ON si.supplier_item_id = sp.supplier_item_id
)
INSERT INTO app.proveedor (
  prov_favoritos,
  prov_articulo,
  prov_presentacion,
  prov_uom,
  prov_costo,
  prov_costoun,
  prov_act,
  prov_url,
  prov_descripcion,
  prov_densidad
)
SELECT
  false AS prov_favoritos,
  mt.prov_articulo,
  mt.qty::bigint AS prov_presentacion,
  CASE WHEN u.codigo IN ('g','GR') THEN 'GR'
       WHEN u.codigo IN ('mL','ML','cm3') THEN 'ML'
       ELSE 'UN' END AS prov_uom,
  c.costo_ars::bigint AS prov_costo,
  ROUND(CASE
    WHEN u.codigo IN ('g','GR','mL','ML','cm3')
      THEN (c.costo_ars::numeric / NULLIF(mt.qty,0)) * 1000
    ELSE (c.costo_ars::numeric / NULLIF(mt.qty,0))
  END)::bigint AS prov_costoun,
  mt.updated_at::date AS prov_act,
  mt.prov_url,
  mt.prov_desc       AS prov_descripcion,
  COALESCE(d.g_per_ml, 1.00)::numeric(10,2) AS prov_densidad
FROM match_full mt
LEFT JOIN u ON u.id = mt.uom_id
LEFT JOIN cost c ON c.product_presentation_id = mt.product_presentation_id
LEFT JOIN dens d ON d.product_id = mt.product_id
WHERE mt.rn = 1;
`;

export async function POST(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    // Por defecto: TRUNCATE y reconstruir todo (si querés incremental, lo cambiamos por MERGE/UPSERT)
    await sql(`TRUNCATE TABLE app.proveedor;`);
    await sql(REBUILD_SQL);

    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}