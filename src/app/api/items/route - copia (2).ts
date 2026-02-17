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
 * - PROVEEDOR: app.item_seguimiento
 * - FORMULADO (virtual): producto con fórmula v2 (por header o por líneas)
 * - MANUAL (catálogo): app.cost_option tipo='MANUAL_PRESENTACION'
 *
 * item_key:
 * - p:<item_id>
 * - fprod:<producto_id>
 * - mopt:<cost_option_id>
 *
 * Conteos (solo PROVEEDOR):
 * - ok_count / fail_count / pending_count: agregación por item_id a partir del run de pricing del día
 *   (pricing_daily_runs.as_of_date = current_date), via pricing_daily_run_items + offers.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // DEFAULT 100 (antes 50)
    const limitRaw = Number(searchParams.get("limit") ?? 100);
    const offsetRaw = Number(searchParams.get("offset") ?? 0);

    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
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
          -- "Actualizado" real: max(as_of_date) de snapshots de precio; fallback a i.updated_at
          coalesce(
            (pd.max_d::timestamptz + interval '12 hours'),
            i.updated_at
          ) as updated_at,
          coalesce(pc.ok_count, 0)::int as ok_count,
          coalesce(pc.fail_count, 0)::int as fail_count,
          coalesce(pc.pending_count, 0)::int as pending_count,
          null::timestamptz as created_at,
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
        left join lateral (
          select max(as_of_date) as max_d
          from app.item_price_daily_pres p
          where p.item_id = i.item_id
        ) pd on true
        left join lateral (
          select
            count(*) filter (where ri.status='OK')::int as ok_count,
            count(*) filter (where ri.status='FAIL')::int as fail_count,
            count(*) filter (where ri.status='PENDING')::int as pending_count
          from app.offers o
          join lateral (
            select id as run_id
            from app.pricing_daily_runs
            where as_of_date = current_date
            order by id desc
            limit 1
          ) rr on true
          join app.pricing_daily_run_items ri
            on ri.run_id = rr.run_id
           and ri.offer_id = o.offer_id
          where o.item_id = i.item_id
            and o.estado = 'OK'
        ) pc on true
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

      -- productos con fórmula v2: por header (producto_formula_v2) o por líneas (producto_formula_linea_v2)
      productos_formulados_v2 as (
        select distinct producto_id
        from (
          select producto_id from app.producto_formula_v2
          union
          select producto_id from app.producto_formula_linea_v2
        ) x
        where producto_id is not null
      ),

      formulado_virtual as (
        select
          ('fprod:' || pf.producto_id::text) as item_key,
          'FORMULADO'::text as kind,
          pf.producto_id::text as item_id,
          ''::text as proveedor_codigo,
          -- Fuente correcto en UI (antes "Fórmula v2")
          'Formulado'::text as proveedor_nombre,
          ''::text as url_original,
          ''::text as url_canonica,
          false as seleccionado,
          'FORMULADO'::text as estado,
          -- "Actualizado" real: max(as_of_date) de item_formulado_snapshot; fallback null
          coalesce(
            (fs.max_d::timestamptz + interval '12 hours'),
            null::timestamptz
          ) as updated_at,
          0::int as ok_count,
          0::int as fail_count,
          0::int as pending_count,
          null::timestamptz as created_at,
          coalesce(p.nombre, '') as producto_nombre,
          ''::text as oferta_nombre,
          'BULK'::text as tipo_formulado,
          null::text as manual_nombre,
          null::text as manual_uom,
          null::numeric as manual_cantidad,
          null::numeric as manual_costo_ars,
          pf.producto_id::bigint as sort_id,
          1::int as sort_kind
        from productos_formulados_v2 pf
        left join app.producto p on p.producto_id = pf.producto_id
        left join lateral (
          select item_formulado_id
          from app.item_formulado f
          where f.producto_id = pf.producto_id::int
            and f.tipo = 'BULK'
            and f.activo = true
          order by f.item_formulado_id asc
          limit 1
        ) fi on true
        left join lateral (
          select max(as_of_date) as max_d
          from app.item_formulado_snapshot s
          where s.item_formulado_id = fi.item_formulado_id
        ) fs on true
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
          -- Fuente correcto en UI (antes "Cost option")
          'Manual'::text as proveedor_nombre,
          ''::text as url_original,
          ''::text as url_canonica,
          false as seleccionado,
          'MANUAL'::text as estado,
          -- "Actualizado" real: max(as_of_date) de cost_option_snapshot; fallback a c.updated_at
          coalesce(
            (ms.max_d::timestamptz + interval '12 hours'),
            c.updated_at
          ) as updated_at,
          0::int as ok_count,
          0::int as fail_count,
          0::int as pending_count,
          null::timestamptz as created_at,
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
        left join lateral (
          select max(as_of_date) as max_d
          from app.cost_option_snapshot s
          where s.cost_option_id = c.cost_option_id
        ) ms on true
        where
          c.activo = true
          and c.tipo = 'MANUAL_PRESENTACION'
          and ($1::text = '' or $1::text = 'MANUAL')
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
      ),

      paged as (
        select
          *,
          count(*) over()::int as total_count
        from all_items
        order by sort_kind asc, sort_id desc
        limit $5 offset $6
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
        updated_at,
        producto_nombre,
        oferta_nombre,
        tipo_formulado,
        manual_nombre,
        manual_uom,
        manual_cantidad,
        manual_costo_ars,
        ok_count,
        fail_count,
        pending_count,
        total_count
      from paged;
      `,
      [tipo, estado, seleccionado, searchLike, limit, offset]
    );

    const rows = normalizeQueryResult(r);

    const total = rows.length > 0 ? Number(rows[0]?.total_count ?? rows.length) : 0;
    const items = rows.map(({ total_count, ...rest }) => rest);

    return NextResponse.json({
      ok: true,
      total,
      count: items.length,
      items,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}