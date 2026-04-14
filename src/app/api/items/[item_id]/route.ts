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

      // 0) referencias externas: si este formulado se usa como BULK_PRODUCTO en otras fórmulas,
      // borrar también el cost_option y sus líneas para evitar residuos/roturas posteriores.
      const rBulkFormulaLineaRefs: any = await sql.query(
        `
        delete from app.producto_formula_linea_v2 l
        using app.cost_option co
        where l.cost_option_id = co.cost_option_id
          and co.tipo = 'BULK_PRODUCTO'
          and co.bulk_producto_id = $1
        returning 1
        `,
        [productoId]
      );

      const rBulkCostOptionSnapshots: any = await sql.query(
        `
        delete from app.cost_option_snapshot s
        using app.cost_option co
        where s.cost_option_id = co.cost_option_id
          and co.tipo = 'BULK_PRODUCTO'
          and co.bulk_producto_id = $1
        returning 1
        `,
        [productoId]
      );

      const rBulkCostOptions: any = await sql.query(
        `
        delete from app.cost_option
        where tipo = 'BULK_PRODUCTO'
          and bulk_producto_id = $1
        returning 1
        `,
        [productoId]
      );

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

      // 3) fórmulas v2 propias del producto
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

      // 6) tablas hijas de producto_oferta
      const rProdOfertaSnapPackaging: any = await sql.query(
        `
        delete from app.producto_oferta_costo_snapshot_packaging p
        using app.producto_oferta_costo_snapshot s, app.producto_oferta o
        where p.snapshot_id = s.snapshot_id
          and s.oferta_id = o.oferta_id
          and o.producto_id = $1
        returning 1
        `,
        [productoId]
      );

      const rProdOfertaSnapshots: any = await sql.query(
        `
        delete from app.producto_oferta_costo_snapshot s
        using app.producto_oferta o
        where s.oferta_id = o.oferta_id
          and o.producto_id = $1
        returning 1
        `,
        [productoId]
      );

      const rProdOfertaExtras: any = await sql.query(
        `
        delete from app.producto_oferta_extra e
        using app.producto_oferta o
        where e.oferta_id = o.oferta_id
          and o.producto_id = $1
        returning 1
        `,
        [productoId]
      );

      const rProdOfertaPackaging: any = await sql.query(
        `
        delete from app.producto_oferta_packaging p
        using app.producto_oferta o
        where p.oferta_id = o.oferta_id
          and o.producto_id = $1
        returning 1
        `,
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

      // 7) producto
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
          bulk_formula_linea_v2_refs: Array.isArray(rBulkFormulaLineaRefs?.rows) ? rBulkFormulaLineaRefs.rows.length : 0,
          bulk_cost_option_snapshot_refs: Array.isArray(rBulkCostOptionSnapshots?.rows) ? rBulkCostOptionSnapshots.rows.length : 0,
          bulk_cost_option_refs: Array.isArray(rBulkCostOptions?.rows) ? rBulkCostOptions.rows.length : 0,
          item_formulado_snapshot: Array.isArray(rSnap?.rows) ? rSnap.rows.length : 0,
          item_formulado: Array.isArray(rItemForm?.rows) ? rItemForm.rows.length : 0,
          producto_formula_linea_v2: Array.isArray(rLineaV2?.rows) ? rLineaV2.rows.length : 0,
          producto_formula_v2: Array.isArray(rHeadV2?.rows) ? rHeadV2.rows.length : 0,
          producto_formula_linea: Array.isArray(rLineaLegacy?.rows) ? rLineaLegacy.rows.length : 0,
          producto_formula: Array.isArray(rHeadLegacy?.rows) ? rHeadLegacy.rows.length : 0,
          producto_costos_produccion: Array.isArray(rCostosProd?.rows) ? rCostosProd.rows.length : 0,
          producto_oferta_costo_snapshot_packaging: Array.isArray(rProdOfertaSnapPackaging?.rows) ? rProdOfertaSnapPackaging.rows.length : 0,
          producto_oferta_costo_snapshot: Array.isArray(rProdOfertaSnapshots?.rows) ? rProdOfertaSnapshots.rows.length : 0,
          producto_oferta_extra: Array.isArray(rProdOfertaExtras?.rows) ? rProdOfertaExtras.rows.length : 0,
          producto_oferta_packaging: Array.isArray(rProdOfertaPackaging?.rows) ? rProdOfertaPackaging.rows.length : 0,
          producto_oferta: Array.isArray(rProdOferta?.rows) ? rProdOferta.rows.length : 0,
          producto_base: Array.isArray(rProdBase?.rows) ? rProdBase.rows.length : 0,
        },
      });
    }

    // Mantener comportamiento previo: no implementamos aquí hard-delete para p:/mopt: en este patch.
    // Si se requiere, se extiende con los mismos guardrails documentados.
    if (prefix === "p" || prefix === "mopt") {
      // En esta versión: avisar explícitamente.
      return jsonError(409, "hard_delete_not_enabled_for_kind", { item_key: rawKey, kind: prefix === "p" ? "PROVEEDOR" : "MANUAL" });
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
