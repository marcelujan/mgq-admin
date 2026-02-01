import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(_: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const { producto_id: producto_idStr } = await ctx.params;

    const sql = db();
    const producto_id = Number(producto_idStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const r: any = await sql.query(
      `SELECT oferta_id, producto_id, nombre,
              peso_neto_g, volumen_neto_ml, unidades_pack,
              masa_por_unidad_g, volumen_por_unidad_ml,
              densidad_override_g_ml, merma_pct, activo, created_at, updated_at
       FROM app.producto_oferta
       WHERE producto_id=$1
       ORDER BY updated_at DESC, oferta_id DESC`,
      [producto_id]
    );
    const ofertas = normalizeQueryResult(r);
    return NextResponse.json({ ok: true, ofertas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const sql = db();
    const producto_id = Number(producto_idStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });

    const pick = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
    const peso_neto_g = pick(body?.peso_neto_g);
    const volumen_neto_ml = pick(body?.volumen_neto_ml);
    const unidades_pack = pick(body?.unidades_pack);
    const masa_por_unidad_g = pick(body?.masa_por_unidad_g);
    const volumen_por_unidad_ml = pick(body?.volumen_por_unidad_ml);
    const densidad_override_g_ml = pick(body?.densidad_override_g_ml);
    const merma_pct = pick(body?.merma_pct);
    const activo = body?.activo === false ? false : true;

    const anyPresent = (peso_neto_g && peso_neto_g > 0) || (volumen_neto_ml && volumen_neto_ml > 0) || (unidades_pack && unidades_pack > 0);
    if (!anyPresent) {
      return NextResponse.json(
        { ok: false, error: "Definir peso_neto_g o volumen_neto_ml o unidades_pack" },
        { status: 422 }
      );
    }
    if (densidad_override_g_ml !== null && (!Number.isFinite(densidad_override_g_ml) || densidad_override_g_ml <= 0)) {
      return NextResponse.json({ ok: false, error: "densidad_override_g_ml inválida" }, { status: 422 });
    }
    if (merma_pct !== null && (!Number.isFinite(merma_pct) || merma_pct < 0 || merma_pct >= 100)) {
      return NextResponse.json({ ok: false, error: "merma_pct inválida" }, { status: 422 });
    }

    if (unidades_pack && unidades_pack > 0) {
      const okEq = (masa_por_unidad_g && masa_por_unidad_g > 0) || (volumen_por_unidad_ml && volumen_por_unidad_ml > 0);
      if (!okEq) {
        return NextResponse.json(
          { ok: false, error: "Para unidades_pack, definir masa_por_unidad_g o volumen_por_unidad_ml" },
          { status: 422 }
        );
      }
    }

    const r: any = await sql.query(
      `INSERT INTO app.producto_oferta (
          producto_id, nombre,
          peso_neto_g, volumen_neto_ml, unidades_pack,
          masa_por_unidad_g, volumen_por_unidad_ml,
          densidad_override_g_ml, merma_pct, activo
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING oferta_id`,
      [
        producto_id,
        nombre,
        peso_neto_g,
        volumen_neto_ml,
        unidades_pack,
        masa_por_unidad_g,
        volumen_por_unidad_ml,
        densidad_override_g_ml,
        merma_pct,
        activo,
      ]
    );
    const oferta_id = normalizeQueryResult(r)?.[0]?.oferta_id;
    return NextResponse.json({ ok: true, oferta_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
