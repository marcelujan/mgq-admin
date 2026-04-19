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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeInactivos = (searchParams.get("include_inactivos") ?? "false") === "true";
    const search = (searchParams.get("search") ?? "").trim();
    const sql = db();

    const r: any = await sql.query(
      `
      SELECT
        c.item_comercial_id,
        c.nombre,
        c.descripcion,
        c.cantidad,
        c.unidad,
        c.proveedor_item_id,
        c.manual_cost_option_id,
        c.formulado_item_formulado_id,
        c.activo,
        c.created_at,
        c.updated_at,
        CASE
          WHEN c.proveedor_item_id IS NOT NULL THEN 'PROVEEDOR'
          WHEN c.manual_cost_option_id IS NOT NULL THEN 'MANUAL'
          ELSE 'FORMULADO'
        END AS origen_tipo,
        CASE
          WHEN c.proveedor_item_id IS NOT NULL THEN c.proveedor_item_id
          WHEN c.manual_cost_option_id IS NOT NULL THEN c.manual_cost_option_id
          ELSE c.formulado_item_formulado_id::bigint
        END AS origen_id,
        CASE
          WHEN c.proveedor_item_id IS NOT NULL THEN
            trim(both ' ' from concat_ws(' · ', coalesce(pr.nombre,''), nullif(i.descripcion_fuente,''), 'Item #' || i.item_id::text))
          WHEN c.manual_cost_option_id IS NOT NULL THEN
            trim(both ' ' from concat_ws(' · ', 'Manual', coalesce(co.manual_nombre,''), 'ID ' || co.cost_option_id::text))
          ELSE
            trim(both ' ' from concat_ws(' · ', 'Formulado', coalesce(p.nombre,''), 'ID ' || f.item_formulado_id::text))
        END AS origen_label
      FROM app.item_comercial c
      LEFT JOIN app.item_seguimiento i ON i.item_id = c.proveedor_item_id
      LEFT JOIN app.proveedor pr ON pr.proveedor_id = i.proveedor_id
      LEFT JOIN app.cost_option co ON co.cost_option_id = c.manual_cost_option_id
      LEFT JOIN app.item_formulado f ON f.item_formulado_id = c.formulado_item_formulado_id
      LEFT JOIN app.producto p ON p.producto_id = f.producto_id
      WHERE (($1::boolean = true) OR (c.activo = true))
        AND (
          $2::text = '' OR
          coalesce(c.nombre,'') ILIKE '%' || $2::text || '%' OR
          coalesce(c.descripcion,'') ILIKE '%' || $2::text || '%' OR
          coalesce(i.descripcion_fuente,'') ILIKE '%' || $2::text || '%' OR
          coalesce(co.manual_nombre,'') ILIKE '%' || $2::text || '%' OR
          coalesce(p.nombre,'') ILIKE '%' || $2::text || '%'
        )
      ORDER BY c.activo DESC, c.nombre ASC, c.item_comercial_id ASC
      `,
      [includeInactivos, search]
    );

    return NextResponse.json({ ok: true, items: normalizeQueryResult(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : "";
    const cantidad = numOrNull(body?.cantidad);
    const unidadRaw = body?.unidad === null || body?.unidad === undefined || body?.unidad === "" ? null : String(body?.unidad ?? "").trim().toUpperCase();
    const unidad = (unidadRaw as string | null);
    const proveedor_item_id = numOrNull(body?.proveedor_item_id);
    const manual_cost_option_id = numOrNull(body?.manual_cost_option_id);
    const formulado_item_formulado_id = numOrNull(body?.formulado_item_formulado_id);
    const activo = body?.activo === false ? false : true;

    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });
    if (cantidad !== null && (!Number.isFinite(cantidad as number) || Number(cantidad) <= 0)) {
      return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 422 });
    }
    if (unidad !== null && !["GR", "ML", "UN"].includes(unidad)) {
      return NextResponse.json({ ok: false, error: "unidad inválida" }, { status: 422 });
    }
    if (unidad === "UN" && cantidad !== null && !Number.isInteger(Number(cantidad))) {
      return NextResponse.json({ ok: false, error: "UN requiere cantidad entera" }, { status: 422 });
    }
    if (countOrigins(proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id) > 1) {
      return NextResponse.json({ ok: false, error: "origen técnico inválido" }, { status: 422 });
    }

    const sql = db();
    if (unidad !== null && countOrigins(proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id) === 1) {
      const refUom = await resolveOriginRefUom(sql, proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id);
      if (!unitsAreCompatible(unidad, refUom)) {
        return NextResponse.json({ ok: false, error: "La unidad del Item Comercial es incompatible con la unidad del bulk/origen técnico" }, { status: 422 });
      }
    }

    const r: any = await sql.query(
      `
      INSERT INTO app.item_comercial (nombre, descripcion, cantidad, unidad, proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id, activo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING item_comercial_id
      `,
      [nombre, descripcion || null, cantidad, unidad, proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id, activo]
    );

    const item_comercial_id = normalizeQueryResult(r)?.[0]?.item_comercial_id;
    return NextResponse.json({ ok: true, item_comercial_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
