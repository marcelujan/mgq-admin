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
 * Filtros:
 * - tipo: "" | "PROVEEDOR" | "MANUAL" | "FORMULADO"
 * - estado: estados de scraping de proveedor (PENDING_SCRAPE | WAITING_REVIEW | OK | ERROR_SCRAPE | ...)
 *           (no aplica a MANUAL ni a FORMULADO)
 * - seleccionado: true/false
 * - search: texto libre
 *
 * item_key estable:
 *  - Proveedor/Manual:  p:<item_id>
 *  - Formulado:         f:<item_formulado_id>
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const limitRaw = Number(searchParams.get("limit") ?? 50);
    const offsetRaw = Number(searchParams.get("offset") ?? 0);

    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 50;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const tipo = (searchParams.get("tipo") ?? "").trim().toUpperCase(); // "" | PROVEEDOR | MANUAL | FORMULADO
    const estado = (searchParams.get("estado") ?? "").trim(); // estados proveedor
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
          case when i.estado::text = 'MANUAL_OVERRIDE' then 'MANUAL' else 'PROVEEDOR' end as kind,
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
          -- tipo: incluir o excluir manuales
          (
            $1::text = '' OR
            ($1::text = 'PROVEEDOR' AND i.estado::text <> 'MANUAL_OVERRIDE') OR
            ($1::text = 'MANUAL' AND i.estado::text = 'MANUAL_OVERRIDE')
          )
          -- estado: SOLO aplica a proveedor (no a manual). Si tipo='' también aplica, pero solo sobre proveedor.
          and (
            $2::text = '' OR
            (
              i.estado::text <> 'MANUAL_OVERRIDE'
              and i.estado::text = $2::text
            )
          )
          -- seleccionado
          and ($3::boolean is null or i.seleccionado = $3::boolean)
          -- search
          and (
            $4::text is null
            or coalesce(pr.nombre,'') ilike $4::text
            or coalesce(i.url_original,'') ilike $4::text
            or coalesce(i.url_canonica,'') ilike $4::text
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
          -- estado no aplica a formulado
          and (
            $4::text is null
            or coalesce(p.nombre,'') ilike $4::text
            or coalesce(o.nombre,'') ilike $4::text
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