import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

/**
 * DELETE /api/items/[item_id]
 *
 * item_id es el item_key unificado:
 * - p:<item_id>          (PROVEEDOR)
 * - fprod:<producto_id>  (FORMULADO)
 * - mopt:<cost_option_id>(MANUAL)
 *
 * Semántica: hard-delete (incluye historial/snapshots) para el entity subyacente.
 * Nota: esta operación es destructiva.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ item_id: string }> }) {
  const sql = db();
  try {
    const { item_id } = await ctx.params;
    const rawKey = decodeURIComponent(item_id ?? "").trim();
    if (!rawKey) return jsonError(400, "missing_item_id");

    // force=1 permite borrar aunque haya dependencias de fórmula/base.
    const { searchParams } = new URL(req.url);
    const force = (searchParams.get("force") ?? "").trim() === "1";

    const [prefix, idPart] = rawKey.split(":");
    if (!prefix || !idPart) return jsonError(400, "invalid_item_key", { item_key: rawKey });

    if (prefix === "fprod") {
      const productoId = Number(idPart);
      if (!Number.isFinite(productoId) || productoId <= 0) return jsonError(400, "invalid_producto_id", { item_key: rawKey });

      await sql.query("begin");

      // 1) snapshots -> item_formulado (join por item_formulado_id)
      const rSnap: any = await sql.query(
        `
        delete from app.item_formulado_snapshot s
        using app.item_formulado f
        where s.item_formulado_id = f.item_formulado_id
          and f.producto_id = $1
        returning 1
        `,
        [productoId]
      );

      // 2) item_formulado
      const rItemForm: any = await sql.query(
        `delete from app.item_formulado where producto_id = $1 returning 1`,
        [productoId]
      );

      // 3) fórmulas v2
      const rLineaV2: any = await sql.query(
        `delete from app.producto_formula_linea_v2 where producto_id = $1 returning 1`,
        [productoId]
      );
      const rHeadV2: any = await sql.query(
        `delete from app.producto_formula_v2 where producto_id = $1 returning 1`,
        [productoId]
      );

      // 4) legacy (por si existiera)
      const rLineaLegacy: any = await sql.query(
        `delete from app.producto_formula_linea where producto_id = $1 returning 1`,
        [productoId]
      );
      const rHeadLegacy: any = await sql.query(
        `delete from app.producto_formula where producto_id = $1 returning 1`,
        [productoId]
      );

      // 5) dependencias directas
      const rCostosProd: any = await sql.query(
        `delete from app.producto_costos_produccion where producto_id = $1 returning 1`,
        [productoId]
      );

      // Nota: producto_oferta/producto_base están presentes en schema pero pueden ser 0 filas.
      // Se borran antes de producto para evitar FK.
      const rProdOferta: any = await sql.query(
        `delete from app.producto_oferta where producto_id = $1 returning 1`,
        [productoId]
      );

      const rProdBase: any = await sql.query(
        `delete from app.producto_base where producto_id = $1 returning 1`,
        [productoId]
      );

      // 6) producto
      const rProd: any = await sql.query(
        `delete from app.producto where producto_id = $1 returning producto_id`,
        [productoId]
      );

      await sql.query("commit");

      const deletedProducto = Array.isArray(rProd?.rows) && rProd.rows.length > 0;

      return NextResponse.json({
        ok: true,
        kind: "FORMULADO",
        item_key: rawKey,
        deleted: {
          producto: deletedProducto ? 1 : 0,
          item_formulado_snapshot: Array.isArray(rSnap?.rows) ? rSnap.rows.length : 0,
          item_formulado: Array.isArray(rItemForm?.rows) ? rItemForm.rows.length : 0,
          producto_formula_linea_v2: Array.isArray(rLineaV2?.rows) ? rLineaV2.rows.length : 0,
          producto_formula_v2: Array.isArray(rHeadV2?.rows) ? rHeadV2.rows.length : 0,
          producto_formula_linea: Array.isArray(rLineaLegacy?.rows) ? rLineaLegacy.rows.length : 0,
          producto_formula: Array.isArray(rHeadLegacy?.rows) ? rHeadLegacy.rows.length : 0,
          producto_costos_produccion: Array.isArray(rCostosProd?.rows) ? rCostosProd.rows.length : 0,
          producto_oferta: Array.isArray(rProdOferta?.rows) ? rProdOferta.rows.length : 0,
          producto_base: Array.isArray(rProdBase?.rows) ? rProdBase.rows.length : 0,
        },
      });
    }

    if (prefix === "p") {
      const itemId = Number(idPart);
      if (!Number.isFinite(itemId) || itemId <= 0) return jsonError(400, "invalid_provider_item_id", { item_key: rawKey });

      const depRes: any = await sql.query(
        `
        with co as (
          select cost_option_id
          from app.cost_option
          where tipo = 'ITEM_PRESENTACION' and item_id = $1
        )
        select
          (select count(*)::int from app.cost_option where tipo = 'ITEM_PRESENTACION' and item_id = $1) as cost_option_count,
          (select count(*)::int from app.producto_formula_linea_v2 where cost_option_id in (select cost_option_id from co)) as formula_lineas_v2_count,
          (select count(*)::int from app.producto_base where item_id = $1) as producto_base_count
        `,
        [itemId]
      );
      const deps = Array.isArray(depRes?.rows) && depRes.rows.length ? depRes.rows[0] : {};
      const costOptionCount = Number(deps?.cost_option_count ?? 0);
      const formulaLineasV2Count = Number(deps?.formula_lineas_v2_count ?? 0);
      const productoBaseCount = Number(deps?.producto_base_count ?? 0);

      if (!force && (formulaLineasV2Count > 0 || productoBaseCount > 0)) {
        return jsonError(409, "provider_item_in_use", {
          item_key: rawKey,
          item_id: itemId,
          cost_option_count: costOptionCount,
          formula_lineas_v2_count: formulaLineasV2Count,
          producto_base_count: productoBaseCount,
        });
      }

      await sql.query("begin");

      const rRunItems: any = await sql.query(
        `delete from app.pricing_daily_run_items where offer_id in (select offer_id from app.offers where item_id = $1) returning 1`,
        [itemId]
      );
      const rOfferDaily: any = await sql.query(
        `delete from app.offer_prices_daily where offer_id in (select offer_id from app.offers where item_id = $1) returning 1`,
        [itemId]
      );
      const rOffers: any = await sql.query(
        `delete from app.offers where item_id = $1 returning 1`,
        [itemId]
      );
      const rItemPriceDaily: any = await sql.query(
        `delete from app.item_price_daily_pres where item_id = $1 returning 1`,
        [itemId]
      );
      const rOfertaProv: any = await sql.query(
        `delete from app.oferta_proveedor where item_id = $1 returning 1`,
        [itemId]
      );
      const rJobResult: any = await sql.query(
        `delete from app.job_result where job_id in (select job_id from app.job where item_id = $1) returning 1`,
        [itemId]
      );
      const rJob: any = await sql.query(
        `delete from app.job where item_id = $1 returning 1`,
        [itemId]
      );
      const rCostSnap: any = await sql.query(
        `delete from app.cost_option_snapshot where cost_option_id in (select cost_option_id from app.cost_option where tipo = 'ITEM_PRESENTACION' and item_id = $1) returning 1`,
        [itemId]
      );
      const rCostOption: any = await sql.query(
        `delete from app.cost_option where tipo = 'ITEM_PRESENTACION' and item_id = $1 returning 1`,
        [itemId]
      );
      const rProvider: any = await sql.query(
        `delete from app.item_seguimiento where item_id = $1 returning item_id`,
        [itemId]
      );

      await sql.query("commit");

      const deletedProvider = Array.isArray(rProvider?.rows) && rProvider.rows.length > 0;
      return NextResponse.json({
        ok: true,
        kind: "PROVEEDOR",
        item_key: rawKey,
        deleted: {
          item_seguimiento: deletedProvider ? 1 : 0,
          offers: Array.isArray(rOffers?.rows) ? rOffers.rows.length : 0,
          pricing_daily_run_items: Array.isArray(rRunItems?.rows) ? rRunItems.rows.length : 0,
          offer_prices_daily: Array.isArray(rOfferDaily?.rows) ? rOfferDaily.rows.length : 0,
          item_price_daily_pres: Array.isArray(rItemPriceDaily?.rows) ? rItemPriceDaily.rows.length : 0,
          oferta_proveedor: Array.isArray(rOfertaProv?.rows) ? rOfertaProv.rows.length : 0,
          job_result: Array.isArray(rJobResult?.rows) ? rJobResult.rows.length : 0,
          job: Array.isArray(rJob?.rows) ? rJob.rows.length : 0,
          cost_option_snapshot: Array.isArray(rCostSnap?.rows) ? rCostSnap.rows.length : 0,
          cost_option: Array.isArray(rCostOption?.rows) ? rCostOption.rows.length : 0,
        },
      });
    }

    if (prefix === "mopt") {
      return jsonError(409, "hard_delete_not_enabled_for_kind", { item_key: rawKey, kind: "MANUAL" });
    }

    return jsonError(400, "unknown_item_key_prefix", { item_key: rawKey });
  } catch (e: any) {
    try {
      const sql = db();
      await sql.query("rollback");
    } catch {}
    const msg = typeof e?.message === "string" ? e.message : String(e);
    return jsonError(500, "delete_failed", { message: msg });
  }
}
