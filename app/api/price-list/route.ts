import { NextRequest } from 'next/server'; import { sql } from '@/lib/db';
export async function GET(req: NextRequest){
  const q=req.nextUrl.searchParams.get('q')??''; const limit=Number(req.nextUrl.searchParams.get('limit')??100); const offset=Number(req.nextUrl.searchParams.get('offset')??0);
  if(q){ const rows=await sql`
    SELECT v.product_id, v.product_presentation_id, p.nombre, v.qty, u.codigo AS uom,
           v.costo_ars, v.precio_sugerido_ars, v.fecha_costo
    FROM app.v_price_suggestion v
    JOIN app.products p ON p.id = v.product_id
    LEFT JOIN ref.uoms u ON u.id = v.uom_id
    WHERE p.nombre ILIKE '%' || ${q} || '%' OR CAST(v.product_id AS text) = ${q}
    ORDER BY v.product_id, v.product_presentation_id
    LIMIT ${limit} OFFSET ${offset}`; return Response.json(rows); }
  const rows=await sql`
    SELECT v.product_id, v.product_presentation_id, p.nombre, v.qty, u.codigo AS uom,
           v.costo_ars, v.precio_sugerido_ars, v.fecha_costo
    FROM app.v_price_suggestion v
    JOIN app.products p ON p.id = v.product_id
    LEFT JOIN ref.uoms u ON u.id = v.uom_id
    ORDER BY v.product_id, v.product_presentation_id
    LIMIT ${limit} OFFSET ${offset}`; return Response.json(rows);
}