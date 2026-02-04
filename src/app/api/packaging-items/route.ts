import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeQueryResult } from '@/lib/db-utils';

export async function GET() {
  const res = await db().query(`
    select *
    from app.packaging_item
    where activo = true
    order by nombre
  `);
  return NextResponse.json(normalizeQueryResult(res));
}

export async function POST(req: Request) {
  const body = await req.json();
  const { nombre, descripcion, unidad, costo_unitario_ars } = body;

  const res = await db().query(
    `
    insert into app.packaging_item
      (nombre, descripcion, unidad, costo_unitario_ars)
    values ($1,$2,$3,$4)
    returning *
    `,
    [nombre, descripcion ?? null, unidad ?? 'unidad', costo_unitario_ars]
  );

  return NextResponse.json(normalizeQueryResult(res)[0]);
}
