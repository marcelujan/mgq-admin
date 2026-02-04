import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeQueryResult } from '@/lib/db-utils';

export async function GET(
  _req: Request,
  { params }: { params: { oferta_id: string } }
) {
  const res = await db().query(
    `
    select op.*, pi.nombre, pi.unidad, pi.costo_unitario_ars
    from app.producto_oferta_packaging op
    join app.packaging_item pi
      on pi.packaging_item_id = op.packaging_item_id
    where op.oferta_id = $1
    order by pi.nombre
    `,
    [params.oferta_id]
  );

  return NextResponse.json(normalizeQueryResult(res));
}

export async function POST(
  req: Request,
  { params }: { params: { oferta_id: string } }
) {
  const body = await req.json();

  const res = await db().query(
    `
    insert into app.producto_oferta_packaging
      (oferta_id, packaging_item_id, cantidad, costo_unitario_override_ars)
    values ($1,$2,$3,$4)
    returning *
    `,
    [
      params.oferta_id,
      body.packaging_item_id,
      body.cantidad,
      body.costo_unitario_override_ars ?? null,
    ]
  );

  return NextResponse.json(normalizeQueryResult(res)[0]);
}
