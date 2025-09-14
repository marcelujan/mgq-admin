import { sql } from '@/lib/db';

export async function GET() {
  const rows = await sql`SELECT product_id FROM app.interest_products`;
  return Response.json(rows.map((r:any)=>r.product_id));
}

export async function PATCH(req: Request){
  const { productId, interest } = await req.json();
  if(!productId) return new Response('productId required',{status:400});
  if(interest){
    await sql`INSERT INTO app.interest_products (product_id) VALUES (${productId}) ON CONFLICT (product_id) DO NOTHING`;
  } else {
    await sql`DELETE FROM app.interest_products WHERE product_id=${productId}`;
  }
  return Response.json({ok:true});
}
