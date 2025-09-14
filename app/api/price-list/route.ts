import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const u = req.nextUrl;
    const q       = u.searchParams.get('q') ?? '';
    const uom     = u.searchParams.get('uom');
    const minQty  = u.searchParams.get('min_qty');
    const maxQty  = u.searchParams.get('max_qty');
    const hasCost = u.searchParams.get('has_cost') === '1';
    const showAll = u.searchParams.get('show_all') === '1';
    const limit   = Number(u.searchParams.get('limit')  ?? 500);
    const offset  = Number(u.searchParams.get('offset') ?? 0);

    const rows = await sql`
      SELECT v.product_id, v.product_presentation_id, p.nombre, v.qty, u.codigo AS uom,
             v.costo_ars, v.precio_sugerido_ars, v.fecha_costo,
             (ep.product_id IS NOT NULL) AS enabled
      FROM app.v_price_suggestion v
      JOIN app.products p ON p.id = v.product_id
      LEFT JOIN ref.uoms u ON u.id = v.uom_id
      LEFT JOIN app.enabled_products ep ON ep.product_id = v.product_id
      WHERE
        ( ${q} = '' OR p.nombre ILIKE '%' || ${q} || '%' OR CAST(v.product_id AS text) = ${q} )
        AND ( ${uom}::text       IS NULL OR u.codigo = ${uom} )
        AND ( ${minQty}::numeric IS NULL OR v.qty >= ${minQty}::numeric )
        AND ( ${maxQty}::numeric IS NULL OR v.qty <= ${maxQty}::numeric )
        AND ( ${hasCost} IS NOT TRUE OR v.costo_ars IS NOT NULL )
        AND ( ${showAll} IS TRUE OR ep.product_id IS NOT NULL )
      ORDER BY v.product_id, v.product_presentation_id
      LIMIT ${limit}::int OFFSET ${offset}::int
    `;
    return Response.json(rows);
  } catch (e:any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
