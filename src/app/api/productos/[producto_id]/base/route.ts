import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

// GET base
export async function GET(_: NextRequest, ctx: { params: { producto_id: string } }) {
  try {
    const sql = db();
    const producto_id = Number(ctx.params.producto_id);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const r: any = await sql.query(
      `SELECT producto_id, tipo_base, insumo_id, item_id, presentacion_preferida
       FROM app.producto_base WHERE producto_id=$1 LIMIT 1`,
      [producto_id]
    );
    const base = normalizeQueryResult(r)?.[0] ?? null;
    return NextResponse.json({ ok: true, base });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// PUT upsert base
export async function PUT(req: NextRequest, ctx: { params: { producto_id: string } }) {
  try {
    const sql = db();
    const producto_id = Number(ctx.params.producto_id);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const tipo_base = typeof body?.tipo_base === "string" ? body.tipo_base.trim().toUpperCase() : "";

    if (!['INSUMO','ITEM'].includes(tipo_base)) {
      return NextResponse.json({ ok: false, error: "tipo_base inválido (INSUMO|ITEM)" }, { status: 422 });
    }

    let insumo_id: number | null = null;
    let item_id: number | null = null;
    let presentacion_preferida: number | null = null;

    if (tipo_base === 'INSUMO') {
      insumo_id = Number(body?.insumo_id);
      if (!Number.isFinite(insumo_id) || insumo_id <= 0) {
        return NextResponse.json({ ok: false, error: "insumo_id requerido" }, { status: 422 });
      }
    } else {
      item_id = Number(body?.item_id);
      presentacion_preferida = Number(body?.presentacion_preferida);
      if (!Number.isFinite(item_id) || item_id <= 0) {
        return NextResponse.json({ ok: false, error: "item_id requerido" }, { status: 422 });
      }
      if (!Number.isFinite(presentacion_preferida) || presentacion_preferida <= 0) {
        return NextResponse.json({ ok: false, error: "presentacion_preferida requerida (>0)" }, { status: 422 });
      }
    }

    await sql.query(
      `INSERT INTO app.producto_base (producto_id, tipo_base, insumo_id, item_id, presentacion_preferida)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (producto_id)
       DO UPDATE SET tipo_base=EXCLUDED.tipo_base, insumo_id=EXCLUDED.insumo_id, item_id=EXCLUDED.item_id, presentacion_preferida=EXCLUDED.presentacion_preferida`,
      [producto_id, tipo_base, insumo_id, item_id, presentacion_preferida]
    );

    // Si el producto pasa a tener base, se recomienda eliminar fórmula (decisión de UX). No lo hacemos automáticamente.
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
    await sql.query(`DELETE FROM app.producto_base WHERE producto_id=$1`, [producto_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
