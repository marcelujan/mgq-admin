import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

type Ctx = { params: Promise<{ item_paqueteria_id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { item_paqueteria_id: idStr } = await params;
    const item_paqueteria_id = Number(idStr);
    if (!Number.isFinite(item_paqueteria_id)) return NextResponse.json({ ok: false, error: "item_paqueteria_id inválido" }, { status: 400 });

    const sql = db();
    const r: any = await sql.query(
      `
      SELECT item_paqueteria_id, nombre, descripcion, activo, created_at, updated_at
      FROM app.item_paqueteria
      WHERE item_paqueteria_id = $1
      `,
      [item_paqueteria_id]
    );
    const rows = normalizeQueryResult(r);
    if (!rows.length) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, item: rows[0] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { item_paqueteria_id: idStr } = await params;
    const item_paqueteria_id = Number(idStr);
    if (!Number.isFinite(item_paqueteria_id)) return NextResponse.json({ ok: false, error: "item_paqueteria_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const sql = db();

    const currentRes: any = await sql.query(`SELECT * FROM app.item_paqueteria WHERE item_paqueteria_id = $1`, [item_paqueteria_id]);
    const current = normalizeQueryResult(currentRes)?.[0];
    if (!current) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });

    const hasNombre = Object.prototype.hasOwnProperty.call(body, "nombre");
    const nombre = hasNombre ? String(body?.nombre ?? "").trim() : String(current.nombre ?? "");
    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 422 });

    const hasDescripcion = Object.prototype.hasOwnProperty.call(body, "descripcion");
    const descripcion = hasDescripcion ? (typeof body?.descripcion === "string" ? body.descripcion.trim() : "") : String(current.descripcion ?? "");

    const hasActivo = Object.prototype.hasOwnProperty.call(body, "activo");
    const activo = hasActivo ? Boolean(body?.activo) : Boolean(current.activo);

    await sql.query(
      `
      UPDATE app.item_paqueteria
      SET nombre = $1,
          descripcion = $2,
          activo = $3,
          updated_at = now()
      WHERE item_paqueteria_id = $4
      `,
      [nombre, descripcion || null, activo, item_paqueteria_id]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { item_paqueteria_id: idStr } = await params;
    const item_paqueteria_id = Number(idStr);
    if (!Number.isFinite(item_paqueteria_id)) return NextResponse.json({ ok: false, error: "item_paqueteria_id inválido" }, { status: 400 });

    const sql = db();
    await sql.query(`DELETE FROM app.item_paqueteria WHERE item_paqueteria_id = $1`, [item_paqueteria_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message ?? "error");
    if (msg.includes("violates foreign key constraint")) {
      return NextResponse.json({ ok: false, error: "no se puede borrar: item usado en relaciones" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
