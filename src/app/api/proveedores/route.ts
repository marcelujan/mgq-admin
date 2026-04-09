import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureBuiltinEuma(sql: any) {
  const existing = (await sql.query(
    `
      select proveedor_id
      from app.proveedor
      where upper(coalesce(codigo, '')) = 'EUMA'
         or upper(coalesce(nombre, '')) = 'EUMA'
      order by proveedor_id asc
      limit 1;
    `
  )) as any;

  const rows = Array.isArray(existing?.rows) ? existing.rows : Array.isArray(existing) ? existing : [];
  const proveedorId = rows?.[0]?.proveedor_id ? Number(rows[0].proveedor_id) : null;

  if (proveedorId) {
    await sql.query(
      `
        update app.proveedor
        set
          nombre = 'EUMA',
          codigo = coalesce(codigo, 'EUMA'),
          activo = true
        where proveedor_id = $1;
      `,
      [proveedorId]
    );
    return proveedorId;
  }

  const inserted = (await sql.query(
    `
      insert into app.proveedor (nombre, codigo, activo)
      values ('EUMA', 'EUMA', true)
      returning proveedor_id;
    `
  )) as any;

  const insRows = Array.isArray(inserted?.rows) ? inserted.rows : Array.isArray(inserted) ? inserted : [];
  return insRows?.[0]?.proveedor_id ? Number(insRows[0].proveedor_id) : null;
}

export async function GET() {
  const sql = db();

  await ensureBuiltinEuma(sql);

  const result = (await sql.query(
    `
      select
        proveedor_id,
        nombre as proveedor_nombre,
        case when upper(coalesce(codigo,''))='EUMA' or upper(coalesce(nombre,''))='EUMA' then 2 else motor_id_default end as motor_id,
        codigo,
        activo
      from app.proveedor
      where coalesce(activo, true) = true
      order by nombre asc, proveedor_id asc;
    `
  )) as any;

  const rows = Array.isArray(result?.rows) ? result.rows : Array.isArray(result) ? result : [];

  return NextResponse.json({
    ok: true,
    proveedores: rows.map((r: any) => ({
      proveedor_id: Number(r.proveedor_id),
      proveedor_nombre: String(r.proveedor_nombre ?? ""),
      motor_id: r.motor_id === null || r.motor_id === undefined ? null : Number(r.motor_id),
      codigo: r.codigo === null || r.codigo === undefined ? null : String(r.codigo),
      activo: r.activo === null || r.activo === undefined ? true : Boolean(r.activo),
    })),
  });
}
