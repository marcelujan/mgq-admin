import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function intParam(v: string | null, def: number, lo: number, hi: number) {
  const n = v === null ? def : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tipo = String(searchParams.get("tipo") ?? "").trim().toUpperCase();
    const search = String(searchParams.get("search") ?? "").trim();
    const limitDefault = search === "" ? 1000 : 80;
    const limit = intParam(searchParams.get("limit"), limitDefault, 1, 5000);

    if (!["MANUAL", "PROVEEDOR", "FORMULADO"].includes(tipo)) {
      return NextResponse.json({ ok: false, error: "tipo inválido" }, { status: 400 });
    }

    const sql = db();

    if (tipo === "MANUAL") {
      const r: any = await sql.query(
        `
        SELECT
          co.cost_option_id::bigint as id,
          trim(both ' ' from concat_ws(' · ', 'Manual', coalesce(co.manual_nombre,''), 'ID ' || co.cost_option_id::text)) as label,
          co.manual_uom as ref_uom,
          co.manual_cantidad::float8 as ref_cantidad,
          co.manual_costo_ars::float8 as costo_ref_ars,
          co.densidad_g_ml::float8 as densidad_g_ml
        FROM app.cost_option co
        WHERE co.activo = true
          AND co.tipo = 'MANUAL_PRESENTACION'
          AND (
            $1::text = '' OR
            coalesce(co.manual_nombre,'') ILIKE '%' || $1::text || '%' OR
            co.cost_option_id::text ILIKE '%' || $1::text || '%'
          )
        ORDER BY co.manual_nombre ASC NULLS LAST, co.cost_option_id ASC
        LIMIT $2
        `,
        [search, limit]
      );
      return NextResponse.json({ ok: true, items: rowsOf(r) });
    }

    if (tipo === "PROVEEDOR") {
      const r: any = await sql.query(
        `
        WITH last_rows AS (
          SELECT item_id, presentacion, max(as_of_date) as max_date
          FROM app.item_price_daily_pres
          GROUP BY item_id, presentacion
        ), current_price AS (
          SELECT DISTINCT ON (lr.item_id)
            lr.item_id,
            lr.presentacion::float8 as presentacion,
            ip.price_ars::float8 as price_ars,
            lr.max_date
          FROM last_rows lr
          JOIN app.item_price_daily_pres ip
            ON ip.item_id = lr.item_id
           AND ip.presentacion = lr.presentacion
           AND ip.as_of_date = lr.max_date
          ORDER BY lr.item_id, lr.max_date DESC, lr.presentacion ASC
        ), current_density AS (
          SELECT DISTINCT ON (co.item_id)
            co.item_id,
            co.item_presentacion::float8 as item_presentacion,
            co.densidad_g_ml::float8 as densidad_g_ml
          FROM app.cost_option co
          WHERE co.tipo = 'ITEM_PRESENTACION'
          ORDER BY co.item_id, co.item_presentacion ASC, co.cost_option_id DESC
        )
        SELECT
          i.item_id::bigint as id,
          trim(both ' ' from concat_ws(' · ', coalesce(pr.nombre,''), nullif(i.descripcion_fuente,''), 'Item #' || i.item_id::text)) as label,
          'GR'::text as ref_uom,
          case when cp.presentacion is not null then greatest(1::float8, cp.presentacion * 1000.0) else null::float8 end as ref_cantidad,
          cp.price_ars::float8 as costo_ref_ars,
          cd.densidad_g_ml::float8 as densidad_g_ml,
          cp.presentacion::float8 as ref_presentacion
        FROM app.item_seguimiento i
        LEFT JOIN app.proveedor pr ON pr.proveedor_id = i.proveedor_id
        LEFT JOIN current_price cp ON cp.item_id = i.item_id
        LEFT JOIN current_density cd ON cd.item_id = i.item_id AND (cp.presentacion IS NULL OR cd.item_presentacion = cp.presentacion)
        WHERE i.estado = 'OK'
          AND (
            $1::text = '' OR
            coalesce(pr.nombre,'') ILIKE '%' || $1::text || '%' OR
            coalesce(i.descripcion_fuente,'') ILIKE '%' || $1::text || '%' OR
            i.item_id::text ILIKE '%' || $1::text || '%'
          )
        ORDER BY pr.nombre ASC NULLS LAST, i.item_id DESC
        LIMIT $2
        `,
        [search, limit]
      );
      return NextResponse.json({ ok: true, items: rowsOf(r) });
    }

    const r: any = await sql.query(
      `
      SELECT
        f.item_formulado_id::bigint as id,
        trim(both ' ' from concat_ws(' · ', 'Formulado', coalesce(p.nombre,''), 'ID ' || f.item_formulado_id::text)) as label,
        'GR'::text as ref_uom,
        1000::float8 as ref_cantidad,
        snap.precio_unitario_ars::float8 as costo_ref_ars,
        p.densidad_producto_g_ml::float8 as densidad_g_ml,
        p.producto_id::bigint as producto_id
      FROM app.item_formulado f
      JOIN app.producto p ON p.producto_id = f.producto_id
      LEFT JOIN LATERAL (
        SELECT s.precio_unitario_ars
        FROM app.item_formulado_snapshot s
        WHERE s.item_formulado_id = f.item_formulado_id
        ORDER BY s.as_of_date DESC, s.created_at DESC NULLS LAST, s.snapshot_id DESC
        LIMIT 1
      ) snap ON true
      WHERE f.activo = true
        AND f.tipo = 'BULK'
        AND (
          $1::text = '' OR
          coalesce(p.nombre,'') ILIKE '%' || $1::text || '%' OR
          f.item_formulado_id::text ILIKE '%' || $1::text || '%'
        )
      ORDER BY p.nombre ASC, f.item_formulado_id ASC
      LIMIT $2
      `,
      [search, limit]
    );
    return NextResponse.json({ ok: true, items: rowsOf(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
