import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
  req: Request,
  { params }: { params: { oferta_packaging_id: string } }
) {
  const body = await req.json();

  await db().query(
    `
    update app.producto_oferta_packaging
    set cantidad = coalesce($1,cantidad),
        costo_unitario_override_ars = coalesce($2,costo_unitario_override_ars),
        updated_at = now()
    where oferta_packaging_id = $3
    `,
    [
      body.cantidad ?? null,
      body.costo_unitario_override_ars ?? null,
      params.oferta_packaging_id,
    ]
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { oferta_packaging_id: string } }
) {
  await db().query(
    `delete from app.producto_oferta_packaging where oferta_packaging_id = $1`,
    [params.oferta_packaging_id]
  );
  return NextResponse.json({ ok: true });
}
