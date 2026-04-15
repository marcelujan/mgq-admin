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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const kind = String(searchParams.get("kind") ?? "").trim().toUpperCase();
    const q = String(searchParams.get("q") ?? "").trim();
    const selected_id = numOrNull(searchParams.get("selected_id"));
    const sql = db();

    if (!["MANUAL", "PROVEEDOR", "FORMULADO"].includes(kind)) {
      return NextResponse.json({ ok: false, error: "kind inválido" }, { status: 400 });
    }

    if (kind === "MANUAL") {
      const r: any = await sql.query(
        `
        SELECT *
        FROM (
          SELECT
            co.cost_option_id::bigint AS id,
            trim(both ' ' from concat_ws(' · ', co.manual_nombre, co.manual_cantidad::text || ' ' || co.manual_uom, 'ID ' || co.cost_option_id::text)) AS label,
            co.manual_nombre,
            co.manual_uom,
            co.manual_cantidad,
            co.densidad_g_ml
          FROM app.cost_option co
          WHERE co.tipo = 'MANUAL_PRESENTACION'
            AND co.activo = true
            AND (
              $1::text = '' OR
              co.manual_nombre ILIKE '%' || $1::text || '%' OR
              co.cost_option_id::text = $1::text
            )

          UNION

          SELECT
            co.cost_option_id::bigint AS id,
            trim(both ' ' from concat_ws(' · ', co.manual_nombre, co.manual_cantidad::text || ' ' || co.manual_uom, 'ID ' || co.cost_option_id::text)) AS label,
            co.manual_nombre,
            co.manual_uom,
            co.manual_cantidad,
            co.densidad_g_ml
          FROM app.cost_option co
          WHERE $2::bigint IS NOT NULL
            AND co.cost_option_id = $2::bigint
            AND co.tipo = 'MANUAL_PRESENTACION'
        ) x
        ORDER BY x.manual_nombre ASC NULLS LAST, x.id ASC
        LIMIT 60
        `,
        [q, selected_id]
      );
      return NextResponse.json({ ok: true, items: normalizeQueryResult(r) });
    }

    if (kind === "PROVEEDOR") {
      const r: any = await sql.query(
        `
        SELECT *
        FROM (
          SELECT
            i.item_id::bigint AS id,
            trim(both ' ' from concat_ws(' · ', coalesce(pr.nombre,''), coalesce(nullif(i.descripcion_fuente,''), nullif(i.articulo_prov,''), nullif(i.url_original,''), 'Item'), 'Item #' || i.item_id::text)) AS label,
            i.item_id,
            pr.nombre AS proveedor_nombre,
            coalesce(nullif(i.descripcion_fuente,''), nullif(i.articulo_prov,''), nullif(i.url_original,''), '') AS descripcion,
            i.seleccionado,
            i.updated_at
          FROM app.item_seguimiento i
          LEFT JOIN app.proveedor pr ON pr.proveedor_id = i.proveedor_id
          WHERE (
              $1::text = '' OR
              coalesce(pr.nombre,'') ILIKE '%' || $1::text || '%' OR
              coalesce(i.descripcion_fuente,'') ILIKE '%' || $1::text || '%' OR
              coalesce(i.articulo_prov,'') ILIKE '%' || $1::text || '%' OR
              coalesce(i.url_original,'') ILIKE '%' || $1::text || '%' OR
              i.item_id::text = $1::text
            )

          UNION

          SELECT
            i.item_id::bigint AS id,
            trim(both ' ' from concat_ws(' · ', coalesce(pr.nombre,''), coalesce(nullif(i.descripcion_fuente,''), nullif(i.articulo_prov,''), nullif(i.url_original,''), 'Item'), 'Item #' || i.item_id::text)) AS label,
            i.item_id,
            pr.nombre AS proveedor_nombre,
            coalesce(nullif(i.descripcion_fuente,''), nullif(i.articulo_prov,''), nullif(i.url_original,''), '') AS descripcion,
            i.seleccionado,
            i.updated_at
          FROM app.item_seguimiento i
          LEFT JOIN app.proveedor pr ON pr.proveedor_id = i.proveedor_id
          WHERE $2::bigint IS NOT NULL
            AND i.item_id = $2::bigint
        ) x
        ORDER BY x.seleccionado DESC NULLS LAST, x.updated_at DESC NULLS LAST, x.item_id DESC
        LIMIT 60
        `,
        [q, selected_id]
      );
      return NextResponse.json({ ok: true, items: normalizeQueryResult(r) });
    }

    const r: any = await sql.query(
      `
      SELECT *
      FROM (
        SELECT
          f.item_formulado_id::bigint AS id,
          trim(both ' ' from concat_ws(' · ', coalesce(p.nombre,''), 'BULK', 'ID ' || f.item_formulado_id::text)) AS label,
          p.nombre AS producto_nombre,
          f.item_formulado_id,
          f.updated_at
        FROM app.item_formulado f
        LEFT JOIN app.producto p ON p.producto_id = f.producto_id
        WHERE f.tipo = 'BULK'
          AND f.activo = true
          AND (
            $1::text = '' OR
            coalesce(p.nombre,'') ILIKE '%' || $1::text || '%' OR
            f.item_formulado_id::text = $1::text
          )

        UNION

        SELECT
          f.item_formulado_id::bigint AS id,
          trim(both ' ' from concat_ws(' · ', coalesce(p.nombre,''), 'BULK', 'ID ' || f.item_formulado_id::text)) AS label,
          p.nombre AS producto_nombre,
          f.item_formulado_id,
          f.updated_at
        FROM app.item_formulado f
        LEFT JOIN app.producto p ON p.producto_id = f.producto_id
        WHERE $2::bigint IS NOT NULL
          AND f.item_formulado_id = $2::int
      ) x
      ORDER BY x.producto_nombre ASC NULLS LAST, x.item_formulado_id ASC
      LIMIT 60
      `,
      [q, selected_id]
    );
    return NextResponse.json({ ok: true, items: normalizeQueryResult(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
