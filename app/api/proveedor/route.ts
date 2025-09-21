import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const onlyAct = searchParams.get("activos") === "true";
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
    const offset = Math.max(Number(searchParams.get("offset") || "0"), 0);

    const where: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (q) { where.push(`(mt.prov_articulo ILIKE $${idx++})`); params.push(`%${q}%`); }
    if (onlyAct) where.push('EXISTS (SELECT 1 FROM app.enabled_products ep WHERE ep.product_id = mt.product_id)');

    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

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
               si.updated_at AS prov_act_ts
        FROM src.supplier_items si
      ), match AS (
        SELECT pp.product_id, pp.product_presentation_id, pp.qty, pp.uom_id,
               si.prov_articulo, si.prov_desc, si.prov_url, si.prov_act_ts
        FROM pp
        LEFT JOIN map m ON m.product_id = pp.product_id
        LEFT JOIN sp ON sp.supplier_presentation_id = m.supplier_presentation_id
        LEFT JOIN si ON si.supplier_item_id = sp.supplier_item_id
        WHERE (sp.qty IS NULL OR sp.qty = pp.qty)
          AND (sp.uom_id IS NULL OR sp.uom_id = pp.uom_id)
      ), cost AS (
        SELECT product_presentation_id, costo_ars, fecha_costo
        FROM app.v_product_costs
      ), u AS (
        SELECT id, codigo AS uom
        FROM ref.uoms
      ), base AS (
        SELECT
          mt.product_id,
          mt.prov_articulo,
          mt.qty,
          u.uom,
          c.costo_ars,
          CASE WHEN mt.qty IS NULL OR mt.qty=0 THEN NULL ELSE (c.costo_ars)::numeric/mt.qty END AS costo_un,
          COALESCE(mt.prov_url, p.prov_url) AS prov_url,
          COALESCE(mt.prov_desc, p.prov_desc) AS prov_desc,
          mt.prov_act_ts
        FROM match mt
        LEFT JOIN cost c ON c.product_presentation_id = mt.product_presentation_id
        LEFT JOIN u ON u.id = mt.uom_id
        LEFT JOIN app.products p ON p.id = mt.product_id
      )
      SELECT
        EXISTS (SELECT 1 FROM app.enabled_products ep WHERE ep.product_id = b.product_id) AS "Prov *",
        b.prov_articulo AS "Prov Artículo",
        b.qty AS "Prov Pres",
        b.uom AS "Prov UOM",
        b.costo_ars AS "Prov Costo",
        b.costo_un AS "Prov CostoUn",
        b.prov_act_ts AS "Prov Act",
        b.prov_url AS "Prov URL",
        b.prov_desc AS "Prov Desc",
        NULL::numeric AS "Prov [g/mL]"
      FROM base b
      JOIN match mt ON mt.product_id = b.product_id AND mt.prov_articulo = b.prov_articulo
      ${whereSQL}
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
               si.nombre_proveedor AS prov_articulo,
               si.descripcion_proveedor AS prov_desc,
               si.url AS prov_url,
               si.updated_at AS prov_act_ts
        FROM src.supplier_items si
      ), match AS (
        SELECT pp.product_id, pp.product_presentation_id, pp.qty, pp.uom_id,
               si.prov_articulo, si.prov_desc, si.prov_url, si.prov_act_ts
        FROM pp
        LEFT JOIN map m ON m.product_id = pp.product_id
        LEFT JOIN sp ON sp.supplier_presentation_id = m.supplier_presentation_id
        LEFT JOIN si ON si.supplier_item_id = sp.supplier_item_id
        WHERE (sp.qty IS NULL OR sp.qty = pp.qty)
          AND (sp.uom_id IS NULL OR sp.uom_id = pp.uom_id)
      )
      SELECT COUNT(*)::bigint AS total
      FROM match mt
      ${whereSQL.replace('mt.prov_articulo','mt.prov_articulo')}`;

    const rows = await sql(dataQuery, params as any);
    const totalRes = await sql(countQuery, params as any);
    return NextResponse.json({ rows, total: Number(totalRes[0]?.total || 0) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}