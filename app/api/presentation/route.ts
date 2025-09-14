import { sql } from '@/lib/db';

export async function PATCH(req: Request) {
  const { productPresentationId, qty } = await req.json();
  const id = Number(productPresentationId);
  const qv = Number(String(qty).replace(/\./g, ''));

  if (!id || !Number.isInteger(id)) return new Response('productPresentationId inválido', { status: 400 });
  if (!qv || !Number.isInteger(qv) || qv <= 0) return new Response('qty inválido', { status: 400 });

  await sql`UPDATE src.supplier_presentations SET qty=${qv} WHERE id=${id}`;
  return Response.json({ ok: true, qty: qv });
}
