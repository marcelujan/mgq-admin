import { sql } from '@/lib/db';

export async function PATCH(req: Request) {
  const { productPresentationId, costo } = await req.json();
  const spId = Number(productPresentationId);
  const costoInt = Number(String(costo).replace(/\./g, ''));

  if (!spId || !Number.isInteger(spId)) return new Response('productPresentationId inválido', { status: 400 });
  if (!Number.isInteger(costoInt) || costoInt < 0) return new Response('costo inválido', { status: 400 });

  // supplier_id de la presentación
  const sup = await sql`
    SELECT si.supplier_id
    FROM src.supplier_items si
    JOIN src.supplier_presentations sp ON sp.supplier_item_id = si.id
    WHERE sp.id = ${spId}
  `;
  if (sup.length === 0) return new Response('presentación inexistente', { status: 404 });

  // último batch MANUAL de ese supplier
  const b = await sql`
    SELECT id
    FROM src.price_snapshot_batches
    WHERE supplier_id=${sup[0].supplier_id} AND source='manual'
    ORDER BY fecha DESC LIMIT 1
  `;
  if (b.length === 0) return new Response('no existe batch manual para este proveedor', { status: 409 });

  // upsert línea (asumiendo UNIQUE (batch_id, supplier_presentation_id))
  await sql`
    INSERT INTO src.price_snapshot_lines (batch_id, supplier_presentation_id, precio_ars)
    VALUES (${b[0].id}, ${spId}, ${costoInt})
    ON CONFLICT (batch_id, supplier_presentation_id)
    DO UPDATE SET precio_ars=EXCLUDED.precio_ars
  `;
  return Response.json({ ok: true, costo_ars: costoInt });
}
