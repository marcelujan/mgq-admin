import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ producto_id: string; linea_id: string }> }
) {
  try {
    const { producto_id: productoIdStr, linea_id: lineaIdStr } = await ctx.params;

    const sql = db();
    const producto_id = Number(productoIdStr);
    const linea_id = Number(lineaIdStr);

    if (!Number.isFinite(producto_id) || !Number.isFinite(linea_id)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const sets: string[] = [];
    const params: any[] = [];

    const pushSet = (frag: string, v: any) => {
      params.push(v);
      sets.push(frag.replace("?", `$${params.length}`));
    };

    if (body?.pct_peso !== undefined) {
      const p = Number(body.pct_peso);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        return NextResponse.json({ ok: false, error: "pct_peso inválido" }, { status: 422 });
      }
      pushSet("pct_peso = ?", p);
    }

    if (body?.orden !== undefined) {
      const o = Number(body.orden);
      if (!Number.isFinite(o)) {
        return NextResponse.json({ ok: false, error: "orden inválido" }, { status: 422 });
      }
      pushSet("orden = ?", o);
    }

    if (body?.insumo_id !== undefined) {
      const insumo_id = Number(body.insumo_id);
      if (!Number.isFinite(insumo_id) || insumo_id <= 0) {
        return NextResponse.json({ ok: false, error: "insumo_id inválido" }, { status: 422 });
      }

      // Validar que el insumo exista y no sea UN para PCT_WW
      const t: any = await sql.query(`SELECT tipo_uom FROM app.insumo WHERE insumo_id=$1 LIMIT 1`, [insumo_id]);
      const row = normalizeQueryResult(t)[0];
      const tipo_uom = row?.tipo_uom ? String(row.tipo_uom).toUpperCase() : null;

      if (!tipo_uom) return NextResponse.json({ ok: false, error: "insumo no existe" }, { status: 422 });
      if (tipo_uom === "UN") {
        return NextResponse.json({ ok: false, error: "Insumo UN no puede estar en % p/p" }, { status: 422 });
      }

      pushSet("insumo_id = ?", insumo_id);
    }

    if (!sets.length) return NextResponse.json({ ok: false, error: "sin cambios" }, { status: 400 });

    params.push(producto_id);
    params.push(linea_id);

    const q =
      `UPDATE app.producto_formula_linea SET ${sets.join(", ")} ` +
      `WHERE producto_id=$${params.length - 1} AND linea_id=$${params.length}`;

    await sql.query(q, params);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(
  _: NextRequest,
  ctx: { params: Promise<{ producto_id: string; linea_id: string }> }
) {
  try {
    const { producto_id: productoIdStr, linea_id: lineaIdStr } = await ctx.params;

    const sql = db();
    const producto_id = Number(productoIdStr);
    const linea_id = Number(lineaIdStr);

    if (!Number.isFinite(producto_id) || !Number.isFinite(linea_id)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }

    await sql.query(`DELETE FROM app.producto_formula_linea WHERE producto_id=$1 AND linea_id=$2`, [
      producto_id,
      linea_id,
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
