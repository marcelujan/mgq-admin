import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeCodigo(raw: string): string {
  const base = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return base || "PROVEEDOR";
}

export async function GET() {
  const sql = db();

  const rows = (await sql`
    select
      p.proveedor_id,
      p.nombre as proveedor_nombre,
      coalesce(p.motor_id_default, mp.motor_id) as motor_id
    from app.proveedor p
    left join lateral (
      select motor_id
      from app.motor_proveedor
      where proveedor_id = p.proveedor_id
      order by updated_at desc nulls last, motor_id asc
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

export async function POST(req: Request) {
  try {
    const sql = db();
    const body = await req.json().catch(() => ({} as any));

    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    const codigoInput = typeof body?.codigo === "string" ? body.codigo.trim() : "";
    const motorRaw = Number(body?.motor_id_default ?? body?.motor_id ?? 0);
    const motorIdDefault = Number.isFinite(motorRaw) && motorRaw > 0 ? Math.trunc(motorRaw) : null;

    if (!nombre) {
      return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });
    }
    if (!motorIdDefault) {
      return NextResponse.json({ ok: false, error: "motor_id_default requerido" }, { status: 400 });
    }

    const codigo = normalizeCodigo(codigoInput || nombre);

    const dup = (await sql`
      select proveedor_id, nombre, codigo
      from app.proveedor
      where upper(codigo) = upper(${codigo})
      limit 1
    `) as any[];

    if ((dup?.length ?? 0) > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `codigo ya existente: ${codigo}`,
          proveedor_id: Number(dup[0].proveedor_id),
          proveedor_nombre: String(dup[0].nombre ?? ""),
          codigo: String(dup[0].codigo ?? codigo),
        },
        { status: 409 }
      );
    }

    const created = (await sql`
      insert into app.proveedor (nombre, codigo, activo, motor_id_default, created_at, updated_at)
      values (${nombre}, ${codigo}, true, ${motorIdDefault}, now(), now())
      returning proveedor_id, nombre, codigo, motor_id_default, activo
    `) as any[];

    const row = created?.[0];
    if (!row) throw new Error("proveedor_insert_failed");

    try {
      await sql`
        insert into app.motor_proveedor (proveedor_id, motor_id, updated_at)
        values (${row.proveedor_id}, ${motorIdDefault}, now())
      `;
    } catch {
      // compat: si no existe tabla/constraint esperada, no bloqueamos el alta.
    }

    return NextResponse.json({
      ok: true,
      proveedor: {
        proveedor_id: Number(row.proveedor_id),
        proveedor_nombre: String(row.nombre ?? nombre),
        codigo: String(row.codigo ?? codigo),
        motor_id: Number(row.motor_id_default ?? motorIdDefault),
        activo: row.activo !== false,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 500 });
  }
}
