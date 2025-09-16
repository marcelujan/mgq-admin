import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Ajusta los nombres de tablas si hace falta.
// Asumo:
// - products(id, nombre)
// - product_presentations(id, product_id, qty, uom, density, is_enabled)
// - sales_items(id, product_presentation_id, vend_name, vend_pres, vend_uom, is_enabled, is_formula)
// - sales_item_formula_lines(id, sales_item_id, component_product_id, qty, uom, is_enabled)

export async function GET() {
  try {
    // 1) Traer presentaciones (proveedor)
    const presentations = await sql<{
      product_presentation_id: number;
      product_id: number;
      prod_name: string;
      prov_qty: number | null;
      prov_uom: string | null;
      density: number | null;
      provider_enabled: boolean;
    }>`
      SELECT
        pp.id AS product_presentation_id,
        pp.product_id,
        p.nombre AS prod_name,
        pp.qty AS prov_qty,
        pp.uom AS prov_uom,
        pp.density,
        COALESCE(pp.is_enabled, TRUE) AS provider_enabled
      FROM product_presentations pp
      JOIN products p ON p.id = pp.product_id
      ORDER BY p.nombre, pp.id
    `;

    if (presentations.length === 0) {
      return NextResponse.json({ rows: [] }, { status: 200 });
    }

    const presIds = presentations.map(r => r.product_presentation_id);

    // 2) Ventas por presentación
    const sales = await sql<{
      id: number;
      product_presentation_id: number;
      vend_name: string | null;
      vend_pres: number | null;
      vend_uom: string | null;
      is_enabled: boolean;
      is_formula: boolean;
    }>`
      SELECT id, product_presentation_id, vend_name, vend_pres, vend_uom,
             COALESCE(is_enabled, TRUE) AS is_enabled,
             COALESCE(is_formula, FALSE) AS is_formula
      FROM sales_items
      WHERE product_presentation_id = ANY(${presIds})
      ORDER BY id
    `;

    const saleIds = sales.map(s => s.id);
    let lines: {
      id: number; sales_item_id: number; name: string | null;
      qty: number | null; uom: string | null; is_enabled: boolean;
    }[] = [];

    if (saleIds.length) {
      // 3) Líneas de formulado (si las hay)
      lines = await sql<any>`
        SELECT
          fil.id,
          fil.sales_item_id,
          COALESCE(cp.nombre, '(componente)') AS name,
          fil.qty,
          fil.uom,
          COALESCE(fil.is_enabled, TRUE) AS is_enabled
        FROM sales_item_formula_lines fil
        LEFT JOIN products cp ON cp.id = fil.component_product_id
        WHERE fil.sales_item_id = ANY(${saleIds})
        ORDER BY fil.id
      `;
    }

    // Armar respuesta
    const salesByPres = new Map<number, any[]>();
    for (const s of sales) {
      salesByPres.set(s.product_presentation_id, [
        ...(salesByPres.get(s.product_presentation_id) || []),
        { ...s, formula_lines: [] as any[] },
      ]);
    }
    const linesBySale = new Map<number, any[]>();
    for (const fl of lines) {
      linesBySale.set(fl.sales_item_id, [
        ...(linesBySale.get(fl.sales_item_id) || []),
        { id: fl.id, name: fl.name, qty: fl.qty, uom: fl.uom, is_enabled: fl.is_enabled },
      ]);
    }
    // inyectar líneas
    for (const arr of salesByPres.values()) {
      for (const s of arr) {
        s.formula_lines = linesBySale.get(s.id) || [];
      }
    }

    const rows = presentations.map(pr => ({
      product_id: pr.product_id,
      product_presentation_id: pr.product_presentation_id,
      prod_name: pr.prod_name,
      prov_qty: pr.prov_qty,
      prov_uom: pr.prov_uom,
      density: pr.density,
      provider_enabled: pr.provider_enabled,
      sales: salesByPres.get(pr.product_presentation_id) || [],
    }));

    return NextResponse.json({ rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
