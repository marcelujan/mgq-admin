import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function decodeRepeated(s: string, maxRounds = 3): string {
  let out = String(s ?? "");
  for (let i = 0; i < maxRounds; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

type ParsedKey =
  | { kind: "FORMULADO_PRODUCTO"; producto_id: number; item_key: string }
  | { kind: "OTHER"; item_key: string };

function parseItemKey(raw: string): ParsedKey | null {
  const s = decodeRepeated(String(raw ?? "").trim());

  const mfp = s.match(/^fprod:(\d+)$/i);
  if (mfp) {
    const producto_id = Number(mfp[1]);
    if (Number.isFinite(producto_id) && producto_id > 0) {
      return { kind: "FORMULADO_PRODUCTO", producto_id, item_key: `fprod:${producto_id}` };
    }
    return null;
  }

  // No habilitamos hard-delete para otros tipos en este patch.
  if (s) return { kind: "OTHER", item_key: s };
  return null;
}

/**
 * DELETE /api/items/[item_id]
 *
 * Hard-delete exclusivo para FORMULADO (fprod:<producto_id>):
 * - Elimina historial y registros asociados del producto y su formulación.
 *
 * Nota: esto borra snapshots históricos (item_formulado_snapshot) y elimina el producto.
 */
export async function DELETE(req: NextRequest, ctx: { params: { item_id: string } }) {
  try {
    const raw = ctx?.params?.item_id ?? "";
    const parsed = parseItemKey(raw);

    if (!parsed) {
      return NextResponse.json({ ok: false, error: "item_id inválido" }, { status: 400 });
    }

    if (parsed.kind !== "FORMULADO_PRODUCTO") {
      return NextResponse.json(
        {
          ok: false,
          error: "Hard-delete solo habilitado para FORMULADO (fprod:<producto_id>) en esta versión.",
        },
        { status: 400 }
      );
    }

    const sql = db();
    const producto_id = parsed.producto_id;

    // 1) oferta_ids del producto (para limpiar insumo_fuente y item_formulado por oferta)
    const ofertaIdsRes: any = await sql.query(
      `
      select oferta_id
      from app.producto_oferta
      where producto_id = $1::bigint
      `,
      [producto_id]
    );
    const ofertaIds: number[] = Array.isArray(ofertaIdsRes?.rows)
      ? ofertaIdsRes.rows.map((r: any) => Number(r.oferta_id)).filter((n: any) => Number.isFinite(n))
      : [];

    // 2) item_formulado_ids del producto (para snapshots)
    const itemFormRes: any = await sql.query(
      `
      select item_formulado_id
      from app.item_formulado
      where producto_id = $1::int
      `,
      [producto_id]
    );
    const itemFormIds: number[] = Array.isArray(itemFormRes?.rows)
      ? itemFormRes.rows.map((r: any) => Number(r.item_formulado_id)).filter((n: any) => Number.isFinite(n))
      : [];

    // --- Deletes en orden de dependencias (sin transacción en esta base codebase) ---

    // insumo_fuente por oferta_id
    if (ofertaIds.length) {
      await sql.query(`delete from app.insumo_fuente where oferta_id = any($1::bigint[])`, [ofertaIds]);
    }

    // snapshots de item_formulado
    if (itemFormIds.length) {
      await sql.query(`delete from app.item_formulado_snapshot where item_formulado_id = any($1::int[])`, [itemFormIds]);
    }

    // item_formulado
    await sql.query(`delete from app.item_formulado where producto_id = $1::int`, [producto_id]);

    // fórmula v2
    await sql.query(`delete from app.producto_formula_linea_v2 where producto_id = $1::bigint`, [producto_id]);
    await sql.query(`delete from app.producto_formula_v2 where producto_id = $1::bigint`, [producto_id]);

    // fórmula legacy
    await sql.query(`delete from app.producto_formula_linea where producto_id = $1::bigint`, [producto_id]);
    await sql.query(`delete from app.producto_formula where producto_id = $1::bigint`, [producto_id]);

    // costos/relaciones del producto
    await sql.query(`delete from app.producto_costos_produccion where producto_id = $1::bigint`, [producto_id]);
    await sql.query(`delete from app.producto_base where producto_id = $1::bigint`, [producto_id]);

    // ofertas del producto
    await sql.query(`delete from app.producto_oferta where producto_id = $1::bigint`, [producto_id]);

    // producto
    const delProd: any = await sql.query(`delete from app.producto where producto_id = $1::bigint`, [producto_id]);

    return NextResponse.json({
      ok: true,
      deleted: {
        producto_id,
        oferta_ids: ofertaIds.length,
        item_formulado_ids: itemFormIds.length,
        producto_rows: delProd?.rowCount ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
