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
export async function DELETE(req: NextRequest, ctx: { params: { item_id: string } }) {
  const sql = db();
  try {
    const rawKey = decodeURIComponent(ctx.params.item_id ?? "").trim();
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
