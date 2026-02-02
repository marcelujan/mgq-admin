import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const pRes: any = await sql.query(
      `SELECT producto_id, nombre, descripcion, categoria, activo, densidad_producto_g_ml, created_at, updated_at
       FROM app.producto WHERE producto_id=$1 LIMIT 1`,
      [producto_id]
    );
    const producto = rows(pRes)?.[0];
    if (!producto) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });

    const bRes: any = await sql.query(`SELECT * FROM app.producto_base WHERE producto_id=$1 LIMIT 1`, [producto_id]);
    const base = rows(bRes)?.[0] ?? null;

    const fRes: any = await sql.query(`SELECT * FROM app.producto_formula WHERE producto_id=$1 LIMIT 1`, [producto_id]);
    const formula = rows(fRes)?.[0] ?? null;

    const lRes: any = await sql.query(
      `SELECT * FROM app.producto_formula_linea WHERE producto_id=$1 ORDER BY orden ASC, linea_id ASC`,
      [producto_id]
    );
    const lineas = rows(lRes);

    const oRes: any = await sql.query(
      `SELECT oferta_id, producto_id, nombre, is_bulk, peso_neto_g, volumen_neto_ml, unidades_pack, masa_por_unidad_g, volumen_por_unidad_ml,
              densidad_override_g_ml, merma_pct, activo, created_at, updated_at
       FROM app.producto_oferta
       WHERE producto_id=$1
       ORDER BY is_bulk DESC, updated_at DESC, oferta_id DESC`,
      [producto_id]
    );
    const ofertas = rows(oRes);

    return NextResponse.json({ ok: true, producto, base, formula, lineas, ofertas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    const sets: string[] = [];
    const params: any[] = [];
    const pushSet = (frag: string, v: any) => {
      params.push(v);
      sets.push(frag.replace("?", `$${params.length}`));
    };

    if (typeof body?.nombre === "string") pushSet("nombre = ?", body.nombre.trim());
    if (body?.descripcion !== undefined) pushSet("descripcion = ?", typeof body.descripcion === "string" ? body.descripcion : null);
    if (body?.categoria !== undefined) pushSet("categoria = ?", typeof body.categoria === "string" ? body.categoria : null);
    if (body?.activo !== undefined) pushSet("activo = ?", body.activo === true);

    if (body?.densidad_producto_g_ml !== undefined) {
      const d = body.densidad_producto_g_ml === null ? null : Number(body.densidad_producto_g_ml);
      if (d !== null && (!Number.isFinite(d) || d <= 0)) return NextResponse.json({ ok: false, error: "densidad_producto_g_ml inválida" }, { status: 422 });
      pushSet("densidad_producto_g_ml = ?", d);
    }

    if (!sets.length) return NextResponse.json({ ok: false, error: "sin cambios" }, { status: 400 });

    sets.push("updated_at = now()");
    params.push(producto_id);

    await sql.query(`UPDATE app.producto SET ${sets.join(", ")} WHERE producto_id=$${params.length}`, params);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ producto_id: string }> }) {
  try {
    const sql = db();
    const { producto_id: productoIdStr } = await ctx.params;
    const producto_id = Number(productoIdStr);
    if (!Number.isFinite(producto_id)) return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });

    await sql.query(`UPDATE app.producto SET activo=false, updated_at=now() WHERE producto_id=$1`, [producto_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
