import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { packaging_item_id: string } }) {
  try {
    const packaging_item_id = Number(params.packaging_item_id);
    if (!Number.isFinite(packaging_item_id)) {
      return NextResponse.json({ ok: false, error: "packaging_item_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    const hasNombre = Object.prototype.hasOwnProperty.call(body, "nombre");
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : null;

    const hasDescripcion = Object.prototype.hasOwnProperty.call(body, "descripcion");
    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : null;

    const hasCosto = Object.prototype.hasOwnProperty.call(body, "costo_unitario_ars");
    const costo_unitario_ars = numOrNull(body?.costo_unitario_ars);

    const hasActivo = Object.prototype.hasOwnProperty.call(body, "activo");
    const activo = typeof body?.activo === "boolean" ? body.activo : null;

    if (hasNombre && !nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 422 });
    if (hasCosto && (costo_unitario_ars === null || costo_unitario_ars < 0)) {
      return NextResponse.json({ ok: false, error: "costo_unitario_ars inválido" }, { status: 422 });
    }

    const sql = db();

    const r: any = await sql.query(
      `
      UPDATE app.packaging_item
      SET
        nombre = CASE WHEN $1::boolean THEN $2 ELSE nombre END,
        descripcion = CASE WHEN $3::boolean THEN $4 ELSE descripcion END,
        costo_unitario_ars = CASE WHEN $5::boolean THEN $6 ELSE costo_unitario_ars END,
        activo = CASE WHEN $7::boolean THEN $8 ELSE activo END,
        unidad = 'UN',
        updated_at = now()
      WHERE packaging_item_id = $9
      RETURNING packaging_item_id
      `,
      [hasNombre, nombre, hasDescripcion, descripcion || null, hasCosto, costo_unitario_ars, hasActivo, activo, packaging_item_id]
    );

    const rows = normalizeQueryResult(r);
    if (!rows.length) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { packaging_item_id: string } }) {
  try {
    const packaging_item_id = Number(params.packaging_item_id);
    if (!Number.isFinite(packaging_item_id)) {
      return NextResponse.json({ ok: false, error: "packaging_item_id inválido" }, { status: 400 });
    }

    const sql = db();
    await sql.query(`DELETE FROM app.packaging_item WHERE packaging_item_id = $1`, [packaging_item_id]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message ?? "error");
    if (msg.includes("violates foreign key constraint")) {
      return NextResponse.json({ ok: false, error: "no se puede borrar: item usado en ofertas" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
