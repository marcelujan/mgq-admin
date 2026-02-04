import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
  req: Request,
  { params }: { params: { packaging_item_id: string } }
) {
  const body = await req.json();

  await db().query(
    `
    update app.packaging_item
    set nombre = coalesce($1,nombre),
        descripcion = coalesce($2,descripcion),
        unidad = coalesce($3,unidad),
        costo_unitario_ars = coalesce($4,costo_unitario_ars),
        activo = coalesce($5,activo),
        updated_at = now()
    where packaging_item_id = $6
    `,
    [
      body.nombre ?? null,
      body.descripcion ?? null,
      body.unidad ?? null,
      body.costo_unitario_ars ?? null,
      body.activo ?? null,
      params.packaging_item_id,
    ]
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { packaging_item_id: string } }
) {
  await db().query(
    `delete from app.packaging_item where packaging_item_id = $1`,
    [params.packaging_item_id]
  );
  return NextResponse.json({ ok: true });
}
