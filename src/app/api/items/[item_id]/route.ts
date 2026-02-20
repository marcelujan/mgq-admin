import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type ParsedKey =
  | { kind: "PROVEEDOR"; item_id: number; item_key: string }
  | { kind: "FORMULADO_PRODUCTO"; producto_id: number; item_key: string }
  | { kind: "MANUAL_COST_OPTION"; cost_option_id: number; item_key: string };

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

function parseItemKey(raw: string): ParsedKey | null {
  const s = decodeRepeated(String(raw ?? "").trim());

  if (/^\d+$/.test(s)) {
    const id = Number(s);
    if (id > 0) return { kind: "PROVEEDOR", item_id: id, item_key: `p:${id}` };
  }

  const mp = s.match(/^p:(\d+)$/i);
  if (mp) return { kind: "PROVEEDOR", item_id: Number(mp[1]), item_key: `p:${mp[1]}` };

  const mf = s.match(/^fprod:(\d+)$/i);
  if (mf) return { kind: "FORMULADO_PRODUCTO", producto_id: Number(mf[1]), item_key: `fprod:${mf[1]}` };

  const mm = s.match(/^mopt:(\d+)$/i);
  if (mm) return { kind: "MANUAL_COST_OPTION", cost_option_id: Number(mm[1]), item_key: `mopt:${mm[1]}` };

  return null;
}

/**
 * DELETE /api/items/:item_key
 *
 * item_key esperado:
 * - p:<item_id> (PROVEEDOR)
 * - fprod:<producto_id> (FORMULADO)
 * - mopt:<cost_option_id> (MANUAL)
 *
 * Semántica:
 * - PROVEEDOR: borrado físico del item y sus dependencias operativas (offers, jobs, etc).
 * - FORMULADO: desactivación (producto.activo=false y item_formulado.activo=false).
 * - MANUAL: desactivación (cost_option.activo=false).
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ item_id: string }> }) {
  const { item_id } = await ctx.params;
  const parsed = parseItemKey(item_id);

  if (!parsed) {
    return NextResponse.json({ ok: false, error: "invalid_item_key", raw: item_id }, { status: 400 });
  }

  const sql = db();

  try {
    await sql.query("BEGIN");

    if (parsed.kind === "PROVEEDOR") {
      const id = parsed.item_id;

      // pricing runs (dependen de offers)
      await sql.query(
        `
        delete from app.pricing_daily_run_items pri
        using app.offers o
        where pri.offer_id = o.offer_id
          and o.item_id = $1
        `,
        [id]
      );

      await sql.query(`delete from app.offers where item_id = $1`, [id]);
      await sql.query(`delete from app.oferta_proveedor where item_id = $1`, [id]);
      await sql.query(`delete from app.insumo_fuente where item_id = $1`, [id]);
      await sql.query(`delete from app.item_price_daily_pres where item_id = $1`, [id]);
      await sql.query(`delete from app.item_price_daily where item_id = $1`, [id]);
      await sql.query(`delete from app.job where item_id = $1`, [id]);
      await sql.query(`delete from app.item_seguimiento where item_id = $1`, [id]);

      await sql.query("COMMIT");
      return NextResponse.json({ ok: true, kind: "PROVEEDOR", deleted: { item_id: id } });
    }

    if (parsed.kind === "FORMULADO_PRODUCTO") {
      const producto_id = parsed.producto_id;

      await sql.query(
        `update app.producto set activo=false, updated_at=now() where producto_id=$1`,
        [producto_id]
      );
      await sql.query(
        `update app.item_formulado set activo=false, updated_at=now() where producto_id=$1`,
        [producto_id]
      );

      await sql.query("COMMIT");
      return NextResponse.json({ ok: true, kind: "FORMULADO", deleted: { producto_id } });
    }

    // MANUAL_COST_OPTION
    const cost_option_id = parsed.cost_option_id;

    await sql.query(
      `update app.cost_option set activo=false, updated_at=now() where cost_option_id=$1`,
      [cost_option_id]
    );

    await sql.query("COMMIT");
    return NextResponse.json({ ok: true, kind: "MANUAL", deleted: { cost_option_id } });
  } catch (e: any) {
    try {
      await sql.query("ROLLBACK");
    } catch {
      // ignore
    }
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
