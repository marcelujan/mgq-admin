import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const u = req.nextUrl;
    const q       = u.searchParams.get('q') ?? '';
    const hasCost = u.searchParams.get('has_cost') === '1';
    const showAll = u.searchParams.get('show_all') === '1';
    const limit   = Number(u.searchParams.get('limit')  ?? 500);
    const offset  = Number(u.searchParams.get('offset') ?? 0);

    const rows = await sql`
      SELECT
        v.product_id,
        v.product_presentation_id,
        p.nombre,
        v.qty,
        v.costo_ars,
        v.fecha_costo,
        (ep.product_id IS NOT NULL) AS enabled,
        pu.codigo AS chosen_uom,
        p.prov_url,
        p.prov_desc
      FROM app.v_price_suggestion v
      JOIN app.products p ON p.id = v.product_id
      LEFT JOIN app.enabled_products ep ON ep.product_id = v.product_id
      LEFT JOIN app.product_uom pu ON pu.product_presentation_id = v.product_presentation_id
      WHERE
        ( ${q} = '' OR p.nombre ILIKE '%' || ${q} || '%' OR CAST(v.product_id AS text) = ${q} )
        AND ( ${hasCost} IS NOT TRUE OR v.costo_ars IS NOT NULL )
        AND ( ${showAll} IS TRUE OR ep.product_id IS NOT NULL )
      ORDER BY lower(p.nombre) ASC, v.qty ASC
      LIMIT ${limit}::int OFFSET ${offset}::int
    `;
    return Response.json(rows);
  } catch (e:any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
