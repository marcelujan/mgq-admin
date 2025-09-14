import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest){
  try{
    const url = req.nextUrl;
    const q           = url.searchParams.get('q') ?? '';
    const uom         = url.searchParams.get('uom');       // 'UN','KG','LT', etc.
    const minQty      = url.searchParams.get('min_qty');
    const maxQty      = url.searchParams.get('max_qty');
    const onlyInterest= url.searchParams.get('only_interest') === '1';
    const hasCost     = url.searchParams.get('has_cost') === '1';
    const hasPrice    = url.searchParams.get('has_price') === '1';
    const limit  = Number(url.searchParams.get('limit')  ?? 500);
    const offset = Number(url.searchParams.get('offset') ?? 0);

    const rows = await sql`
      SELECT v.product_id, v.product_presentation_id, p.nombre, v.qty, u.codigo AS uom,
            v.costo_ars, v.precio_sugerido_ars, v.fecha_costo,
            (ip.product_id IS NOT NULL) AS interest
      FROM app.v_price_suggestion v
      JOIN app.products p ON p.id = v.product_id
      LEFT JOIN ref.uoms u ON u.id = v.uom_id
      LEFT JOIN app.interest_products ip ON ip.product_id = v.product_id
      WHERE
        (${q} = '' OR p.nombre ILIKE '%' || ${q} || '%' OR CAST(v.product_id AS text) = ${q})
        AND (${uom}    IS NULL OR u.codigo = ${uom})
        AND (${minQty} IS NULL OR v.qty >= CAST(${minQty} AS numeric))
        AND (${maxQty} IS NULL OR v.qty <= CAST(${maxQty} AS numeric))
        AND (${hasCost}  IS NOT TRUE OR v.costo_ars IS NOT NULL)
        AND (${hasPrice} IS NOT TRUE OR v.precio_sugerido_ars IS NOT NULL)
        AND (${onlyInterest} IS NOT TRUE OR ip.product_id IS NOT NULL)
      ORDER BY v.product_id, v.product_presentation_id
      LIMIT ${limit} OFFSET ${offset}`;
    return Response.json(rows);
  } catch (e:any){
    console.error(e);
    return Response.json({error: String(e?.message ?? e)}, { status: 500 });
  }
}
