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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeInactivos = (searchParams.get("include_inactivos") ?? "false") === "true";
    const search = (searchParams.get("search") ?? "").trim();
    const sql = db();

    const r: any = await sql.query(
      `
      SELECT
        e.item_envase_id,
        e.nombre,
        e.descripcion,
        e.proveedor_item_id,
        e.manual_cost_option_id,
        e.activo,
        e.created_at,
        e.updated_at,
        CASE
          WHEN e.proveedor_item_id IS NOT NULL THEN 'PROVEEDOR'
          ELSE 'MANUAL'
        END AS origen_tipo,
        CASE
          WHEN e.proveedor_item_id IS NOT NULL THEN e.proveedor_item_id
          ELSE e.manual_cost_option_id
        END AS origen_id,
        CASE
          WHEN e.proveedor_item_id IS NOT NULL THEN
            trim(both ' ' from concat_ws(' · ', coalesce(pr.nombre,''), nullif(i.descripcion_fuente,''), 'Item #' || i.item_id::text))
          ELSE
            trim(both ' ' from concat_ws(' · ', 'Manual', coalesce(co.manual_nombre,''), 'ID ' || co.cost_option_id::text))
        END AS origen_label
      FROM app.item_envase e
      LEFT JOIN app.item_seguimiento i ON i.item_id = e.proveedor_item_id
      LEFT JOIN app.proveedor pr ON pr.proveedor_id = i.proveedor_id
      LEFT JOIN app.cost_option co ON co.cost_option_id = e.manual_cost_option_id
      WHERE (($1::boolean = true) OR (e.activo = true))
        AND (
          $2::text = '' OR
          coalesce(e.nombre,'') ILIKE '%' || $2::text || '%' OR
          coalesce(e.descripcion,'') ILIKE '%' || $2::text || '%' OR
          coalesce(i.descripcion_fuente,'') ILIKE '%' || $2::text || '%' OR
          coalesce(i.articulo_prov,'') ILIKE '%' || $2::text || '%' OR
          coalesce(co.manual_nombre,'') ILIKE '%' || $2::text || '%'
        )
      ORDER BY e.activo DESC, e.nombre ASC, e.item_envase_id ASC
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
    const proveedor_item_id = numOrNull(body?.proveedor_item_id);
    const manual_cost_option_id = numOrNull(body?.manual_cost_option_id);
    const activo = body?.activo === false ? false : true;

    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });
    if (originCount(proveedor_item_id, manual_cost_option_id) !== 1) {
      return NextResponse.json({ ok: false, error: "origen técnico inválido" }, { status: 422 });
    }

    const sql = db();
    const r: any = await sql.query(
      `
      INSERT INTO app.item_envase (nombre, descripcion, proveedor_item_id, manual_cost_option_id, activo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING item_envase_id
      `,
      [nombre, descripcion || null, proveedor_item_id, manual_cost_option_id, activo]
    );

    const item_envase_id = normalizeQueryResult(r)?.[0]?.item_envase_id;
    return NextResponse.json({ ok: true, item_envase_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
