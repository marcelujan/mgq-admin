import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(_: NextRequest, ctx: { params: { producto_id: string } }) {
  try {
    const sql = db();
    const producto_id = Number(ctx.params.producto_id);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const r: any = await sql.query(
      `SELECT producto_id, rendimiento_total_g, densidad_formula_g_ml, notas, created_at, updated_at
       FROM app.producto_formula
       WHERE producto_id=$1
       LIMIT 1`,
      [producto_id]
    );
    const formula = normalizeQueryResult(r)?.[0] ?? null;
    return NextResponse.json({ ok: true, formula });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// PUT upsert formula header
export async function PUT(req: NextRequest, ctx: { params: { producto_id: string } }) {
  try {
    const sql = db();
    const producto_id = Number(ctx.params.producto_id);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const rendimiento_total_g = body?.rendimiento_total_g === null || body?.rendimiento_total_g === undefined ? 1000 : Number(body.rendimiento_total_g);
    const densidad_formula_g_ml = body?.densidad_formula_g_ml === null || body?.densidad_formula_g_ml === undefined ? null : Number(body.densidad_formula_g_ml);
    const notas = typeof body?.notas === "string" ? body.notas : null;

    if (!Number.isFinite(rendimiento_total_g) || rendimiento_total_g <= 0) {
      return NextResponse.json({ ok: false, error: "rendimiento_total_g inválido" }, { status: 422 });
    }
    if (densidad_formula_g_ml !== null && (!Number.isFinite(densidad_formula_g_ml) || densidad_formula_g_ml <= 0)) {
      return NextResponse.json({ ok: false, error: "densidad_formula_g_ml inválida" }, { status: 422 });
    }

    await sql.query(
      `INSERT INTO app.producto_formula (producto_id, rendimiento_total_g, densidad_formula_g_ml, notas)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (producto_id)
       DO UPDATE SET rendimiento_total_g=EXCLUDED.rendimiento_total_g, densidad_formula_g_ml=EXCLUDED.densidad_formula_g_ml, notas=EXCLUDED.notas, updated_at=now()`,
      [producto_id, rendimiento_total_g, densidad_formula_g_ml, notas]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, ctx: { params: { producto_id: string } }) {
  try {
    const sql = db();
    const producto_id = Number(ctx.params.producto_id);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    await sql.query(`DELETE FROM app.producto_formula WHERE producto_id=$1`, [producto_id]);
    // líneas se borran por FK ON DELETE CASCADE si está definido; si no, borrar explícito.
    await sql.query(`DELETE FROM app.producto_formula_linea WHERE producto_id=$1`, [producto_id]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
