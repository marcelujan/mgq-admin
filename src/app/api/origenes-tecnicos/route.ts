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
    const limit = intParam(searchParams.get("limit"), 80, 1, 250);

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
          co.manual_nombre,
          co.manual_uom as unidad,
          co.manual_cantidad::float8 as cantidad
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
        SELECT
          i.item_id::bigint as id,
          trim(both ' ' from concat_ws(' · ', coalesce(pr.nombre,''), nullif(i.descripcion_fuente,''), 'Item #' || i.item_id::text)) as label,
          coalesce(pr.nombre,'') as proveedor_nombre,
          coalesce(nullif(i.descripcion_fuente,''), '') as item_nombre,
          i.item_id::bigint as item_id
        FROM app.item_seguimiento i
        LEFT JOIN app.proveedor pr ON pr.proveedor_id = i.proveedor_id
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
        p.nombre,
        f.item_formulado_id::bigint as item_formulado_id
      FROM app.item_formulado f
      JOIN app.producto p ON p.producto_id = f.producto_id
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
