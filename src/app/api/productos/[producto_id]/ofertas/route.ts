import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function isPos(n: any) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const r: any = await sql.query(
      `SELECT oferta_id, producto_id, nombre, is_bulk, peso_neto_g, volumen_neto_ml, unidades_pack, masa_por_unidad_g, volumen_por_unidad_ml,
              densidad_override_g_ml, merma_pct, activo, created_at, updated_at
       FROM app.producto_oferta
       WHERE producto_id=$1
       ORDER BY is_bulk DESC, updated_at DESC, oferta_id DESC`,
      [producto_id]
    );
    return NextResponse.json({ ok: true, ofertas: rows(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    const is_bulk = body?.is_bulk === true;

    const peso_neto_g = body?.peso_neto_g === null || body?.peso_neto_g === undefined ? null : Number(body.peso_neto_g);
    const volumen_neto_ml = body?.volumen_neto_ml === null || body?.volumen_neto_ml === undefined ? null : Number(body.volumen_neto_ml);
    const unidades_pack = body?.unidades_pack === null || body?.unidades_pack === undefined ? null : Number(body.unidades_pack);

    const masa_por_unidad_g =
      body?.masa_por_unidad_g === null || body?.masa_por_unidad_g === undefined ? null : Number(body.masa_por_unidad_g);
    const volumen_por_unidad_ml =
      body?.volumen_por_unidad_ml === null || body?.volumen_por_unidad_ml === undefined ? null : Number(body.volumen_por_unidad_ml);

    const densidad_override_g_ml =
      body?.densidad_override_g_ml === null || body?.densidad_override_g_ml === undefined ? null : Number(body.densidad_override_g_ml);

    const merma_pct = body?.merma_pct === null || body?.merma_pct === undefined ? null : Number(body.merma_pct);
    const activo = body?.activo === false ? false : true;

    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });

    // Validar que exista al menos una presentación
    if (!isPos(peso_neto_g) && !isPos(volumen_neto_ml) && !isPos(unidades_pack)) {
      return NextResponse.json({ ok: false, error: "Definir peso_neto_g, volumen_neto_ml o unidades_pack" }, { status: 422 });
    }
    if (is_bulk && isPos(unidades_pack)) {
      return NextResponse.json({ ok: false, error: "BULK no puede ser unidades_pack" }, { status: 422 });
    }

    if (densidad_override_g_ml !== null && (!Number.isFinite(densidad_override_g_ml) || densidad_override_g_ml <= 0)) {
      return NextResponse.json({ ok: false, error: "densidad_override_g_ml inválida" }, { status: 422 });
    }
    if (merma_pct !== null && (!Number.isFinite(merma_pct) || merma_pct < 0 || merma_pct >= 100)) {
      return NextResponse.json({ ok: false, error: "merma_pct inválida" }, { status: 422 });
    }

    const r: any = await sql.query(
      `INSERT INTO app.producto_oferta (
        producto_id, nombre, is_bulk, peso_neto_g, volumen_neto_ml, unidades_pack, masa_por_unidad_g, volumen_por_unidad_ml,
        densidad_override_g_ml, merma_pct, activo
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING oferta_id`,
      [
        producto_id,
        nombre,
        is_bulk,
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

    return NextResponse.json({ ok: true, oferta_id: rows(r)?.[0]?.oferta_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
