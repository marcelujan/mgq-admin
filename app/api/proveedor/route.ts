import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    await sql(`CREATE TABLE IF NOT EXISTS app.product_meta (
      product_id bigint primary key,
      g_per_ml numeric(10,2) not null default 1.00
    );`);

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const onlyAct = searchParams.get("activos") === "true";
    const limit = Math.min(Number(searchParams.get("limit") || "100"), 500);
    const offset = Math.max(Number(searchParams.get("offset") || "0"), 0);

    const whereData: string[] = [];
    const whereCount: string[] = [];
    const params: any[] = [];
    const paramsCount: any[] = [];
    let i1 = 1, i2 = 1;

    if (q) {
      whereData.push(`(b.prov_articulo ILIKE $${i1++})`);
      params.push(`%${q}%`);
      whereCount.push(`(mt.prov_articulo ILIKE $${i2++})`);
      paramsCount.push(`%${q}%`);
    }
    if (onlyAct) {
      whereData.push(`EXISTS (SELECT 1 FROM app.enabled_products ep WHERE ep.product_id = b.product_id)`);
      whereCount.push(`EXISTS (SELECT 1 FROM app.enabled_products ep WHERE ep.product_id = mt.product_id)`);
    }

    const whereSQLData = whereData.length ? `WHERE ${whereData.join(" AND ")}` : "";
    const whereSQLCount = whereCount.length ? `WHERE ${whereCount.join(" AND ")}` : "";

    const dataQuery = `
      WITH pp AS (
        SELECT id AS product_presentation_id, product_id, prov_pres AS qty, prov_uom_id AS uom_id
        FROM app.product_presentations
      ), map AS (
        SELECT psp.product_id, psp.supplier_presentation_id
        FROM app.product_source_presentations psp
      ), sp AS (
        SELECT sp.id AS supplier_presentation_id, sp.supplier_item_id, sp.qty, sp.uom_id
        FROM src.supplier_presentations sp
      ), si AS (
        SELECT si.id AS supplier_item_id,
               si.nombre_proveedor AS prov_articulo,
               si.descripcion_proveedor AS prov_desc,
               si.url AS prov_url,
               si.updated_at
        FROM src.supplier_items si
      ), act AS (
        SELECT MAX(updated_at) AS prov_act_ts FROM src.supplier_items
      ), match AS (
        -- ⚠️ No filtres por igualdad de qty/uom: queremos mantener SIEMPRE la fila de pp
        SELECT pp.product_id, pp.product_presentation_id, pp.qty, pp.uom_id,
               si.prov_articulo, si.prov_desc, si.prov_url
        FROM pp
        LEFT JOIN map m ON m.product_id = pp.product_id
        LEFT JOIN sp ON sp.supplier_presentation_id = m.supplier_presentation_id
        LEFT JOIN si ON si.supplier_item_id = sp.supplier_item_id
      ), cost AS (
        SELECT product_presentation_id, costo_ars
        FROM app.v_product_costs
      ), u AS (
        SELECT id, codigo AS uom_code
        FROM ref.uoms
      ), base AS (
        SELECT
          mt.product_id,
          mt.product_presentation_id,
          mt.prov_articulo,
          mt.qty,
          u.uom_code,
          c.costo_ars,
          CASE WHEN mt.qty IS NULL OR mt.qty=0 THEN NULL ELSE (c.costo_ars)::numeric/mt.qty END AS costo_un,
          COALESCE(mt.prov_url, p.prov_url) AS prov_url,
          COALESCE(mt.prov_desc, p.prov_desc) AS prov_desc
        FROM match mt
        LEFT JOIN cost c ON c.product_presentation_id = mt.product_presentation_id
        LEFT JOIN u ON u.id = mt.uom_id
        LEFT JOIN app.products p ON p.id = mt.product_id
      ), gml AS (
        SELECT product_id, g_per_ml FROM app.product_meta
      )
      SELECT
        EXISTS (SELECT 1 FROM app.enabled_products ep WHERE ep.product_id = b.product_id) AS "Prov *",
        b.prov_articulo AS "Prov Artículo",
        CAST(b.qty AS bigint) AS "Prov Pres",
        CASE WHEN b.uom_code='g' THEN 'GR' WHEN b.uom_code='mL' THEN 'ML' WHEN b.uom_code='UN' THEN 'UN' ELSE 'GR' END AS "Prov UOM",
        CAST(b.costo_ars AS bigint) AS "Prov Costo",
        CAST(ROUND(CASE WHEN b.uom_code IN ('g','mL') THEN b.costo_un * 1000 ELSE b.costo_un END) AS bigint) AS "Prov CostoUn",
        (SELECT prov_act_ts FROM act) AS "Prov Act",
        b.prov_url AS "Prov URL",
        b.prov_desc AS "Prov Desc",
        COALESCE(gml.g_per_ml, 1.00)::numeric(10,2) AS "Prov [g/mL]",
        b.product_id AS "_product_id",
        b.product_presentation_id AS "_pp_id"
      FROM base b
      LEFT JOIN gml ON gml.product_id = b.product_id
      ${whereSQLData}
      ORDER BY b.prov_articulo NULLS LAST
      LIMIT ${limit} OFFSET ${offset}`;

    const countQuery = `
      WITH pp AS (
        SELECT id AS product_presentation_id, product_id, prov_pres AS qty, prov_uom_id AS uom_id
        FROM app.product_presentations
      ), map AS (
        SELECT psp.product_id, psp.supplier_presentation_id
        FROM app.product_source_presentations psp
      ), sp AS (
        SELECT sp.id AS supplier_presentation_id, sp.supplier_item_id, sp.qty, sp.uom_id
        FROM src.supplier_presentations sp
      ), si AS (
        SELECT si.id AS supplier_item_id,
               si.nombre_proveedor AS prov_articulo
        FROM src.supplier_items si
      ), match AS (
        SELECT pp.product_id, pp.product_presentation_id, pp.qty, pp.uom_id,
               si.prov_articulo
        FROM pp
        LEFT JOIN map m ON m.product_id = pp.product_id
        LEFT JOIN sp ON sp.supplier_presentation_id = m.supplier_presentation_id
        LEFT JOIN si ON si.supplier_item_id = sp.supplier_item_id
      )
      SELECT COUNT(*)::bigint AS total
      FROM match mt
      ${whereSQLCount}`;

    const rows = await sql(dataQuery, params as any);
    const totalRes = await sql(countQuery, paramsCount as any);
    return NextResponse.json({ rows, total: Number(totalRes[0]?.total || 0) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}