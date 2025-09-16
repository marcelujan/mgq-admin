import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

type CatalogRow = {
  product_presentation_id: number;
  product_id: number;
  prod_name: string;
  prov_qty: number | null;
  prov_uom: string | null;
  chosen_uom: string | null;
};

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    // Una sola await al final; sin genéricos en el tag `sql`
    const like = "%" + q + "%";
    const query = q !== ""
      ? sql`
          SELECT
            pp.id          AS product_presentation_id,
            p.id           AS product_id,
            CONCAT(p.nombre, ' - ', pr.razon_social) AS prod_name,
            pp.qty         AS prov_qty,
            pp.uom         AS prov_uom,
            pp.chosen_uom  AS chosen_uom
          FROM product_presentations pp
          JOIN products  p  ON p.id  = pp.product_id
          JOIN providers pr ON pr.id = pp.provider_id
          WHERE p.nombre ILIKE ${like}
             OR pr.razon_social ILIKE ${like}
          ORDER BY p.nombre ASC
          LIMIT 100;
        `
      : sql`
          SELECT
            pp.id          AS product_presentation_id,
            p.id           AS product_id,
            CONCAT(p.nombre, ' - ', pr.razon_social) AS prod_name,
            pp.qty         AS prov_qty,
            pp.uom         AS prov_uom,
            pp.chosen_uom  AS chosen_uom
          FROM product_presentations pp
          JOIN products  p  ON p.id  = pp.product_id
          JOIN providers pr ON pr.id = pp.provider_id
          ORDER BY p.nombre ASC
          LIMIT 100;
        `;

    const rows = (await query) as unknown as CatalogRow[];
    return NextResponse.json(rows, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
