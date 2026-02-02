import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ insumo_id: string }> }) {
  try {
    const sql = db();
    const { insumo_id: insumoIdStr } = await ctx.params;
    const insumo_id = Number(insumoIdStr);
    if (!Number.isFinite(insumo_id)) return NextResponse.json({ ok: false, error: "insumo_id inválido" }, { status: 400 });

    const a: any = await sql.query(
      `SELECT insumo_id, nombre, tipo_uom, densidad_g_ml, activo, notas, created_at, updated_at
       FROM app.insumo WHERE insumo_id=$1 LIMIT 1`,
      [insumo_id]
    );
    const insumo = rows(a)?.[0];
    if (!insumo) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });

    const b: any = await sql.query(
      `SELECT fuente_id, insumo_id, tipo, costo_por_uom_ars, vigente_desde, item_id, presentacion_preferida, habilitada, prioridad, created_at
       FROM app.insumo_fuente
       WHERE insumo_id=$1
       ORDER BY prioridad ASC, fuente_id ASC`,
      [insumo_id]
    );

    return NextResponse.json({ ok: true, insumo, fuentes: rows(b) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ insumo_id: string }> }) {
  try {
    const sql = db();
    const { insumo_id: insumoIdStr } = await ctx.params;
    const insumo_id = Number(insumoIdStr);
    if (!Number.isFinite(insumo_id)) return NextResponse.json({ ok: false, error: "insumo_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    const sets: string[] = [];
    const params: any[] = [];
    const pushSet = (frag: string, v: any) => {
      params.push(v);
      sets.push(frag.replace("?", `$${params.length}`));
    };

    if (typeof body?.nombre === "string") pushSet("nombre = ?", body.nombre.trim());

    if (typeof body?.tipo_uom === "string") {
      const t = body.tipo_uom.trim().toUpperCase();
      if (!["GR", "ML", "UN"].includes(t)) return NextResponse.json({ ok: false, error: "tipo_uom inválido" }, { status: 422 });
      pushSet("tipo_uom = ?", t);
    }

    if (body?.densidad_g_ml !== undefined) {
      const d = body.densidad_g_ml === null ? null : Number(body.densidad_g_ml);
      if (d !== null && (!Number.isFinite(d) || d <= 0)) return NextResponse.json({ ok: false, error: "densidad_g_ml inválida" }, { status: 422 });
      pushSet("densidad_g_ml = ?", d);
    }

    if (body?.activo !== undefined) pushSet("activo = ?", body.activo === true);
    if (body?.notas !== undefined) pushSet("notas = ?", typeof body.notas === "string" ? body.notas : null);

    if (!sets.length) return NextResponse.json({ ok: false, error: "sin cambios" }, { status: 400 });

    sets.push("updated_at = now()");
    params.push(insumo_id);

    const q = `UPDATE app.insumo SET ${sets.join(", ")} WHERE insumo_id = $${params.length}`;
    await sql.query(q, params);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ insumo_id: string }> }) {
  try {
    const sql = db();
    const { insumo_id: insumoIdStr } = await ctx.params;
    const insumo_id = Number(insumoIdStr);
    if (!Number.isFinite(insumo_id)) return NextResponse.json({ ok: false, error: "insumo_id inválido" }, { status: 400 });

    await sql.query(`UPDATE app.insumo SET activo=false, updated_at=now() WHERE insumo_id=$1`, [insumo_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
