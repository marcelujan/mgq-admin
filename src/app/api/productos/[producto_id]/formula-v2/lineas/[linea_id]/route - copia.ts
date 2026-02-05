import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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

function bool(v: any): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

// PATCH update línea
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ producto_id: string; linea_id: string }> }) {
  try {
    const { producto_id: productoIdStr, linea_id: lineaIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    const linea_id = Number(lineaIdStr);
    if (!Number.isFinite(producto_id) || !Number.isFinite(linea_id)) {
      return NextResponse.json({ ok: false, error: "ids inválidos" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    const pct_peso = body?.pct_peso === undefined ? undefined : numOrNull(body?.pct_peso);
    const is_csp = body?.is_csp === undefined ? undefined : bool(body?.is_csp);
    const orden = body?.orden === undefined ? undefined : Number(body?.orden);
    const cost_option_id = body?.cost_option_id === undefined ? undefined : Number(body?.cost_option_id);

    const sql = db();

    if (is_csp === true) {
      await sql.query(`UPDATE app.producto_formula_linea_v2 SET is_csp=false WHERE producto_id=$1`, [producto_id]);
    }

    const sets: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (pct_peso !== undefined) {
      sets.push(`pct_peso=$${p++}`);
      values.push(pct_peso);
    }
    if (is_csp !== undefined) {
      sets.push(`is_csp=$${p++}`);
      values.push(is_csp);
    }
    if (orden !== undefined && Number.isFinite(orden)) {
      sets.push(`orden=$${p++}`);
      values.push(orden);
    }
    if (cost_option_id !== undefined && Number.isFinite(cost_option_id)) {
      sets.push(`cost_option_id=$${p++}`);
      values.push(cost_option_id);
    }

    if (!sets.length) return NextResponse.json({ ok: true });

    values.push(producto_id, linea_id);

    await sql.query(
      `
      UPDATE app.producto_formula_linea_v2
      SET ${sets.join(", ")}, updated_at=now()
      WHERE producto_id=$${p++} AND linea_id=$${p++}
      `,
      values
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// DELETE línea
export async function DELETE(_: NextRequest, ctx: { params: Promise<{ producto_id: string; linea_id: string }> }) {
  try {
    const { producto_id: productoIdStr, linea_id: lineaIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    const linea_id = Number(lineaIdStr);
    if (!Number.isFinite(producto_id) || !Number.isFinite(linea_id)) {
      return NextResponse.json({ ok: false, error: "ids inválidos" }, { status: 400 });
    }

    const sql = db();
    await sql.query(`DELETE FROM app.producto_formula_linea_v2 WHERE producto_id=$1 AND linea_id=$2`, [producto_id, linea_id]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
