import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
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

    // INSUMOS
    const insParams: any[] = [];
    let insWhere = "WHERE activo=true";
    if (search) {
      insParams.push(`%${search}%`);
      insWhere += ` AND nombre ILIKE $${insParams.length}`;
    }
    const insRes: any = await sql.query(
      `SELECT insumo_id, nombre, tipo_uom, densidad_g_ml, activo
       FROM app.insumo
       ${insWhere}
       ORDER BY nombre ASC
       LIMIT 500`,
      insParams
    );
    const insumos = normalizeQueryResult(insRes);

    // OFERTAS BULK (subproductos)
    const bParams: any[] = [];
    let bWhere = "WHERE o.activo=true AND o.is_bulk=true";
    if (search) {
      bParams.push(`%${search}%`);
      bWhere += ` AND (p.nombre ILIKE $${bParams.length} OR o.nombre ILIKE $${bParams.length})`;
    }
    const bulkRes: any = await sql.query(
      `SELECT o.oferta_id, o.producto_id, p.nombre AS producto_nombre, o.nombre AS oferta_nombre,
              o.peso_neto_g, o.volumen_neto_ml, o.unidades_pack,
              o.masa_por_unidad_g, o.volumen_por_unidad_ml,
              o.densidad_override_g_ml
       FROM app.producto_oferta o
       JOIN app.producto p ON p.producto_id = o.producto_id
       ${bWhere}
       ORDER BY p.nombre ASC, o.nombre ASC
       LIMIT 500`,
      bParams
    );
    const ofertas_bulk = normalizeQueryResult(bulkRes);

    return NextResponse.json({ ok: true, insumos, ofertas_bulk });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
