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
 * Devuelve rows con `item_key` estable:
 *  - Proveedor:  p:<item_id>
 *  - Formulado:  f:<item_formulado_id>
 *
 * No recalcula nada. Solo lista.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const limitRaw = Number(searchParams.get("limit") ?? 50);
    const offsetRaw = Number(searchParams.get("offset") ?? 0);

    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 50;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const search = (searchParams.get("search") ?? "").trim();
    const estado = (searchParams.get("estado") ?? "").trim();
    const seleccionadoRaw = (searchParams.get("seleccionado") ?? "").trim(); // "true" | "false" | ""

    let seleccionado: boolean | null = null;
    if (seleccionadoRaw === "true") seleccionado = true;
    if (seleccionadoRaw === "false") seleccionado = false;

    const sql = db();

    // --- WHERE proveedor (item_seguimiento)
    const wProv: string[] = [];
    const vProv: any[] = [];
    let pProv = 1;

    if (estado) {
      wProv.push(`i.estado = $${pProv++}`);
      vProv.push(estado);
    }

    if (seleccionado !== null) {
      wProv.push(`i.seleccionado = $${pProv++}`);
      vProv.push(seleccionado);
    }

    if (search) {
      wProv.push(`(
        coalesce(pr.nombre,'') ilike $${pProv} OR
        coalesce(pr.codigo,'') ilike $${pProv} OR
        coalesce(i.url_original,'') ilike $${pProv} OR
        coalesce(i.url_canonica,'') ilike $${pProv}
      )`);
      vProv.push(`%${search}%`);
      pProv++;
    }

    const whereProvSql = wProv.length ? `WHERE ${wProv.join(" AND ")}` : "";

    // --- WHERE formulado (item_formulado)
    const wFor: string[] = [`f.activo = true`];
    const vFor: any[] = [];
    let pFor = 1;

    // filtro estado: solo soporta "FORMULADO" para incluir formulados.
    if (estado && estado !== "FORMULADO") {
      wFor.push("1=0");
    }

    // filtro seleccionado: por ahora los formulados no tienen flag; se tratan como false.
    if (seleccionado === true) {
      wFor.push("1=0");
    }

    if (search) {
      wFor.push(`(
        coalesce(p.nombre,'') ilike $${pFor} OR
        coalesce(o.nombre,'') ilike $${pFor} OR
        coalesce(p.codigo,'') ilike $${pFor}
      )`);
      vFor.push(`%${search}%`);
      pFor++;
    }

    const whereForSql = wFor.length ? `WHERE ${wFor.join(" AND ")}` : "";

    const r: any = await sql.query(
      `
      with
      proveedor as (
        select
          ('p:' || i.item_id::text) as item_key,
          'PROVEEDOR'::text as kind,
          i.item_id::text as item_id,
          coalesce(pr.codigo, '') as proveedor_codigo,
          coalesce(pr.nombre, '') as proveedor_nombre,
          i.url_original,
          i.url_canonica,
          i.seleccionado,
          i.estado,
          i.created_at,
          i.updated_at,
          null::text as producto_nombre,
          null::text as oferta_nombre,
          null::text as tipo_formulado,
          i.item_id::bigint as sort_id,
          0::int as sort_kind
        from app.item_seguimiento i
        left join app.proveedor pr on pr.proveedor_id = i.proveedor_id
        ${whereProvSql}
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
        ${whereForSql}
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
      limit $1 offset $2;
      `,
      [limit, offset]
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