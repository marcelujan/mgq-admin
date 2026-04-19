import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function rowsOf(res: any): any[] {
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

export async function PATCH(req: NextRequest, ctx: { params: { item_comercial_id: string; item_comercial_etiqueta_id: string } }) {
  try {
    const item_comercial_id = Number(ctx.params.item_comercial_id);
    const item_comercial_etiqueta_id = Number(ctx.params.item_comercial_etiqueta_id);
    if (!Number.isFinite(item_comercial_id) || item_comercial_id <= 0 || !Number.isFinite(item_comercial_etiqueta_id) || item_comercial_etiqueta_id <= 0) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const cantidad = body?.cantidad === undefined ? undefined : numOrNull(body?.cantidad);
    const obligatorio = body?.obligatorio === undefined ? undefined : Boolean(body?.obligatorio);

    if (cantidad !== undefined && (!Number.isFinite(cantidad as number) || Number(cantidad) <= 0)) {
      return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 422 });
    }
    if (cantidad === undefined && obligatorio === undefined) {
      return NextResponse.json({ ok: true });
    }

    const sets: string[] = [];
    const values: any[] = [];
    let p = 1;
    if (cantidad !== undefined) {
      sets.push(`cantidad = $${p++}`);
      values.push(cantidad);
    }
    if (obligatorio !== undefined) {
      sets.push(`obligatorio = $${p++}`);
      values.push(obligatorio);
    }
    values.push(item_comercial_id, item_comercial_etiqueta_id);

    const sql = db();
    const r: any = await sql.query(
      `
      UPDATE app.item_comercial_etiqueta
      SET ${sets.join(", ")}, updated_at = now()
      WHERE item_comercial_id = $${p++} AND item_comercial_etiqueta_id = $${p}
      RETURNING item_comercial_etiqueta_id
      `,
      values
    );
    const row = rowsOf(r)[0] ?? null;
    if (!row) return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, item_comercial_etiqueta_id: row.item_comercial_etiqueta_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, ctx: { params: { item_comercial_id: string; item_comercial_etiqueta_id: string } }) {
  try {
    const item_comercial_id = Number(ctx.params.item_comercial_id);
    const item_comercial_etiqueta_id = Number(ctx.params.item_comercial_etiqueta_id);
    if (!Number.isFinite(item_comercial_id) || item_comercial_id <= 0 || !Number.isFinite(item_comercial_etiqueta_id) || item_comercial_etiqueta_id <= 0) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }
    const sql = db();
    const r: any = await sql.query(
      `DELETE FROM app.item_comercial_etiqueta WHERE item_comercial_id = $1 AND item_comercial_etiqueta_id = $2 RETURNING item_comercial_etiqueta_id`,
      [item_comercial_id, item_comercial_etiqueta_id]
    );
    const row = rowsOf(r)[0] ?? null;
    if (!row) return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
