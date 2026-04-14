import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function originCount(proveedor_item_id: number | null, manual_cost_option_id: number | null): number {
  return Number(proveedor_item_id !== null) + Number(manual_cost_option_id !== null);
}

type Ctx = { params: Promise<{ item_envase_id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { item_envase_id: idStr } = await params;
    const item_envase_id = Number(idStr);
    if (!Number.isFinite(item_envase_id)) return NextResponse.json({ ok: false, error: "item_envase_id inválido" }, { status: 400 });

    const sql = db();
    const r: any = await sql.query(
      `
      SELECT item_envase_id, nombre, descripcion, proveedor_item_id, manual_cost_option_id, activo, created_at, updated_at
      FROM app.item_envase
      WHERE item_envase_id = $1
      `,
      [item_envase_id]
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
    const { item_envase_id: idStr } = await params;
    const item_envase_id = Number(idStr);
    if (!Number.isFinite(item_envase_id)) return NextResponse.json({ ok: false, error: "item_envase_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const sql = db();

    const currentRes: any = await sql.query(`SELECT * FROM app.item_envase WHERE item_envase_id = $1`, [item_envase_id]);
    const current = normalizeQueryResult(currentRes)?.[0];
    if (!current) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });

    const hasNombre = Object.prototype.hasOwnProperty.call(body, "nombre");
    const nombre = hasNombre ? String(body?.nombre ?? "").trim() : String(current.nombre ?? "");
    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 422 });

    const hasDescripcion = Object.prototype.hasOwnProperty.call(body, "descripcion");
    const descripcion = hasDescripcion ? (typeof body?.descripcion === "string" ? body.descripcion.trim() : "") : String(current.descripcion ?? "");

    const hasProveedor = Object.prototype.hasOwnProperty.call(body, "proveedor_item_id");
    const hasManual = Object.prototype.hasOwnProperty.call(body, "manual_cost_option_id");
    const proveedor_item_id = hasProveedor ? numOrNull(body?.proveedor_item_id) : numOrNull(current.proveedor_item_id);
    const manual_cost_option_id = hasManual ? numOrNull(body?.manual_cost_option_id) : numOrNull(current.manual_cost_option_id);
    if (originCount(proveedor_item_id, manual_cost_option_id) !== 1) {
      return NextResponse.json({ ok: false, error: "origen técnico inválido" }, { status: 422 });
    }

    const hasActivo = Object.prototype.hasOwnProperty.call(body, "activo");
    const activo = hasActivo ? Boolean(body?.activo) : Boolean(current.activo);

    await sql.query(
      `
      UPDATE app.item_envase
      SET nombre = $1,
          descripcion = $2,
          proveedor_item_id = $3,
          manual_cost_option_id = $4,
          activo = $5,
          updated_at = now()
      WHERE item_envase_id = $6
      `,
      [nombre, descripcion || null, proveedor_item_id, manual_cost_option_id, activo, item_envase_id]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { item_envase_id: idStr } = await params;
    const item_envase_id = Number(idStr);
    if (!Number.isFinite(item_envase_id)) return NextResponse.json({ ok: false, error: "item_envase_id inválido" }, { status: 400 });

    const sql = db();
    await sql.query(`DELETE FROM app.item_envase WHERE item_envase_id = $1`, [item_envase_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message ?? "error");
    if (msg.includes("violates foreign key constraint")) {
      return NextResponse.json({ ok: false, error: "no se puede borrar: item usado en relaciones" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
