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

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ producto_id: string }> }
) {
  try {
    const { producto_id } = await ctx.params;
    const productoId = Number(producto_id);

    if (!Number.isFinite(productoId)) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

    const sql = db();

    const pRes: any = await sql.query(
      `SELECT * FROM app.producto WHERE producto_id=$1 LIMIT 1`,
      [productoId]
    );
    const producto = normalizeQueryResult(pRes)?.[0] ?? null;
    if (!producto) {
      return NextResponse.json({ ok: false, error: "producto no encontrado" }, { status: 404 });
    }

    const bRes: any = await sql.query(
      `SELECT * FROM app.producto_base WHERE producto_id=$1 LIMIT 1`,
      [productoId]
    );

    const fRes: any = await sql.query(
      `SELECT * FROM app.producto_formula WHERE producto_id=$1 LIMIT 1`,
      [productoId]
    );

    const lRes: any = await sql.query(
      `SELECT * FROM app.producto_formula_linea
       WHERE producto_id=$1
       ORDER BY orden ASC, linea_id ASC`,
      [productoId]
    );

    return NextResponse.json({
      ok: true,
      producto,
      base: normalizeQueryResult(bRes)?.[0] ?? null,
      formula: normalizeQueryResult(fRes)?.[0] ?? null,
      lineas: normalizeQueryResult(lRes) ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

/**
 * PATCH /api/productos/:producto_id
 * Body permitido (por ahora):
 * - densidad_producto_g_ml: number | null
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ producto_id: string }> }
) {
  try {
    const { producto_id } = await ctx.params;
    const productoId = Number(producto_id);

    if (!Number.isFinite(productoId)) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    // Permitir null (borrar densidad)
    const densidad_producto_g_ml =
      body?.densidad_producto_g_ml === undefined ? undefined : numOrNull(body?.densidad_producto_g_ml);

    if (densidad_producto_g_ml !== undefined) {
      if (densidad_producto_g_ml !== null && densidad_producto_g_ml <= 0) {
        return NextResponse.json({ ok: false, error: "densidad_producto_g_ml inválida" }, { status: 400 });
      }
    }

    if (densidad_producto_g_ml === undefined) {
      return NextResponse.json({ ok: false, error: "sin cambios" }, { status: 400 });
    }

    const sql = db();

    const uRes: any = await sql.query(
      `
      UPDATE app.producto
      SET densidad_producto_g_ml = $2
      WHERE producto_id = $1
      RETURNING *
      `,
      [productoId, densidad_producto_g_ml]
    );

    const updated = normalizeQueryResult(uRes)?.[0] ?? null;
    if (!updated) {
      return NextResponse.json({ ok: false, error: "producto no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, producto: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
