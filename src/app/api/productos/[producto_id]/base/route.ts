import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

/**
 * Producto Base: define el "contenido" del producto cuando NO hay fórmula.
 * tipo_base: 'INSUMO' | 'ITEM'
 *
 * Política de este proyecto:
 * - Si tipo_base = ITEM => presentacion_preferida es obligatoria (preferida obligatoria).
 * - Para MVP, se asume que la presentación del item está en la UOM esperada por el producto/insumo equivalente.
 */

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ producto_id: string }> }
) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);

    if (!Number.isFinite(producto_id)) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

    const r: any = await sql.query(
      `SELECT producto_id, tipo_base, insumo_id, item_id, presentacion_preferida
       FROM app.producto_base
       WHERE producto_id=$1
       LIMIT 1`,
      [producto_id]
    );
    const base = normalizeQueryResult(r)[0] ?? null;

    return NextResponse.json({ ok: true, base });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ producto_id: string }> }
) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);

    if (!Number.isFinite(producto_id)) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const tipo_base = typeof body?.tipo_base === "string" ? body.tipo_base.trim().toUpperCase() : "";

    if (!["INSUMO", "ITEM"].includes(tipo_base)) {
      return NextResponse.json({ ok: false, error: "tipo_base inválido (INSUMO|ITEM)" }, { status: 422 });
    }

    const insumo_id = body?.insumo_id === null || body?.insumo_id === undefined ? null : Number(body.insumo_id);
    const item_id = body?.item_id === null || body?.item_id === undefined ? null : Number(body.item_id);
    const presentacion_preferida =
      body?.presentacion_preferida === null || body?.presentacion_preferida === undefined
        ? null
        : Number(body.presentacion_preferida);

    if (tipo_base === "INSUMO") {
      if (!Number.isFinite(insumo_id) || (insumo_id as number) <= 0) {
        return NextResponse.json({ ok: false, error: "insumo_id requerido para tipo_base=INSUMO" }, { status: 422 });
      }
    }

    if (tipo_base === "ITEM") {
      if (!Number.isFinite(item_id) || (item_id as number) <= 0) {
        return NextResponse.json({ ok: false, error: "item_id requerido para tipo_base=ITEM" }, { status: 422 });
      }
      if (!Number.isFinite(presentacion_preferida) || (presentacion_preferida as number) <= 0) {
        return NextResponse.json({ ok: false, error: "presentacion_preferida requerida (preferida obligatoria)" }, { status: 422 });
      }
    }

    // UPSERT producto_base
    await sql.query(
      `INSERT INTO app.producto_base (producto_id, tipo_base, insumo_id, item_id, presentacion_preferida)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (producto_id) DO UPDATE
       SET tipo_base = EXCLUDED.tipo_base,
           insumo_id = EXCLUDED.insumo_id,
           item_id = EXCLUDED.item_id,
           presentacion_preferida = EXCLUDED.presentacion_preferida`,
      [
        producto_id,
        tipo_base,
        tipo_base === "INSUMO" ? insumo_id : null,
        tipo_base === "ITEM" ? item_id : null,
        tipo_base === "ITEM" ? presentacion_preferida : null,
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ producto_id: string }> }
) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);

    if (!Number.isFinite(producto_id)) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

    await sql.query(`DELETE FROM app.producto_base WHERE producto_id=$1`, [producto_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
