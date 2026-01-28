import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sql = db();

  // Asumo que existe:
  // - app.proveedor (proveedor_id, nombre, ...)
  // - app.motor_proveedor (proveedor_id, motor_id, ..., updated_at)
  //
  // Si tu relación es otra (ej app.oferta_proveedor), decime el esquema real y lo ajusto.
  const rows = (await sql`
    select
      p.proveedor_id,
      p.nombre as proveedor_nombre,
      mp.motor_id
    from app.proveedor p
    left join lateral (
      select motor_id
      from app.motor_proveedor
      where proveedor_id = p.proveedor_id
      order by updated_at desc nulls last
      limit 1
    ) mp on true
    order by p.nombre asc;
  `) as any[];

  return NextResponse.json({
    ok: true,
    proveedores: rows.map((r) => ({
      proveedor_id: Number(r.proveedor_id),
      proveedor_nombre: String(r.proveedor_nombre ?? ""),
      motor_id: r.motor_id === null || r.motor_id === undefined ? null : Number(r.motor_id),
    })),
  });
}
