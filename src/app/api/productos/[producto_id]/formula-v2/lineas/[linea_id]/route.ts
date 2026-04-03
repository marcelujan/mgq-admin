import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeQueryResult, numOrNull, bool } from "@/lib/api";
import { recalcAndInsertSnapshotsForProducto } from "@/lib/ofertaSnapshots";
import { ensureItemFormuladoBulk, upsertBulkSnapshotToday } from "@/lib/bulkCost";
import { ensureProductoFormulaV2Header } from "@/lib/productoFormulaV2";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ producto_id: string; linea_id: string }> }) {
  try {
    const { producto_id: productoIdStr, linea_id: lineaIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    const linea_id = Number(lineaIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    if (!Number.isFinite(linea_id)) return NextResponse.json({ ok: false, error: "linea_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    const pct_peso = body.hasOwnProperty("pct_peso") ? numOrNull(body?.pct_peso) : undefined;
    const is_csp = body.hasOwnProperty("is_csp") ? bool(body?.is_csp) : undefined;
    const orden = body.hasOwnProperty("orden") ? Number(body?.orden) : undefined;

    const sql = db();

    if (is_csp === true) {
      await sql.query(`UPDATE app.producto_formula_linea_v2 SET is_csp=false WHERE producto_id=$1`, [producto_id]);
    }

    const r: any = await sql.query(
      `
      UPDATE app.producto_formula_linea_v2
      SET
        pct_peso = COALESCE($3, pct_peso),
        is_csp   = COALESCE($4, is_csp),
        orden    = COALESCE($5, orden)
      WHERE producto_id=$1 AND linea_id=$2
      RETURNING linea_id
      `,
      [
        producto_id,
        linea_id,
        pct_peso === undefined ? null : pct_peso,
        is_csp === undefined ? null : is_csp,
        orden === undefined || !Number.isFinite(orden) ? null : orden,
      ]
    );

    const rows = normalizeQueryResult(r);
    if (!rows?.length) return NextResponse.json({ ok: false, error: "línea no encontrada" }, { status: 404 });

    await ensureProductoFormulaV2Header({ query: (t: string, p?: any[]) => sql.query(t, p) }, producto_id);

    // snapshots automáticos
    await recalcAndInsertSnapshotsForProducto({ producto_id, fuente: "FORMULA_LINEA_PATCH" });

    // Intentar snapshot BULK HOY (si la fórmula es calculable).
    let bulk_snapshot_error: string | null = null;
    try {
      await ensureItemFormuladoBulk({ query: (t: string, p?: any[]) => sql.query(t, p) }, producto_id);
      await upsertBulkSnapshotToday(
        { query: (t: string, p?: any[]) => sql.query(t, p) },
        producto_id,
        "AUTO"
      );
    } catch (e: any) {
      bulk_snapshot_error = String(e?.message ?? e);
    }

    return NextResponse.json({ ok: true, bulk_snapshot_error });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, ctx: { params: Promise<{ producto_id: string; linea_id: string }> }) {
  try {
    const { producto_id: productoIdStr, linea_id: lineaIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    const linea_id = Number(lineaIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    if (!Number.isFinite(linea_id)) return NextResponse.json({ ok: false, error: "linea_id inválido" }, { status: 400 });

    const sql = db();

    const r: any = await sql.query(
      `
      DELETE FROM app.producto_formula_linea_v2
      WHERE producto_id=$1 AND linea_id=$2
      RETURNING linea_id
      `,
      [producto_id, linea_id]
    );
    const rows = normalizeQueryResult(r);
    if (!rows?.length) return NextResponse.json({ ok: false, error: "línea no encontrada" }, { status: 404 });

    await ensureProductoFormulaV2Header({ query: (t: string, p?: any[]) => sql.query(t, p) }, producto_id);

    // snapshots automáticos
    await recalcAndInsertSnapshotsForProducto({ producto_id, fuente: "FORMULA_LINEA_DELETE" });

    // Intentar snapshot BULK HOY (si la fórmula aún es calculable).
    let bulk_snapshot_error: string | null = null;
    try {
      await ensureItemFormuladoBulk({ query: (t: string, p?: any[]) => sql.query(t, p) }, producto_id);
      await upsertBulkSnapshotToday(
        { query: (t: string, p?: any[]) => sql.query(t, p) },
        producto_id,
        "AUTO"
      );
    } catch (e: any) {
      bulk_snapshot_error = String(e?.message ?? e);
    }

    return NextResponse.json({ ok: true, bulk_snapshot_error });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}