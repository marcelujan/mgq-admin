import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const sql = db();
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();

    const params: any[] = [];
    const where = search ? "WHERE x.label ILIKE $1" : "";
    if (search) params.push(`%${search}%`);

    const q = `
      SELECT * FROM (
        SELECT
          'INSUMO'::text AS kind,
          i.insumo_id::bigint AS id,
          (i.nombre || ' (' || i.tipo_uom || ')')::text AS label,
          i.tipo_uom::text AS uom
        FROM app.insumo i
        WHERE i.activo = true

        UNION ALL

        SELECT
          'OFERTA_BULK'::text AS kind,
          o.oferta_id::bigint AS id,
          (p.nombre || ' - ' || o.nombre ||
            CASE
              WHEN o.peso_neto_g IS NOT NULL THEN (' (' || o.peso_neto_g || ' g)')
              WHEN o.volumen_neto_ml IS NOT NULL THEN (' (' || o.volumen_neto_ml || ' mL)')
              ELSE ''
            END
          )::text AS label,
          CASE
            WHEN o.peso_neto_g IS NOT NULL THEN 'GR'
            WHEN o.volumen_neto_ml IS NOT NULL THEN 'ML'
            ELSE 'GR'
          END::text AS uom
        FROM app.producto_oferta o
        JOIN app.producto p ON p.producto_id = o.producto_id
        WHERE o.activo = true AND o.is_bulk = true AND p.activo = true
      ) x
      ${where}
      ORDER BY x.kind ASC, x.label ASC
      LIMIT 500
    `;

    const r: any = await sql.query(q, params);
    return NextResponse.json({ ok: true, componentes: rows(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
