// /app/api/catalog/route.ts
import { NextResponse } from "next/server";
// Usa el mismo import de SQL que ya venías usando.
// Si tenías @neondatabase/serverless:
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

// Si en tu proyecto usas otro cliente (p. ej. @vercel/postgres o un wrapper),
// deja tu import anterior y borra las 3 líneas de arriba.

type CatalogRow = {
  product_presentation_id: number;
  product_id: number;
  prod_name: string;
  prov_qty: number | null;
  prov_uom: string | null;
  chosen_uom: string | null;
};

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Trae las presentaciones del proveedor (ajusta tu SQL real aquí)
    const { rows } = await sql/*sql*/`
      SELECT
        pp.id                 AS product_presentation_id,
        p.id                  AS product_id,
        CONCAT(p.nombre, ' – ', pr.razon_social) AS prod_name,
        pp.qty                AS prov_qty,
        pp.uom                AS prov_uom,
        pp.chosen_uom         AS chosen_uom
      FROM product_presentations pp
      JOIN products p   ON p.id = pp.product_id
      LEFT JOIN providers pr ON pr.id = pp.provider_id
      ORDER BY p.nombre ASC, pp.id ASC
    `;

    const items: CatalogRow[] = rows.map((r: any) => ({
      product_presentation_id: Number(
        r.product_presentation_id ?? r.pres_id ?? r.id
      ),
      product_id: Number(r.product_id),
      prod_name: String(r.prod_name ?? r.nombre ?? r.product_name),
      // muchas veces numeric llega como string → Number(...)
      prov_qty:
        r.prov_qty === null || r.prov_qty === undefined
          ? null
          : Number(r.prov_qty),
      prov_uom: r.prov_uom ?? r.uom ?? null,
      chosen_uom: r.chosen_uom ?? null,
    }));

    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
