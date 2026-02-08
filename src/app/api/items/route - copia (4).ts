import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

/**
 * Unificación de Items:
 * - PROVEEDOR: app.item_seguimiento (scrape)
 * - FORMULADO (virtual): app.producto_formula_v2 (uno por producto con fórmula v2)
 * - MANUAL (catálogo): app.cost_option tipo='MANUAL_PRESENTACION'
 *
 * item_key:
 * - p:<item_id>
 * - fprod:<producto_id>
 * - mopt:<cost_option_id>
 *
 * Filtros:
 * - tipo: "" | "PROVEEDOR" | "MANUAL" | "FORMULADO"
 * - estado: solo aplica a PROVEEDOR (scrape)
 * - seleccionado: solo aplica a PROVEEDOR
 * - search: aplica a cada fuente en sus campos relevantes
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const limitRaw = Number(searchParams.get("limit") ?? 50);
    const offsetRaw = Number(searchParams.get("offset") ?? 0);

    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 50;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const tipo = (searchParams.get("tipo") ?? "").trim().toUpperCase(); // "" | PROVEEDOR | MANUAL | FORMULADO
    const estado = (searchParams.get("estado") ?? "").trim(); // solo proveedor
    const search = (searchParams.get("search") ?? "").trim();
    const seleccionadoRaw = (searchParams.get("seleccionado") ?? "").trim(); // "true" | "false" | ""

    let seleccionado: boolean | null = null;
    if (seleccionadoRaw === "true") seleccionado = true;
    if (seleccionadoRaw === "false") seleccionado = false;

    const searchLike = search ? `%${search}%` : null;

    const sql = db();

    const r: any = await sql.query(
      `
      with
      proveedor as (
        select
          ('p:' || i.item_id::text) as item_key,
          'PROVEEDOR'::text as kind,
          i.item_id::text as item_id,
          ''::text as proveedor_codigo,
          coalesce(pr.nombre, '') as proveedor_nombre,
          i.url_original,
          i.url_canonica,
          i.seleccionado,
          i.estado::text as estado,
          i.created_at,
          i.updated_at,
          null::text as producto_nombre,
          null::text as oferta_nombre,
          null::text as tipo_formulado,
          null::text as manual_nombre,
          null::text as manual_uom,
          null::numeric as manual_cantidad,
          null::numeric as manual_costo_ars,
          i.item_id::bigint as sort_id,
          0::int as sort_kind
        from app.item_seguimiento i
        left join app.proveedor pr on pr.proveedor_id = i.proveedor_id
        where
          ($1::text = '' or $1::text = 'PROVEEDOR')
          and ($2::text = '' or i.estado::text = $2::text)
          and ($3::boolean is null or i.seleccionado = $3::boolean)
          and (
            $4::text is null
            or coalesce(pr.nombre,'') ilike $4::text
            or coalesce(i.url_original,'') ilike $4::text
            or coalesce(i.url_canonica,'') ilike $4::text
          )
      ),

      formulado_virtual as (
        select
          ('fprod:' || pf.producto_id::text) as item_key,
          'FORMULADO'::text as kind,
          pf.producto_id::text as item_id,
          ''::text as proveedor_codigo,
          ''::text as proveedor_nombre,
          ''::text as url_original,
          ''::text as url_canonica,
          false as seleccionado,
          'FORMULADO'::text as estado,
          null::timestamptz as created_at,
          null::timestamptz as updated_at,
          coalesce(p.nombre, '') as producto_nombre,
          ''::text as oferta_nombre,
          'BULK'::text as tipo_formulado,
          null::text as manual_nombre,
          null::text as manual_uom,
          null::numeric as manual_cantidad,
          null::numeric as manual_costo_ars,
          pf.producto_id::bigint as sort_id,
          1::int as sort_kind
        from app.producto_formula_v2 pf
        left join app.producto p on p.producto_id = pf.producto_id
        where
          ($1::text = '' or $1::text = 'FORMULADO')
          and (
            $4::text is null
            or coalesce(p.nombre,'') ilike $4::text
          )
      ),

      manual_catalogo as (
        select
          ('mopt:' || c.cost_option_id::text) as item_key,
          'MANUAL'::text as kind,
          c.cost_option_id::text as item_id,
          ''::text as proveedor_codigo,
          ''::text as proveedor_nombre,
          ''::text as url_original,
          ''::text as url_canonica,
          false as seleccionado,
          'MANUAL'::text as estado,
          null::timestamptz as created_at,
          null::timestamptz as updated_at,
          ''::text as producto_nombre,
          ''::text as oferta_nombre,
          'MANUAL_PRESENTACION'::text as tipo_formulado,
          c.manual_nombre::text as manual_nombre,
          c.manual_uom::text as manual_uom,
          c.manual_cantidad as manual_cantidad,
          c.manual_costo_ars as manual_costo_ars,
          c.cost_option_id::bigint as sort_id,
          2::int as sort_kind
        from app.cost_option c
        where
          c.activo = true
          and c.tipo = 'MANUAL_PRESENTACION'
          and ($1::text = '' or $1::text = 'MANUAL')
          -- estado/seleccionado no aplican
          and (
            $4::text is null
            or coalesce(c.manual_nombre,'') ilike $4::text
            or coalesce(c.manual_uom,'') ilike $4::text
          )
      ),

      all_items as (
        select * from proveedor
        union all
        select * from formulado_virtual
        union all
        select * from manual_catalogo
      )
      select
        item_key,
        kind,
        item_id,
        proveedor_codigo,
        proveedor_nombre,
        url_original,
        url_canonica,
        seleccionado,
        estado,
        created_at,
        updated_at,
        producto_nombre,
        oferta_nombre,
        tipo_formulado,
        manual_nombre,
        manual_uom,
        manual_cantidad,
        manual_costo_ars
      from all_items
      order by sort_kind asc, sort_id desc
      limit $5 offset $6;
      `,
      [tipo, estado, seleccionado, searchLike, limit, offset]
    );

    const rows = normalizeQueryResult(r);

    return NextResponse.json({
      ok: true,
      count: rows.length,
      items: rows,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}