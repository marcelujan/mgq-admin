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

function countOrigins(proveedor_item_id: number | null, manual_cost_option_id: number | null, formulado_item_formulado_id: number | null): number {
  return Number(proveedor_item_id !== null) + Number(manual_cost_option_id !== null) + Number(formulado_item_formulado_id !== null);
}

function familyOfUom(uom: string | null | undefined): "mass" | "volume" | "unit" | null {
  const x = String(uom ?? "").trim().toUpperCase();
  if (x === "GR") return "mass";
  if (x === "ML") return "volume";
  if (x === "UN") return "unit";
  return null;
}

function unitsAreCompatible(itemUom: string, refUom: string | null | undefined): boolean {
  const fromFamily = familyOfUom(refUom);
  const toFamily = familyOfUom(itemUom);
  if (!fromFamily || !toFamily) return true;
  if (fromFamily === "unit" || toFamily === "unit") return fromFamily === toFamily;
  return true;
}

async function resolveOriginRefUom(sql: any, proveedor_item_id: number | null, manual_cost_option_id: number | null, formulado_item_formulado_id: number | null): Promise<string | null> {
  if (proveedor_item_id !== null) {
    const r: any = await sql.query(`SELECT uom FROM app.item_seguimiento WHERE item_id = $1`, [proveedor_item_id]);
    return normalizeQueryResult(r)?.[0]?.uom ?? null;
  }
  if (manual_cost_option_id !== null) {
    const r: any = await sql.query(`SELECT uom FROM app.cost_option WHERE cost_option_id = $1`, [manual_cost_option_id]);
    return normalizeQueryResult(r)?.[0]?.uom ?? null;
  }
  if (formulado_item_formulado_id !== null) {
    const r: any = await sql.query(`SELECT uom FROM app.item_formulado WHERE item_formulado_id = $1`, [formulado_item_formulado_id]);
    return normalizeQueryResult(r)?.[0]?.uom ?? null;
  }
  return null;
}

type Ctx = { params: Promise<{ item_comercial_id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { item_comercial_id: idStr } = await params;
    const item_comercial_id = Number(idStr);
    if (!Number.isFinite(item_comercial_id)) return NextResponse.json({ ok: false, error: "item_comercial_id inválido" }, { status: 400 });

    const sql = db();
    const r: any = await sql.query(
      `
      SELECT item_comercial_id, nombre, descripcion, cantidad, unidad, proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id, activo, created_at, updated_at
      FROM app.item_comercial
      WHERE item_comercial_id = $1
      `,
      [item_comercial_id]
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
    const { item_comercial_id: idStr } = await params;
    const item_comercial_id = Number(idStr);
    if (!Number.isFinite(item_comercial_id)) return NextResponse.json({ ok: false, error: "item_comercial_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const sql = db();
    const currentRes: any = await sql.query(`SELECT * FROM app.item_comercial WHERE item_comercial_id = $1`, [item_comercial_id]);
    const current = normalizeQueryResult(currentRes)?.[0];
    if (!current) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });

    const hasNombre = Object.prototype.hasOwnProperty.call(body, "nombre");
    const nombre = hasNombre ? String(body?.nombre ?? "").trim() : String(current.nombre ?? "");
    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 422 });

    const hasDescripcion = Object.prototype.hasOwnProperty.call(body, "descripcion");
    const descripcion = hasDescripcion ? (typeof body?.descripcion === "string" ? body.descripcion.trim() : "") : String(current.descripcion ?? "");

    const hasCantidad = Object.prototype.hasOwnProperty.call(body, "cantidad");
    const cantidad = hasCantidad ? numOrNull(body?.cantidad) : numOrNull(current.cantidad);
    if (cantidad !== null && (!Number.isFinite(cantidad as number) || Number(cantidad) <= 0)) {
      return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 422 });
    }

    const hasUnidad = Object.prototype.hasOwnProperty.call(body, "unidad");
    const unidadRaw = hasUnidad
      ? (body?.unidad === null || body?.unidad === undefined || body?.unidad === "" ? null : String(body?.unidad ?? "").trim().toUpperCase())
      : (current.unidad === null || current.unidad === undefined || current.unidad === "" ? null : String(current.unidad ?? "").trim().toUpperCase());
    const unidad = unidadRaw as string | null;
    if (unidad !== null && !["GR", "ML", "UN"].includes(unidad)) {
      return NextResponse.json({ ok: false, error: "unidad inválida" }, { status: 422 });
    }
    if (unidad === "UN" && cantidad !== null && !Number.isInteger(Number(cantidad))) {
      return NextResponse.json({ ok: false, error: "UN requiere cantidad entera" }, { status: 422 });
    }

    const hasProveedor = Object.prototype.hasOwnProperty.call(body, "proveedor_item_id");
    const hasManual = Object.prototype.hasOwnProperty.call(body, "manual_cost_option_id");
    const hasFormulado = Object.prototype.hasOwnProperty.call(body, "formulado_item_formulado_id");
    const proveedor_item_id = hasProveedor ? numOrNull(body?.proveedor_item_id) : numOrNull(current.proveedor_item_id);
    const manual_cost_option_id = hasManual ? numOrNull(body?.manual_cost_option_id) : numOrNull(current.manual_cost_option_id);
    const formulado_item_formulado_id = hasFormulado ? numOrNull(body?.formulado_item_formulado_id) : numOrNull(current.formulado_item_formulado_id);
    if (countOrigins(proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id) > 1) {
      return NextResponse.json({ ok: false, error: "origen técnico inválido" }, { status: 422 });
    }

    const hasActivo = Object.prototype.hasOwnProperty.call(body, "activo");
    const activo = hasActivo ? Boolean(body?.activo) : Boolean(current.activo);

    if (unidad !== null && countOrigins(proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id) === 1) {
      const refUom = await resolveOriginRefUom(sql, proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id);
      if (!unitsAreCompatible(unidad, refUom)) {
        return NextResponse.json({ ok: false, error: "La unidad del Item Comercial es incompatible con la unidad del bulk/origen técnico" }, { status: 422 });
      }
    }

    await sql.query(
      `
      UPDATE app.item_comercial
      SET nombre = $1,
          descripcion = $2,
          cantidad = $3,
          unidad = $4,
          proveedor_item_id = $5,
          manual_cost_option_id = $6,
          formulado_item_formulado_id = $7,
          activo = $8,
          updated_at = now()
      WHERE item_comercial_id = $9
      `,
      [nombre, descripcion || null, cantidad, unidad, proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id, activo, item_comercial_id]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { item_comercial_id: idStr } = await params;
    const item_comercial_id = Number(idStr);
    if (!Number.isFinite(item_comercial_id)) return NextResponse.json({ ok: false, error: "item_comercial_id inválido" }, { status: 400 });

    const sql = db();
    await sql.query(`DELETE FROM app.item_comercial WHERE item_comercial_id = $1`, [item_comercial_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message ?? "error");
    if (msg.includes("violates foreign key constraint")) {
      return NextResponse.json({ ok: false, error: "no se puede borrar: item usado en relaciones" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
