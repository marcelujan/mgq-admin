import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recalcAndInsertSnapshotsForProducto } from "@/lib/ofertaSnapshots";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolOrUndef(v: any): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return undefined;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ cost_option_id: string }> }) {
  try {
    const { cost_option_id: idStr } = await ctx.params;
    const cost_option_id = Number(idStr);
    if (!Number.isFinite(cost_option_id)) {
      return NextResponse.json({ ok: false, error: "cost_option_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    const densidad_g_ml = body?.densidad_g_ml === undefined ? undefined : numOrNull(body?.densidad_g_ml);
    const activo = boolOrUndef(body?.activo);

    const manual_nombre = body?.manual_nombre === undefined ? undefined : String(body?.manual_nombre ?? "").trim();
    const manual_uom = body?.manual_uom === undefined ? undefined : String(body?.manual_uom ?? "").trim();
    const manual_cantidad = body?.manual_cantidad === undefined ? undefined : numOrNull(body?.manual_cantidad);
    const manual_costo_ars = body?.manual_costo_ars === undefined ? undefined : numOrNull(body?.manual_costo_ars);

    const bulk_producto_id = body?.bulk_producto_id === undefined ? undefined : Number(body?.bulk_producto_id);

    if (manual_uom !== undefined && !["GR", "ML", "UN", ""].includes(manual_uom)) {
      return NextResponse.json({ ok: false, error: "manual_uom inválido" }, { status: 400 });
    }
    if (bulk_producto_id !== undefined && !Number.isFinite(bulk_producto_id)) {
      return NextResponse.json({ ok: false, error: "bulk_producto_id inválido" }, { status: 400 });
    }
    if (densidad_g_ml !== undefined && densidad_g_ml !== null && densidad_g_ml <= 0) {
      return NextResponse.json({ ok: false, error: "densidad_g_ml inválida" }, { status: 400 });
    }
    if (manual_cantidad !== undefined && manual_cantidad !== null && manual_cantidad <= 0) {
      return NextResponse.json({ ok: false, error: "manual_cantidad inválida" }, { status: 400 });
    }
    if (manual_costo_ars !== undefined && manual_costo_ars !== null && manual_costo_ars < 0) {
      return NextResponse.json({ ok: false, error: "manual_costo_ars inválido" }, { status: 400 });
    }

    const sets: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (densidad_g_ml !== undefined) {
      sets.push(`densidad_g_ml=$${p++}`);
      values.push(densidad_g_ml);
    }
    if (activo !== undefined) {
      sets.push(`activo=$${p++}`);
      values.push(activo);
    }
    if (manual_nombre !== undefined) {
      sets.push(`manual_nombre=$${p++}`);
      values.push(manual_nombre || null);
    }
    if (manual_uom !== undefined) {
      sets.push(`manual_uom=$${p++}`);
      values.push(manual_uom || null);
    }
    if (manual_cantidad !== undefined) {
      sets.push(`manual_cantidad=$${p++}`);
      values.push(manual_cantidad);
    }
    if (manual_costo_ars !== undefined) {
      sets.push(`manual_costo_ars=$${p++}`);
      values.push(manual_costo_ars);
    }
    if (bulk_producto_id !== undefined) {
      sets.push(`bulk_producto_id=$${p++}`);
      values.push(bulk_producto_id);
    }

    if (!sets.length) return NextResponse.json({ ok: true });

    values.push(cost_option_id);

    const sql = db();
    const r: any = await sql.query(
      `
      UPDATE app.cost_option
      SET ${sets.join(", ")}, updated_at=now()
      WHERE cost_option_id=$${p++}
      RETURNING cost_option_id
      `,
      values
    );
    const rows = normalizeQueryResult(r);
    if (!rows.length) return NextResponse.json({ ok: false, error: "no existe cost_option" }, { status: 404 });

    // Recalcular snapshots: todos los productos cuya fórmula usa este cost_option
    try {
      const pr: any = await sql.query(
        `
        SELECT DISTINCT producto_id
        FROM app.formula_linea_v2
        WHERE cost_option_id = $1
        `,
        [cost_option_id]
      );
      const productoIds = normalizeQueryResult(pr)
        .map((x) => Number(x.producto_id))
        .filter((x) => Number.isFinite(x));

      for (const producto_id of productoIds) {
        await recalcAndInsertSnapshotsForProducto({
          producto_id,
          fuente: "COST_OPTION_DENS_PATCH",
          origin: "/api/cost-options/[cost_option_id]",
        });
      }
    } catch {
      // No romper el PATCH si el recálculo falla.
    }

    return NextResponse.json({ ok: true, cost_option_id: Number(rows[0].cost_option_id) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}