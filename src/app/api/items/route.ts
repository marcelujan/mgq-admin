import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function mapEstadoProveedorUiToDb(raw: string): string {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "WAIT") return "WAITING_REVIEW";
  if (s === "PEND") return "PENDING_SCRAPE";
  if (s === "ERROR") return "ERROR_SCRAPE";
  if (s === "OK") return "OK";
  if (s === "WAITING_REVIEW" || s === "PENDING_SCRAPE" || s === "ERROR_SCRAPE") return s;
  return "";
}

const ALLOWED_SORT_BY = new Set(["item_id", "nombre", "fuente", "estado_proveedor", "updated_at"]);
const ALLOWED_SORT_DIR = new Set(["asc", "desc"]);

/**
 * GET /api/items?limit=&offset=&tipo=&search=&estado_proveedor=&estado_item=&seleccionado=&sort_by=&sort_dir=
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const limitRaw = Number(searchParams.get("limit") ?? 100);
    const offsetRaw = Number(searchParams.get("offset") ?? 0);

    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const tipo = (searchParams.get("tipo") ?? "").trim().toUpperCase();
    const estadoProveedorUi = (searchParams.get("estado_proveedor") ?? searchParams.get("estado") ?? "").trim();
    const estadoProveedorDb = mapEstadoProveedorUiToDb(estadoProveedorUi);
    const estadoItem = (searchParams.get("estado_item") ?? "").trim().toUpperCase();
    const search = (searchParams.get("search") ?? "").trim();
    const seleccionadoRaw = (searchParams.get("seleccionado") ?? "").trim();
    const sortByRaw = (searchParams.get("sort_by") ?? "item_id").trim();
    const sortDirRaw = (searchParams.get("sort_dir") ?? "desc").trim().toLowerCase();

    let seleccionado: boolean | null = null;
    if (seleccionadoRaw === "true") seleccionado = true;
    if (seleccionadoRaw === "false") seleccionado = false;

    const searchLike = search ? `%${search}%` : null;
    const sortBy = ALLOWED_SORT_BY.has(sortByRaw) ? sortByRaw : "item_id";
    const sortDir = ALLOWED_SORT_DIR.has(sortDirRaw) ? sortDirRaw : "desc";

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
          coalesce((pd.max_d::timestamptz + interval '12 hours'), i.updated_at) as updated_at,

          coalesce(pc.ok_count, 0)::int as ok_count,
          coalesce(pc.fail_count, 0)::int as fail_count,
          coalesce(pc.pending_count, 0)::int as pending_count,

          null::timestamptz as created_at,
          null::text as producto_nombre,
          null::text as oferta_nombre,
          null::text as tipo_formulado,
          coalesce(nullif(i.descripcion_fuente::text,''), nullif(op.descripcion,'')) as provider_item_nombre,
          nullif(i.articulo_prov::text,'') as provider_item_codigo,
          null::text as manual_nombre,
          null::text as manual_uom,
          null::numeric as manual_cantidad,
          null::numeric as manual_costo_ars,
          i.item_id::bigint as sort_id,
          0::int as sort_kind
        from app.item_seguimiento i
        left join app.proveedor pr on pr.proveedor_id = i.proveedor_id

        left join lateral (
          select op.descripcion
          from app.oferta_proveedor op
          where op.item_id = i.item_id
            and coalesce(trim(op.descripcion), '') <> ''
          order by op.updated_at desc nulls last, op.oferta_id desc
          limit 1
        ) op on true

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
            or coalesce(i.descripcion_fuente,'') ilike $4::text
            or coalesce(i.articulo_prov,'') ilike $4::text
            or coalesce(op.descripcion,'') ilike $4::text
            or coalesce(i.url_original,'') ilike $4::text
            or coalesce(i.url_canonica,'') ilike $4::text
          )
      ),

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
          'Formulado'::text as proveedor_nombre,
          ''::text as url_original,
          ''::text as url_canonica,
          false as seleccionado,
          'FORMULADO'::text as estado,
          coalesce((fs.max_d::timestamptz + interval '12 hours'), null::timestamptz) as updated_at,
          (
            case
              when fi.item_formulado_id is not null
               and f_today.has_today = true
               and f_today.precio_unitario_ars > 0
              then 1 else 0
            end
          )::int as ok_count,
          (
            case
              when fi.item_formulado_id is null then 1
              when f_today.has_today = true and not (f_today.precio_unitario_ars > 0) then 1
              else 0
            end
          )::int as fail_count,
          (
            case
              when fi.item_formulado_id is not null
               and (f_today.has_today is distinct from true)
              then 1 else 0
            end
          )::int as pending_count,
          null::timestamptz as created_at,
          coalesce(p.nombre, '') as producto_nombre,
          ''::text as oferta_nombre,
          'BULK'::text as tipo_formulado,
          null::text as provider_item_nombre,
          null::text as provider_item_codigo,
          null::text as manual_nombre,
          null::text as manual_uom,
          null::numeric as manual_cantidad,
          null::numeric as manual_costo_ars,
          pf.producto_id::bigint as sort_id,
          1::int as sort_kind
        from productos_formulados_v2 pf
        left join app.producto p on p.producto_id = pf.producto_id

        left join lateral (
          select f.item_formulado_id
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

        left join lateral (
          select
            exists(
              select 1
              from app.item_formulado_snapshot s
              where s.item_formulado_id = fi.item_formulado_id
                and s.as_of_date = current_date
            ) as has_today,
            coalesce((
              select s.precio_unitario_ars
              from app.item_formulado_snapshot s
              where s.item_formulado_id = fi.item_formulado_id
                and s.as_of_date = current_date
              order by s.snapshot_id desc
              limit 1
            ), 0::numeric) as precio_unitario_ars
        ) f_today on true

        where
          ($1::text = '' or $1::text = 'FORMULADO')
          and coalesce(p.activo, true) = true
          and ($4::text is null or coalesce(p.nombre,'') ilike $4::text)
      ),

      manual_catalogo as (
        select
          ('mopt:' || c.cost_option_id::text) as item_key,
          'MANUAL'::text as kind,
          c.cost_option_id::text as item_id,
          ''::text as proveedor_codigo,
          'Manual'::text as proveedor_nombre,
          ''::text as url_original,
          ''::text as url_canonica,
          false as seleccionado,
          'MANUAL'::text as estado,
          coalesce((ms.max_d::timestamptz + interval '12 hours'), c.updated_at) as updated_at,
          (
            case
              when m_today.has_today = true and m_today.costo_ars > 0
              then 1 else 0
            end
          )::int as ok_count,
          (
            case
              when m_today.has_today = true and not (m_today.costo_ars > 0)
              then 1 else 0
            end
          )::int as fail_count,
          (
            case
              when m_today.has_today is distinct from true
              then 1 else 0
            end
          )::int as pending_count,
          null::timestamptz as created_at,
          ''::text as producto_nombre,
          ''::text as oferta_nombre,
          'MANUAL_PRESENTACION'::text as tipo_formulado,
          null::text as provider_item_nombre,
          null::text as provider_item_codigo,
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

        left join lateral (
          select
            exists(
              select 1
              from app.cost_option_snapshot s
              where s.cost_option_id = c.cost_option_id
                and s.as_of_date = current_date
            ) as has_today,
            coalesce((
              select s.costo_ars
              from app.cost_option_snapshot s
              where s.cost_option_id = c.cost_option_id
                and s.as_of_date = current_date
              order by s.snapshot_id desc
              limit 1
            ), 0::numeric) as costo_ars
        ) m_today on true

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

      filtered as (
        select
          *,
          lower(coalesce(nullif(producto_nombre,''), nullif(manual_nombre,''), nullif(provider_item_nombre,''), nullif(proveedor_nombre || ' · SKU ' || provider_item_codigo,''), nullif(url_canonica,''), nullif(url_original,''), item_id::text)) as sort_nombre,
          lower(coalesce(nullif(proveedor_nombre,''), '')) as sort_fuente,
          case
            when kind = 'PROVEEDOR' and estado = 'OK' then 0
            when kind = 'PROVEEDOR' and estado = 'WAITING_REVIEW' then 1
            when kind = 'PROVEEDOR' and estado = 'PENDING_SCRAPE' then 2
            when kind = 'PROVEEDOR' and estado = 'ERROR_SCRAPE' then 3
            else 9
          end as sort_estado_proveedor
        from all_items
        where
          (
            $5::text = ''
            or ($5::text = 'OK' and coalesce(ok_count, 0) > 0)
            or ($5::text = 'FAIL' and coalesce(fail_count, 0) > 0)
            or ($5::text = 'PEND' and coalesce(pending_count, 0) > 0)
          )
          and ($2::text = '' or kind = 'PROVEEDOR')
      ),

      paged as (
        select
          *,
          count(*) over()::int as total_count
        from filtered
        order by
          case when $6::text = 'item_id' and $7::text = 'asc' then sort_id end asc nulls last,
          case when $6::text = 'item_id' and $7::text = 'desc' then sort_id end desc nulls last,
          case when $6::text = 'nombre' and $7::text = 'asc' then sort_nombre end asc nulls last,
          case when $6::text = 'nombre' and $7::text = 'desc' then sort_nombre end desc nulls last,
          case when $6::text = 'fuente' and $7::text = 'asc' then sort_fuente end asc nulls last,
          case when $6::text = 'fuente' and $7::text = 'desc' then sort_fuente end desc nulls last,
          case when $6::text = 'estado_proveedor' and $7::text = 'asc' then sort_estado_proveedor end asc nulls last,
          case when $6::text = 'estado_proveedor' and $7::text = 'desc' then sort_estado_proveedor end desc nulls last,
          case when $6::text = 'updated_at' and $7::text = 'asc' then updated_at end asc nulls last,
          case when $6::text = 'updated_at' and $7::text = 'desc' then updated_at end desc nulls last,
          sort_kind asc,
          sort_id desc
        limit $8 offset $9
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
        provider_item_nombre,
        provider_item_codigo,
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
      [tipo, estadoProveedorDb, seleccionado, searchLike, estadoItem, sortBy, sortDir, limit, offset]
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
