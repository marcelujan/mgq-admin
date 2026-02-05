// src/lib/ofertaSnapshots.ts
import { db } from "@/lib/db";

/**
 * Snapshots automáticos de costo:
 * - Producto (bulk formulado): app.item_formulado_snapshot
 * - Oferta (presentación + packaging): app.producto_oferta_costo_snapshot (+_packaging)
 *
 * Nota: este módulo se usa desde routes (App Router). Mantener imports sin depender de "@/lib/api".
 */

export type SnapshotFuente =
  | "FORMULA_V2_SAVE"
  | "FORMULA_LINEA_CREATE"
  | "FORMULA_LINEA_PATCH"
  | "FORMULA_LINEA_DELETE"
  | "COST_OPTION_DENS_PATCH"
  | "PACKAGING_ADD"
  | "PACKAGING_PATCH"
  | "PACKAGING_DELETE"
  | "CRON_DAILY"
  | "MANUAL";

/** Ajustes */
const DEFAULT_LOTE_REF_G = 1000;

function normalizeQueryResult(res: any): any[] {
  // Neon (serverless) devuelve array directamente; otras libs devuelven { rows }.
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Detecta (en runtime) cuál tabla existe para “costo bulk” del producto.
 * Históricamente se usaron nombres distintos; si ninguna existe, devolvemos null.
 *
 * IMPORTANTE: no se puede referenciar una tabla inexistente en SQL estático porque el parser rompe.
 * Por eso se hace detección previa con to_regclass y luego query dinámico.
 */
let _bulkCostoTable: "app.producto_bulk_costo" | "app.producto_costo_bulk" | null | undefined = undefined;

async function getBulkCostoTable(sql: any): Promise<"app.producto_bulk_costo" | "app.producto_costo_bulk" | null> {
  if (_bulkCostoTable !== undefined) return _bulkCostoTable;

  const r = await sql`
    SELECT
      to_regclass('app.producto_bulk_costo') as t1,
      to_regclass('app.producto_costo_bulk') as t2
  `;
  const rows = normalizeQueryResult(r);
  const t1 = rows[0]?.t1 as string | null | undefined;
  const t2 = rows[0]?.t2 as string | null | undefined;

  if (t1) _bulkCostoTable = "app.producto_bulk_costo";
  else if (t2) _bulkCostoTable = "app.producto_costo_bulk";
  else _bulkCostoTable = null;

  return _bulkCostoTable;
}

async function getProductoBulkARSkg(sql: any, producto_id: number): Promise<number | null> {
  const table = await getBulkCostoTable(sql);
  if (!table) return null;

  // Query dinámico (seguro porque el nombre de tabla está whitelisteado)
  const q =
    table === "app.producto_bulk_costo"
      ? sql`SELECT ars_por_kg FROM app.producto_bulk_costo WHERE producto_id = ${producto_id} LIMIT 1`
      : sql`SELECT ars_por_kg FROM app.producto_costo_bulk WHERE producto_id = ${producto_id} LIMIT 1`;

  const r = await q;
  const rows = normalizeQueryResult(r);
  return numOrNull(rows[0]?.ars_por_kg);
}

/** Convierte un costo en ARS/unidad a ARS/g para una línea de fórmula */
function arsPorGramoFromLinea(linea: {
  tipo: "ITEM_PRESENTACION" | "MANUAL_PRESENTACION" | "BULK_PRODUCTO";
  item_presentacion: number | null;
  job_price_ars: number | null;
  manual_uom: "GR" | "ML" | "UN" | null;
  manual_cantidad: number | null;
  manual_costo_ars: number | null;
  densidad_g_ml: number | null;
  bulk_ars_por_kg: number | null;
}): { ok: true; arsPorG: number } | { ok: false; err: string } {
  if (linea.tipo === "ITEM_PRESENTACION") {
    const ars = numOrNull(linea.job_price_ars);
    const pres = numOrNull(linea.item_presentacion);
    if (ars === null) return { ok: false, err: "item: falta job_price_ars" };
    if (!pres || pres <= 0) return { ok: false, err: "item: presentación inválida" };
    return { ok: true, arsPorG: ars / pres };
  }

  if (linea.tipo === "MANUAL_PRESENTACION") {
    const ars = numOrNull(linea.manual_costo_ars);
    const u = linea.manual_uom ?? null;
    const qty = numOrNull(linea.manual_cantidad);
    if (ars === null) return { ok: false, err: "manual: falta costo" };
    if (!u) return { ok: false, err: "manual: falta uom" };
    if (!qty || qty <= 0) return { ok: false, err: "manual: cantidad inválida" };

    if (u === "GR") return { ok: true, arsPorG: ars / qty };

    if (u === "ML") {
      const dens = numOrNull(linea.densidad_g_ml);
      if (!dens || dens <= 0) return { ok: false, err: "manual: falta densidad para ML→GR" };
      const gramos = qty * dens;
      if (gramos <= 0) return { ok: false, err: "manual: conversión inválida" };
      return { ok: true, arsPorG: ars / gramos };
    }

    return { ok: false, err: "manual: UN no convertible a gramos" };
  }

  if (linea.tipo === "BULK_PRODUCTO") {
    const arsKg = numOrNull(linea.bulk_ars_por_kg);
    if (arsKg === null) return { ok: false, err: "bulk: falta ars_por_kg" };
    return { ok: true, arsPorG: arsKg / 1000 };
  }

  return { ok: false, err: "tipo no soportado" };
}

export async function recalcAndInsertSnapshotsForProducto(args: {
  producto_id: number;
  fuente: SnapshotFuente;
  origin?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sql = db();

  try {
    const producto_id = Number(args.producto_id);
    if (!Number.isFinite(producto_id)) throw new Error("producto_id inválido");

    // 1) Obtener item_formulado_id para el producto (si existe)
    const rItem = await sql`
      SELECT item_formulado_id
      FROM app.item_formulado
      WHERE producto_id = ${producto_id}
      LIMIT 1
    `;
    const itemRows = normalizeQueryResult(rItem);
    const item_formulado_id = numOrNull(itemRows[0]?.item_formulado_id);
    if (!item_formulado_id) {
      // no existe item formulado aún; no es error
      return { ok: true };
    }

    // 2) Recalcular precio unitario ARS/kg (con prod) a nivel producto.
    // Preferimos: tabla de costo bulk (si existe). Si no existe, intentamos calcular desde fórmula v2.
    let precio_unitario_ars: number | null = await getProductoBulkARSkg(sql, producto_id);

    if (precio_unitario_ars === null) {
      // fallback: calcular desde fórmula v2 + costos prod
      const rHeader = await sql`
        SELECT lote_ref_g
        FROM app.formula_v2
        WHERE producto_id = ${producto_id}
        LIMIT 1
      `;
      const header = normalizeQueryResult(rHeader)[0] || {};
      const loteRefG = clamp(numOrNull(header.lote_ref_g) ?? DEFAULT_LOTE_REF_G, 1, 1_000_000);

      const rCp = await sql`
        SELECT lote_ref_kg, costo_fijo_por_lote_ars, costo_variable_por_kg_ars
        FROM app.costos_produccion
        WHERE producto_id = ${producto_id}
        LIMIT 1
      `;
      const cp = normalizeQueryResult(rCp)[0] || {};
      const lote_ref_kg = numOrNull(cp.lote_ref_kg);
      const fijo = numOrNull(cp.costo_fijo_por_lote_ars);
      const variable = numOrNull(cp.costo_variable_por_kg_ars);
      const prodARSporKg = lote_ref_kg && fijo !== null ? fijo / lote_ref_kg + (variable ?? 0) : variable ?? 0;

      const rLineas = await sql`
        SELECT
          l.linea_id,
          l.cost_option_id,
          l.pct_peso,
          l.is_csp,
          co.tipo,
          l.item_presentacion,
          l.job_price_ars,
          l.manual_uom,
          l.manual_cantidad,
          l.manual_costo_ars,
          l.densidad_g_ml,
          l.bulk_producto_id
        FROM app.formula_v2_linea l
        JOIN app.cost_option co ON co.cost_option_id = l.cost_option_id
        WHERE l.producto_id = ${producto_id}
        ORDER BY l.orden ASC, l.linea_id ASC
      `;
      const lineas = normalizeQueryResult(rLineas);

      // Pre-cargar costos ARS/kg para bulks referenciados
      const bulkIds = Array.from(
        new Set(
          lineas
            .filter((x: any) => x.tipo === "BULK_PRODUCTO" && numOrNull(x.bulk_producto_id))
            .map((x: any) => Number(x.bulk_producto_id))
            .filter((x: any) => Number.isFinite(x))
        )
      ) as number[];

      const bulkCost: Record<number, number> = {};
      for (const bid of bulkIds) {
        const arsKg = await getProductoBulkARSkg(sql, bid);
        if (arsKg !== null) bulkCost[bid] = arsKg;
      }

      // Calcular pct CSP (una sola línea marcada) tal como UI
      const cspLinea = lineas.find((x: any) => !!x.is_csp);
      const pctFijos = lineas
        .filter((x: any) => !x.is_csp)
        .reduce((acc: number, x: any) => acc + (numOrNull(x.pct_peso) ?? 0), 0);
      const pctCsp = cspLinea ? 100 - pctFijos : null;

      let totalARS = 0;
      for (const l of lineas) {
        const pct = l.is_csp ? pctCsp : numOrNull(l.pct_peso);
        if (pct === null) continue;

        const masa_g = (loteRefG * pct) / 100;

        const tipo = l.tipo as any;
        const arsG = arsPorGramoFromLinea({
          tipo,
          item_presentacion: numOrNull(l.item_presentacion),
          job_price_ars: numOrNull(l.job_price_ars),
          manual_uom: l.manual_uom ?? null,
          manual_cantidad: numOrNull(l.manual_cantidad),
          manual_costo_ars: numOrNull(l.manual_costo_ars),
          densidad_g_ml: numOrNull(l.densidad_g_ml),
          bulk_ars_por_kg: tipo === "BULK_PRODUCTO" ? bulkCost[Number(l.bulk_producto_id)] ?? null : null,
        });

        if (!arsG.ok) continue;
        totalARS += masa_g * arsG.arsPorG;
      }

      const arsPorKgSinProd = loteRefG > 0 ? (totalARS / loteRefG) * 1000 : null;
      precio_unitario_ars = arsPorKgSinProd !== null ? arsPorKgSinProd + (prodARSporKg ?? 0) : null;
    }

    if (precio_unitario_ars === null) {
      // no hay manera de calcular: igual no rompemos
      return { ok: true };
    }

    await sql`
      INSERT INTO app.item_formulado_snapshot (item_formulado_id, precio_unitario_ars, fuente)
      VALUES (${item_formulado_id}, ${precio_unitario_ars}, ${args.fuente})
    `;

    // 3) Recalcular snapshots por oferta del producto (si existen ofertas)
    await recalcAndInsertOfertaSnapshotsForProducto({ producto_id, fuente: args.fuente, origin: args.origin });

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "error" };
  }
}

async function recalcAndInsertOfertaSnapshotsForProducto(args: {
  producto_id: number;
  fuente: SnapshotFuente;
  origin?: string;
}): Promise<void> {
  const sql = db();
  const producto_id = Number(args.producto_id);

  // Obtener precio unitario actual del item_formulado (último snapshot) para usarlo como bulk_ars_kg_con_prod
  const rItem = await sql`
    SELECT i.item_formulado_id
    FROM app.item_formulado i
    WHERE i.producto_id = ${producto_id}
    LIMIT 1
  `;
  const item_formulado_id = numOrNull(normalizeQueryResult(rItem)[0]?.item_formulado_id);
  if (!item_formulado_id) return;

  const rLast = await sql`
    SELECT s.precio_unitario_ars
    FROM app.item_formulado_snapshot s
    WHERE s.item_formulado_id = ${item_formulado_id}
    ORDER BY s.created_at DESC
    LIMIT 1
  `;
  const bulk_ars_kg_con_prod = numOrNull(normalizeQueryResult(rLast)[0]?.precio_unitario_ars);

  // Densidad producto para convertir ML→G cuando la oferta está cargada por volumen
  const rProd = await sql`
    SELECT densidad_producto_g_ml
    FROM app.producto
    WHERE producto_id = ${producto_id}
    LIMIT 1
  `;
  const densidad_producto_g_ml = numOrNull(normalizeQueryResult(rProd)[0]?.densidad_producto_g_ml);

  const rOf = await sql`
    SELECT
      oferta_id,
      nombre,
      densidad_override_g_ml,
      peso_neto_g,
      volumen_neto_ml,
      unidades_pack,
      masa_por_unidad_g,
      volumen_por_unidad_ml
    FROM app.oferta
    WHERE producto_id = ${producto_id}
  `;
  const ofertas = normalizeQueryResult(rOf);

  for (const o of ofertas) {
    const oferta_id = Number(o.oferta_id);
    if (!Number.isFinite(oferta_id)) continue;

    const dens = numOrNull(o.densidad_override_g_ml) ?? densidad_producto_g_ml;

    const peso_neto_g = numOrNull(o.peso_neto_g);
    const volumen_neto_ml = numOrNull(o.volumen_neto_ml);
    const unidades_pack = numOrNull(o.unidades_pack);
    const masa_por_unidad_g = numOrNull(o.masa_por_unidad_g);
    const volumen_por_unidad_ml = numOrNull(o.volumen_por_unidad_ml);

    let masa_total_g: number | null = null;
    let volumen_total_ml: number | null = null;

    if (peso_neto_g !== null && peso_neto_g > 0) {
      masa_total_g = peso_neto_g;
    } else if (volumen_neto_ml !== null && volumen_neto_ml > 0) {
      volumen_total_ml = volumen_neto_ml;
      if (dens !== null && dens > 0) masa_total_g = volumen_total_ml * dens;
    } else if (unidades_pack !== null && unidades_pack > 0 && masa_por_unidad_g !== null && masa_por_unidad_g > 0) {
      masa_total_g = unidades_pack * masa_por_unidad_g;
    } else if (
      unidades_pack !== null &&
      unidades_pack > 0 &&
      volumen_por_unidad_ml !== null &&
      volumen_por_unidad_ml > 0
    ) {
      volumen_total_ml = unidades_pack * volumen_por_unidad_ml;
      if (dens !== null && dens > 0) masa_total_g = volumen_total_ml * dens;
    }

    // Packaging subtotal
    const rPack = await sql`
      SELECT
        op.oferta_packaging_id,
        op.cantidad,
        op.costo_unitario_override_ars,
        pi.costo_unitario_ars
      FROM app.oferta_packaging op
      JOIN app.packaging_item pi ON pi.packaging_item_id = op.packaging_item_id
      WHERE op.oferta_id = ${oferta_id}
    `;
    const packRows = normalizeQueryResult(rPack);

    const packaging_subtotal_ars = packRows.reduce((acc: number, r: any) => {
      const qty = numOrNull(r.cantidad) ?? 0;
      const unit = numOrNull(r.costo_unitario_override_ars) ?? numOrNull(r.costo_unitario_ars) ?? 0;
      return acc + qty * unit;
    }, 0);

    const costo_base_ars =
      bulk_ars_kg_con_prod !== null && masa_total_g !== null ? (bulk_ars_kg_con_prod * masa_total_g) / 1000 : null;

    const total_ars = costo_base_ars === null ? null : costo_base_ars + packaging_subtotal_ars;

    const rSnap = await sql`
      INSERT INTO app.producto_oferta_costo_snapshot (
        oferta_id,
        bulk_ars_kg_con_prod,
        masa_total_g,
        volumen_total_ml,
        densidad_usada_g_ml,
        costo_base_ars,
        packaging_subtotal_ars,
        total_ars,
        fuente,
        origin
      )
      VALUES (
        ${oferta_id},
        ${bulk_ars_kg_con_prod},
        ${masa_total_g},
        ${volumen_total_ml},
        ${dens},
        ${costo_base_ars},
        ${packaging_subtotal_ars},
        ${total_ars},
        ${args.fuente},
        ${args.origin ?? null}
      )
      RETURNING snapshot_id
    `;
    const snap_id = normalizeQueryResult(rSnap)[0]?.snapshot_id;

    // Detalle packaging por snapshot (opcional)
    if (snap_id && packRows.length) {
      for (const r of packRows) {
        const unit = numOrNull(r.costo_unitario_override_ars) ?? numOrNull(r.costo_unitario_ars) ?? 0;
        await sql`
          INSERT INTO app.producto_oferta_costo_snapshot_packaging (
            snapshot_id,
            oferta_packaging_id,
            cantidad,
            costo_unitario_ars
          )
          VALUES (
            ${snap_id},
            ${Number(r.oferta_packaging_id)},
            ${numOrNull(r.cantidad) ?? 0},
            ${unit}
          )
        `;
      }
    }
  }
}

/** Recalcula e inserta snapshot SOLO para una oferta */
export async function recalcAndInsertOfertaSnapshot(args: {
  oferta_id: number;
  fuente: SnapshotFuente;
  origin?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sql = db();

  try {
    const oferta_id = Number(args.oferta_id);
    if (!Number.isFinite(oferta_id)) throw new Error("oferta_id inválido");

    const r = await sql`
      SELECT producto_id
      FROM app.oferta
      WHERE oferta_id = ${oferta_id}
      LIMIT 1
    `;
    const producto_id = numOrNull(normalizeQueryResult(r)[0]?.producto_id);
    if (!producto_id) throw new Error("oferta sin producto_id");

    // Recalcula por producto (inserta todas las ofertas, incluyendo ésta).
    // MVP: para no duplicar lógica.
    await recalcAndInsertOfertaSnapshotsForProducto({ producto_id, fuente: args.fuente, origin: args.origin });

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "error" };
  }
}

/**
 * Compatibilidad: algunos routes importan createAutoOfertaCostoSnapshot.
 * Lo mantenemos como alias de recalcAndInsertOfertaSnapshot.
 */
export async function createAutoOfertaCostoSnapshot(args: { oferta_id: number; fuente: SnapshotFuente; origin?: string }) {
  return recalcAndInsertOfertaSnapshot(args);
}