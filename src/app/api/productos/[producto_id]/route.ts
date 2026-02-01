import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";

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
    if (!Number.isFinite(producto_id)) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

    const pRes: any = await sql.query(
      `SELECT producto_id, nombre, descripcion, categoria, densidad_producto_g_ml, activo, created_at, updated_at
       FROM app.producto
       WHERE producto_id=$1
       LIMIT 1`,
      [producto_id]
    );
    const producto = normalizeQueryResult(pRes)?.[0];
    if (!producto) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });

    const baseRes: any = await sql.query(
      `SELECT producto_id, tipo_base, insumo_id, item_id, presentacion_preferida
       FROM app.producto_base
       WHERE producto_id=$1
       LIMIT 1`,
      [producto_id]
    );
    const base = normalizeQueryResult(baseRes)?.[0] ?? null;

    const formRes: any = await sql.query(
      `SELECT producto_id, rendimiento_total_g, densidad_formula_g_ml, notas, created_at, updated_at
       FROM app.producto_formula
       WHERE producto_id=$1
       LIMIT 1`,
      [producto_id]
    );
    const formula = normalizeQueryResult(formRes)?.[0] ?? null;

    const lineas = formula
      ? normalizeQueryResult(
          await sql.query(
            `SELECT linea_id, producto_id, insumo_id, pct_peso, orden
             FROM app.producto_formula_linea
             WHERE producto_id=$1
             ORDER BY orden ASC, linea_id ASC`,
            [producto_id]
          )
        )
      : [];

    return NextResponse.json({ ok: true, producto, base, formula, lineas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { producto_id: string } }) {
  try {
    const sql = db();
    const producto_id = Number(ctx.params.producto_id);
    if (!Number.isFinite(producto_id)) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

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
      if (d !== null && (!Number.isFinite(d) || d <= 0)) {
        return NextResponse.json({ ok: false, error: "densidad_producto_g_ml inválida" }, { status: 422 });
      }
      pushSet("densidad_producto_g_ml = ?", d);
    }

    if (!sets.length) return NextResponse.json({ ok: false, error: "sin cambios" }, { status: 400 });
    sets.push("updated_at = now()");

    params.push(producto_id);
    const q = `UPDATE app.producto SET ${sets.join(", ")} WHERE producto_id = $${params.length}`;
    await sql.query(q, params);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, ctx: { params: { producto_id: string } }) {
  try {
    const sql = db();
    const producto_id = Number(ctx.params.producto_id);
    if (!Number.isFinite(producto_id)) {
      return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
    }

    await sql.query(`UPDATE app.producto SET activo=false, updated_at=now() WHERE producto_id=$1`, [producto_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
