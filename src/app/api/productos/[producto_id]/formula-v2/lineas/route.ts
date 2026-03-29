import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeQueryResult, numOrNull, bool } from "@/lib/api";
import { recalcAndInsertSnapshotsForProducto } from "@/lib/ofertaSnapshots";
import { ensureItemFormuladoBulk, upsertBulkSnapshotToday } from "@/lib/bulkCost";

// GET líneas v2 (incluye job_price_ars / job_as_of_date para ITEM_PRESENTACION)
export async function GET(_: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const sql = db();

    const r: any = await sql.query(
      `
      WITH last_rows AS (
        SELECT item_id, presentacion, max(as_of_date) as max_date
        FROM app.item_price_daily_pres
        GROUP BY item_id, presentacion
      )
      SELECT
        l.linea_id, l.producto_id, l.cost_option_id, l.pct_peso, l.is_csp, l.orden,
        co.tipo,
        co.item_id, co.item_presentacion,
        co.manual_nombre, co.manual_uom, co.manual_cantidad, co.manual_costo_ars,
        co.bulk_producto_id,
        co.densidad_g_ml,

        ip.price_ars::float8 as job_price_ars,
        lr.max_date::text as job_as_of_date,

        iseg.url_original::text as item_url_original,
        iseg.url_canonica::text as item_url_canonica,
        pb.nombre::text as bulk_producto_nombre

      FROM app.producto_formula_linea_v2 l
      JOIN app.cost_option co ON co.cost_option_id = l.cost_option_id

      LEFT JOIN last_rows lr
        ON lr.item_id = co.item_id AND lr.presentacion = co.item_presentacion

      LEFT JOIN app.item_price_daily_pres ip
        ON ip.item_id = lr.item_id AND ip.presentacion = lr.presentacion AND ip.as_of_date = lr.max_date

      LEFT JOIN app.item_seguimiento iseg
        ON iseg.item_id = co.item_id

      LEFT JOIN app.producto pb
        ON pb.producto_id = co.bulk_producto_id

      WHERE l.producto_id=$1
      ORDER BY l.orden ASC, l.linea_id ASC
      `,
      [producto_id]
    );

    return NextResponse.json({ ok: true, lineas: normalizeQueryResult(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// POST crear línea
export async function POST(req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    const cost_option_id = Number(body?.cost_option_id);
    if (!Number.isFinite(cost_option_id)) return NextResponse.json({ ok: false, error: "cost_option_id inválido" }, { status: 400 });

    const pct_peso = numOrNull(body?.pct_peso);
    const is_csp = bool(body?.is_csp);
    const orden = Number(body?.orden ?? 999);

    const sql = db();

    // Invariante operativa: si existen líneas v2 para un producto, debe existir header v2.
    // Esto evita que el cron de formulados ignore productos nuevos creados solo desde el editor de líneas.
    await sql.query(
      `
      INSERT INTO app.producto_formula_v2 (producto_id, lote_ref_g)
      VALUES ($1, 1000)
      ON CONFLICT (producto_id) DO NOTHING
      `,
      [producto_id]
    );

    if (is_csp) {
      await sql.query(`UPDATE app.producto_formula_linea_v2 SET is_csp=false WHERE producto_id=$1`, [producto_id]);
    }

    const r: any = await sql.query(
      `
      INSERT INTO app.producto_formula_linea_v2 (producto_id, cost_option_id, pct_peso, is_csp, orden)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING linea_id
      `,
      [producto_id, cost_option_id, pct_peso, is_csp, Number.isFinite(orden) ? orden : 999]
    );
    const rows = normalizeQueryResult(r);
    const linea_id = rows?.[0]?.linea_id;

    // snapshots automáticos
    await recalcAndInsertSnapshotsForProducto({ producto_id, fuente: "FORMULA_LINEA_CREATE" });

    // Intentar snapshot BULK HOY (si la fórmula ya es calculable).
    let bulk_snapshot_error: string | null = null;
    try {
      await ensureItemFormuladoBulk({ query: (t: string, p?: any[]) => sql.query(t, p) }, producto_id);
      await upsertBulkSnapshotToday(
        { query: (t: string, p?: any[]) => sql.query(t, p) },
        producto_id,
        "FORMULA_LINEA_CREATE"
      );
    } catch (e: any) {
      bulk_snapshot_error = String(e?.message ?? e);
    }

    return NextResponse.json({ ok: true, linea_id, bulk_snapshot_error });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}