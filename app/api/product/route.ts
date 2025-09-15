import { sql } from '@/lib/db';
export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  const { productId, nombre, prov_url, prov_desc } = await req.json();
  if (!productId) return new Response('productId requerido', { status: 400 });

  // Normalización simple
  const urlNorm = typeof prov_url === 'string' && prov_url.trim() !== '' ? prov_url.trim() : null;
  const descNorm = typeof prov_desc === 'string' ? prov_desc : undefined;
  const nombreNorm = typeof nombre === 'string' && nombre.trim() !== '' ? nombre.trim() : undefined;

  // Ejecuta solo los updates provistos
  if (nombreNorm !== undefined) {
    await sql`UPDATE app.products SET nombre=${nombreNorm} WHERE id=${productId}`;
  }
  if (urlNorm !== undefined) {
    await sql`UPDATE app.products SET prov_url=${urlNorm} WHERE id=${productId}`;
  }
  if (descNorm !== undefined) {
    await sql`UPDATE app.products SET prov_desc=${descNorm} WHERE id=${productId}`;
  }

  return Response.json({ ok: true });
}
