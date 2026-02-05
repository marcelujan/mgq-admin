import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recalcAndInsertOfertaSnapshot } from "@/lib/ofertaSnapshots";

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  // neon(serverless) suele devolver { rows: [...] }
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id } = await ctx.params;
    const ofertaId = Number(oferta_id);
    if (!Number.isFinite(ofertaId)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const sql = db();
    const r: any = await sql.query(
      `
      SELECT
        oferta_id,
        producto_id,
        nombre,
        activo,
        is_bulk,
        peso_neto_g,
        volumen_neto_ml,
        unidades_pack,
        masa_por_unidad_g,
        volumen_por_unidad_ml,
        densidad_override_g_ml
      FROM app.producto_oferta
      WHERE oferta_id = $1
      `,
      [ofertaId]
    );

    const rows = normalizeQueryResult(r);
    const oferta = rows[0] ?? null;
    if (!oferta) return NextResponse.json({ ok: false, error: "Oferta no encontrada" }, { status: 404 });

    return NextResponse.json({ ok: true, oferta });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id } = await ctx.params;
    const ofertaId = Number(oferta_id);
    if (!Number.isFinite(ofertaId)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    // Campos permitidos
    const patch: any = {};

    if ("nombre" in body) patch.nombre = String(body.nombre ?? "").trim();
    if ("activo" in body) patch.activo = !!body.activo;
    if ("is_bulk" in body) patch.is_bulk = !!body.is_bulk;

    if ("peso_neto_g" in body) patch.peso_neto_g = numOrNull(body.peso_neto_g);
    if ("volumen_neto_ml" in body) patch.volumen_neto_ml = numOrNull(body.volumen_neto_ml);
    if ("unidades_pack" in body) patch.unidades_pack = numOrNull(body.unidades_pack);
    if ("masa_por_unidad_g" in body) patch.masa_por_unidad_g = numOrNull(body.masa_por_unidad_g);
    if ("volumen_por_unidad_ml" in body) patch.volumen_por_unidad_ml = numOrNull(body.volumen_por_unidad_ml);
    if ("densidad_override_g_ml" in body) patch.densidad_override_g_ml = numOrNull(body.densidad_override_g_ml);

    // Si no hay nada para actualizar
    const keys = Object.keys(patch);
    if (!keys.length) return NextResponse.json({ ok: true, skipped: true });

    // Validaciones mínimas (no romper MVP)
    if ("nombre" in patch && !patch.nombre) return NextResponse.json({ ok: false, error: "nombre inválido" }, { status: 400 });

    for (const k of [
      "peso_neto_g",
      "volumen_neto_ml",
      "unidades_pack",
      "masa_por_unidad_g",
      "volumen_por_unidad_ml",
      "densidad_override_g_ml",
    ] as const) {
      if (k in patch && patch[k] !== null && patch[k] < 0) {
        return NextResponse.json({ ok: false, error: `${k} no puede ser negativo` }, { status: 400 });
      }
    }

    const sql = db();

    // UPDATE dinámico con placeholders
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const k of keys) {
      sets.push(`${k} = $${idx++}`);
      values.push(patch[k]);
    }

    values.push(ofertaId);

    const upd: any = await sql.query(
      `
      UPDATE app.producto_oferta
      SET ${sets.join(", ")}
      WHERE oferta_id = $${idx}
      RETURNING
        oferta_id,
        producto_id,
        nombre,
        activo,
        is_bulk,
        peso_neto_g,
        volumen_neto_ml,
        unidades_pack,
        masa_por_unidad_g,
        volumen_por_unidad_ml,
        densidad_override_g_ml
      `,
      values
    );

    const oferta = normalizeQueryResult(upd)[0] ?? null;

    // ✅ Snapshot automático por cambio de oferta
    await recalcAndInsertOfertaSnapshot({ oferta_id: ofertaId, fuente: "OFERTA_CHANGE" });

    return NextResponse.json({ ok: true, oferta });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}