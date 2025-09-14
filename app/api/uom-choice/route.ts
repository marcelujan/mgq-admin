import { sql } from '@/lib/db';

export async function PATCH(req: Request) {
  const { productPresentationId, codigo } = await req.json();
  if (!productPresentationId || !codigo) {
    return new Response('productPresentationId y codigo son requeridos', { status: 400 });
  }
  // valida contra la whitelist
  const ok = await sql`SELECT 1 FROM app.allowed_uoms WHERE codigo=${codigo}`;
  if (ok.length === 0) return new Response('UOM no permitida', { status: 400 });

  await sql`
    INSERT INTO app.product_uom (product_presentation_id, codigo)
    VALUES (${productPresentationId}, ${codigo})
    ON CONFLICT (product_presentation_id) DO UPDATE
      SET codigo=EXCLUDED.codigo, updated_at=now()
  `;
  return Response.json({ ok: true });
}
