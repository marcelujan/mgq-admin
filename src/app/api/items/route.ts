import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

/**
 * API unificada de Items.
 *
 * item_key estable:
 *  - Proveedor:  p:<item_id>
 *  - Formulado:  f:<item_formulado_id>
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const limitRaw = Number(searchParams.get("limit") ?? 50);
    const offsetRaw = Number(searchParams.get("offset") ?? 0);

    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 50;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const estado = (searchParams.get("estado") ?? "").trim(); // "" o estado proveedor o "FORMULADO"
    const seleccionadoRaw = (searchParams.get("seleccionado") ?? "").trim(); // "true" | "false" | ""
    const search = (searchParams.get("search") ?? "").trim();

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
          i.item_id::bigint as sort_id,
          0::int as sort_kind
        from app.item_seguimiento i
        left join app.proveedor pr on pr.proveedor_id = i.proveedor_id
        where
          ($1::text = '' or i.estado::text = $1::text)
          and ($2::boolean is null or i.seleccionado = $2::boolean)
          and (
            $3::text is null
            or coalesce(pr.nombre,'') ilike $3::text
            or coalesce(i.url_original,'') ilike $3::text
            or coalesce(i.url_canonica,'') ilike $3::text
          )
      ),
      formulado as (
        select
          ('f:' || f.item_formulado_id::text) as item_key,
          'FORMULADO'::text as kind,
          f.item_formulado_id::text as item_id,
          ''::text as proveedor_codigo,
          ''::text as proveedor_nombre,
          ''::text as url_original,
          ''::text as url_canonica,
          false as seleccionado,
          'FORMULADO'::text as estado,
          null::timestamptz as created_at,
          null::timestamptz as updated_at,
          coalesce(p.nombre, '') as producto_nombre,
          coalesce(o.nombre, '') as oferta_nombre,
          f.tipo::text as tipo_formulado,
          f.item_formulado_id::bigint as sort_id,
          1::int as sort_kind
        from app.item_formulado f
        left join app.producto p on p.producto_id = f.producto_id
        left join app.producto_oferta o on o.oferta_id = f.oferta_id
        where
          f.activo = true
          and ($1::text = '' or $1::text = 'FORMULADO')
          and ($2::boolean is null or $2::boolean = false)
          and (
            $3::text is null
            or coalesce(p.nombre,'') ilike $3::text
            or coalesce(o.nombre,'') ilike $3::text
          )
      ),
      all_items as (
        select * from proveedor
        union all
        select * from formulado
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
        tipo_formulado
      from all_items
      order by sort_kind asc, sort_id desc
      limit $4 offset $5;
      `,
      [estado, seleccionado, searchLike, limit, offset]
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