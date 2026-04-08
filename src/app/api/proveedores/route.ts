import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PROVEEDORES_ACEPTADOS } from "@/lib/proveedores-aceptados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureAcceptedProviders(sql: any) {
  for (const p of PROVEEDORES_ACEPTADOS) {
    const existing = (await sql`
      select proveedor_id
      from app.proveedor
      where upper(coalesce(codigo, '')) = upper(${p.codigo})
         or upper(nombre) = upper(${p.nombre})
      limit 1
    `) as any[];

    if (existing.length > 0) {
      await sql`
        update app.proveedor
        set nombre = ${p.nombre},
            codigo = ${p.codigo},
            activo = true,
            motor_id_default = ${p.motorId}
        where proveedor_id = ${existing[0].proveedor_id}
      `;
    } else {
      await sql`
        insert into app.proveedor (nombre, codigo, activo, motor_id_default)
        values (${p.nombre}, ${p.codigo}, true, ${p.motorId})
      `;
    }
  }
}

export async function GET() {
  const sql = db();
  await ensureAcceptedProviders(sql);

  const rows = (await sql`
    select proveedor_id, nombre as proveedor_nombre, codigo, motor_id_default as motor_id
    from app.proveedor
    where upper(coalesce(codigo, '')) in (${PROVEEDORES_ACEPTADOS[0].codigo}, ${PROVEEDORES_ACEPTADOS[1].codigo})
       or upper(nombre) in (${PROVEEDORES_ACEPTADOS[0].nombre.toUpperCase()}, ${PROVEEDORES_ACEPTADOS[1].nombre.toUpperCase()})
    order by nombre asc
  `) as any[];

  return NextResponse.json({
    ok: true,
    proveedores: rows.map((r) => ({
      proveedor_id: Number(r.proveedor_id),
      proveedor_nombre: String(r.proveedor_nombre ?? ""),
      codigo: String(r.codigo ?? ""),
      motor_id: r.motor_id === null || r.motor_id === undefined ? null : Number(r.motor_id),
    })),
  });
}
