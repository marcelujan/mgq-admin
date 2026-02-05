import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeQueryResult, numOrNull } from "@/lib/api";
import { recalcAndInsertSnapshotsForProducto } from "@/lib/ofertaSnapshots";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ cost_option_id: string }> }) {
  try {
    const { cost_option_id: idStr } = await ctx.params;
    const cost_option_id = Number(idStr);
    if (!Number.isFinite(cost_option_id)) return NextResponse.json({ ok: false, error: "cost_option_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const densidad_g_ml = body.hasOwnProperty("densidad_g_ml") ? numOrNull(body?.densidad_g_ml) : undefined;

    const sql = db();

    const r: any = await sql.query(
      `
      UPDATE app.cost_option
      SET densidad_g_ml = COALESCE($2, densidad_g_ml)
      WHERE cost_option_id=$1
      RETURNING cost_option_id
      `,
      [cost_option_id, densidad_g_ml === undefined ? null : densidad_g_ml]
    );
    const rows = normalizeQueryResult(r);
    if (!rows?.length) return NextResponse.json({ ok: false, error: "cost_option no encontrado" }, { status: 404 });

    // buscar productos afectados y snapshot automático
    const pR: any = await sql.query(
      `
      SELECT DISTINCT producto_id
      FROM app.producto_formula_linea_v2
      WHERE cost_option_id=$1
      `,
      [cost_option_id]
    );
    const prodRows = normalizeQueryResult(pR) as any[];
    const productoIds = prodRows.map((x) => Number(x.producto_id)).filter((x) => Number.isFinite(x));

    for (const producto_id of productoIds) {
      await recalcAndInsertSnapshotsForProducto({ producto_id, fuente: "COST_OPTION_DENS_PATCH" });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}