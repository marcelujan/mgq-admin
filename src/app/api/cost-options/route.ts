import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

/**
 * Devuelve opciones para ser seleccionadas en fórmula:
 * - ITEM_PRESENTACION: desde app.item_price_daily_pres (última fecha por item/presentación) + app.item_seguimiento + app.proveedor
 * - MANUAL_PRESENTACION: desde app.cost_option (tipo MANUAL_PRESENTACION)
 * - BULK_PRODUCTO: desde app.cost_option (tipo BULK_PRODUCTO) (por ahora solo metadata; el costo bulk se agrega luego)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") ?? "").trim();
    const soloSeleccionados = (searchParams.get("solo_seleccionados") ?? "true").trim() !== "false";
    const limitRaw = Number(searchParams.get("limit") ?? 300);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 300;

    const sql = db();

    // ITEM_PRESENTACION: tomar la última fecha disponible por item+presentacion
    // Nota: asumimos que "presentacion" es numérica (ej 1, 5, 25, 1000) según motor/job.
    // Si necesitás unidad, se agrega luego.
    const itemParams: any[] = [];
    let whereItem = "WHERE 1=1";
    if (soloSeleccionados) whereItem += " AND i.seleccionado=true AND i.estado='OK'";
    if (search) {
      itemParams.push(`%${search}%`);
      const p = itemParams.length;
      whereItem += ` AND (
        coalesce(pv.nombre,'') ILIKE $${p} OR
        coalesce(pv.codigo,'') ILIKE $${p} OR
        coalesce(i.url_original,'') ILIKE $${p} OR
        coalesce(i.url_canonica,'') ILIKE $${p}
      )`;
    }

    const itemsRes: any = await sql.query(
      `
      WITH last_rows AS (
        SELECT item_id, presentacion, max(as_of_date) as max_date
        FROM app.item_price_daily_pres
        GROUP BY item_id, presentacion
      )
      SELECT
        i.item_id,
        coalesce(pv.codigo,'') as proveedor_codigo,
        coalesce(pv.nombre,'') as proveedor_nombre,
        i.url_original,
        i.url_canonica,
        lr.presentacion::float8 as presentacion,
        ip.price_ars::float8 as price_ars,
        lr.max_date::text as as_of_date
      FROM app.item_seguimiento i
      LEFT JOIN app.proveedor pv ON pv.proveedor_id = i.proveedor_id
      JOIN last_rows lr ON lr.item_id = i.item_id
      JOIN app.item_price_daily_pres ip
        ON ip.item_id = lr.item_id AND ip.presentacion = lr.presentacion AND ip.as_of_date = lr.max_date
      ${whereItem}
      ORDER BY pv.nombre ASC NULLS LAST, i.item_id DESC, lr.presentacion ASC
      LIMIT ${Number(limit)}
      `,
      itemParams
    );
    const item_options = normalizeQueryResult(itemsRes).map((r) => ({
      tipo: "ITEM_PRESENTACION" as const,
      item_id: Number(r.item_id),
      presentacion: Number(r.presentacion),
      price_ars: Number(r.price_ars),
      as_of_date: String(r.as_of_date ?? ""),
      proveedor_codigo: String(r.proveedor_codigo ?? ""),
      proveedor_nombre: String(r.proveedor_nombre ?? ""),
      url_original: String(r.url_original ?? ""),
      url_canonica: String(r.url_canonica ?? ""),
    }));

    // MANUAL/BULK: salen de cost_option (para ir cargando manuales ya)
    const costOptParams: any[] = [];
    let whereCO = "WHERE activo=true AND tipo in ('MANUAL_PRESENTACION','BULK_PRODUCTO')";
    if (search) {
      costOptParams.push(`%${search}%`);
      const p = costOptParams.length;
      whereCO += ` AND (
        coalesce(manual_nombre,'') ILIKE $${p}
      )`;
    }

    const coRes: any = await sql.query(
      `
      SELECT
        cost_option_id, tipo,
        manual_nombre, manual_uom, manual_cantidad, manual_costo_ars,
        bulk_producto_id,
        densidad_g_ml
      FROM app.cost_option
      ${whereCO}
      ORDER BY tipo ASC, manual_nombre ASC NULLS LAST, cost_option_id DESC
      LIMIT 500
      `,
      costOptParams
    );
    const cost_options_extra = normalizeQueryResult(coRes);

    return NextResponse.json({
      ok: true,
      item_options,
      cost_options_extra,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
