import { db } from "@/lib/db";

/**
 * Fuentes (auditoría) de por qué se recalculó un snapshot.
 * Mantener string-literals para trazabilidad.
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
  | "MANUAL_COST_PATCH"
  | "JOB_PRICE_REFRESH"
  | "CRON_DAILY"
  | "UNKNOWN";

type RecalcProductoArgs = {
  producto_id: number;
  fuente: SnapshotFuente;
  origin?: string; // opcional para evitar romper routes existentes
};

type RecalcOfertaArgs = {
  oferta_id: number;
  fuente: SnapshotFuente;
  origin?: string; // opcional
};

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Devuelve costo unitario ARS por gramo para una línea de fórmula v2.
 * - ITEM_PRESENTACION: ARS / presentacion (g)
 * - MANUAL_PRESENTACION: ARS / (cantidad en GR) o ARS / (cantidad ML * densidad) si ML
 * - BULK_PRODUCTO: ARS/kg / 1000
 */
function arsPorGramoFromLinea(row: any): { ok: true; arsPorG: number } | { ok: false; err: string } {
  const tipo = String(row?.tipo ?? "");
  if (tipo === "ITEM_PRESENTACION") {
    const price = numOrNull(row?.job_price_ars);
    const pres = numOrNull(row?.item_presentacion);
    if (price === null) return { ok: false, err: "item: falta job_price_ars" };
    if (!pres || pres <= 0) return { ok: false, err: "item: presentación inválida" };
    return { ok: true, arsPorG: price / pres };
  }

  if (tipo === "MANUAL_PRESENTACION") {
    const costo = numOrNull(row?.manual_costo_ars);
    const qty = numOrNull(row?.manual_cantidad);
    const uom = row?.manual_uom ? String(row.manual_uom) : null;

    if (costo === null) return { ok: false, err: "manual: falta costo" };
    if (!qty || qty <= 0) return { ok: false, err: "manual: falta cantidad" };
    if (!uom) return { ok: false, err: "manual: falta uom" };

    if (uom === "GR") return { ok: true, arsPorG: costo / qty };

    if (uom === "ML") {
      const dens = numOrNull(row?.densidad_g_ml);
      if (!dens || dens <= 0) return { ok: false, err: "manual: ML requiere densidad_g_ml" };
      const gramos = qty * dens;
      if (!(gramos > 0)) return { ok: false, err: "manual: conversión ML→GR inválida" };
      return { ok: true, arsPorG: costo / gramos };
    }

    return { ok: false, err: "manual: UN no convertible a gramos" };
  }

  if (tipo === "BULK_PRODUCTO") {
    const arsKg = numOrNull(row?.bulk_ars_kg);
    if (arsKg === null) return { ok: false, err: "bulk: falta ars/kg" };
    return { ok: true, arsPorG: arsKg / 1000 };
  }

  return { ok: false, err: "tipo no soportado" };
}

/**
 * Recalcula:
 * - bulk_ars_kg_sin_prod
 * - prod_ars_kg
 * - bulk_ars_kg_con_prod
 * Y crea snapshots para TODAS las ofertas del producto.
 */
export async function recalcAndInsertSnapshotsForProducto(arg: number | RecalcProductoArgs): Promise<void> {
  const producto_id = typeof arg === "number" ? arg : arg.producto_id;
  const fuente: SnapshotFuente = typeof arg === "number" ? "UNKNOWN" : (arg.fuente ?? "UNKNOWN");
  const origin = typeof arg === "number" ? undefined : arg.origin;

  if (!Number.isFinite(producto_id)) return;

  const sql = db();

  // Header: lote_ref_g y costos de producción
  const hdrR: any = await sql.query(
    `
    SELECT
      f.producto_id,
      f.lote_ref_g::float8 as lote_ref_g,
      cp.lote_ref_kg::float8 as lote_ref_kg,
      cp.costo_fijo_por_lote_ars::float8 as costo_fijo_por_lote_ars,
      cp.costo_variable_por_kg_ars::float8 as costo_variable_por_kg_ars
    FROM app.formula_v2 f
    LEFT JOIN app.costos_produccion cp ON cp.producto_id = f.producto_id
    WHERE f.producto_id = $1
    `,
    [producto_id]
  );
  const hdr = normalizeQueryResult(hdrR)[0];
  if (!hdr) return;

  const loteRefG = numOrNull(hdr.lote_ref_g) ?? 1000;

  const lote_ref_kg = numOrNull(hdr.lote_ref_kg);
  const fijo = numOrNull(hdr.costo_fijo_por_lote_ars);
  const variable = numOrNull(hdr.costo_variable_por_kg_ars);

  const prod_ars_kg =
    lote_ref_kg && fijo !== null && fijo !== undefined ? fijo / lote_ref_kg + (variable ?? 0) : variable ?? null;

  // Líneas fórmula v2 + precio job + datos manual + bulk costo
  const lineasR: any = await sql.query(
    `
    SELECT
      l.linea_id,
      l.producto_id,
      l.cost_option_id,
      l.pct_peso::float8 as pct_peso,
      l.is_csp,
      l.orden,

      co.tipo,
      co.item_id,
      co.item_presentacion::float8 as item_presentacion,

      -- job (si existe)
      jip.price_ars::float8 as job_price_ars,
      jip.as_of_date::text as job_as_of_date,

      co.manual_nombre,
      co.manual_uom,
      co.manual_cantidad::float8 as manual_cantidad,
      co.manual_costo_ars::float8 as manual_costo_ars,

      co.bulk_producto_id,

      co.densidad_g_ml::float8 as densidad_g_ml,

      -- bulk costo del producto bulk referenciado (si aplica)
      b.ars_por_kg::float8 as bulk_ars_kg

    FROM app.formula_linea_v2 l
    JOIN app.cost_option co ON co.cost_option_id = l.cost_option_id

    LEFT JOIN app.job_item_presentacion jip
      ON jip.item_id = co.item_id
      AND jip.presentacion = co.item_presentacion

    LEFT JOIN app.producto_bulk_costo b
      ON b.producto_id = co.bulk_producto_id

    WHERE l.producto_id = $1
    ORDER BY l.orden ASC, l.linea_id ASC
    `,
    [producto_id]
  );
  const lineas = normalizeQueryResult(lineasR);

  const cspLinea = lineas.find((x) => !!x.is_csp);
  const pctFijos = lineas.filter((x) => !x.is_csp).reduce((acc, x) => acc + (numOrNull(x.pct_peso) ?? 0), 0);
  const pctCsp = cspLinea ? 100 - pctFijos : null;

  let totalARS = 0;
  for (const l of lineas) {
    const pct = l.is_csp ? pctCsp : numOrNull(l.pct_peso);
    if (pct === null) continue;

    const masa_g = (loteRefG * pct) / 100;
    if (!(masa_g > 0)) continue;

    const arsG = arsPorGramoFromLinea(l);
    if (!arsG.ok) continue;

    totalARS += masa_g * arsG.arsPorG;
  }

  const bulk_ars_kg_sin_prod = loteRefG > 0 ? (totalARS / loteRefG) * 1000 : null;
  const bulk_ars_kg_con_prod =
    bulk_ars_kg_sin_prod !== null ? bulk_ars_kg_sin_prod + (prod_ars_kg ?? 0) : null;

  // Inserta snapshots para todas las ofertas del producto (presentaciones)
  const ofertasR: any = await sql.query(
    `SELECT oferta_id FROM app.oferta WHERE producto_id = $1 ORDER BY oferta_id ASC`,
    [producto_id]
  );
  const ofertas = normalizeQueryResult(ofertasR);

  for (const o of ofertas) {
    const oferta_id = Number(o.oferta_id);
    if (!Number.isFinite(oferta_id)) continue;

    await recalcAndInsertOfertaSnapshot({
      oferta_id,
      fuente,
      origin: origin ?? "recalcAndInsertSnapshotsForProducto",
      // reusa bulk ya calculado (optimización): lo recalculamos adentro igual por simplicidad/robustez.
    });
  }

  // (opcional) si tenés una tabla resumen bulk del producto, podés guardar allí bulk_ars_kg_con_prod.
  // No lo hago acá para no asumir esquema adicional.
}

/**
 * Recalcula costo de UNA oferta y crea 1 fila snapshot.
 */
export async function recalcAndInsertOfertaSnapshot(arg: number | RecalcOfertaArgs): Promise<void> {
  const oferta_id = typeof arg === "number" ? arg : arg.oferta_id;
  const fuente: SnapshotFuente = typeof arg === "number" ? "UNKNOWN" : (arg.fuente ?? "UNKNOWN");
  const origin = typeof arg === "number" ? undefined : arg.origin;

  if (!Number.isFinite(oferta_id)) return;

  const sql = db();

  // Oferta + producto + densidad producto
  const ofertaR: any = await sql.query(
    `
    SELECT
      o.oferta_id,
      o.producto_id,
      o.peso_neto_g::float8 as peso_neto_g,
      o.volumen_neto_ml::float8 as volumen_neto_ml,
      o.unidades_pack::float8 as unidades_pack,
      o.masa_por_unidad_g::float8 as masa_por_unidad_g,
      o.volumen_por_unidad_ml::float8 as volumen_por_unidad_ml,
      o.densidad_override_g_ml::float8 as densidad_override_g_ml,
      p.densidad_producto_g_ml::float8 as densidad_producto_g_ml
    FROM app.oferta o
    JOIN app.producto p ON p.producto_id = o.producto_id
    WHERE o.oferta_id = $1
    `,
    [oferta_id]
  );
  const oferta = normalizeQueryResult(ofertaR)[0];
  if (!oferta) return;

  const producto_id = Number(oferta.producto_id);
  if (!Number.isFinite(producto_id)) return;

  // Bulk ARS/kg con prod (recalcula desde fórmula del producto)
  // Nota: para no duplicar lógica, consulto el “bulk” desde la misma idea que UI.
  // Si preferís performance: cachear en una tabla bulk por producto.
  const hdrR: any = await sql.query(
    `
    SELECT
      f.producto_id,
      f.lote_ref_g::float8 as lote_ref_g,
      cp.lote_ref_kg::float8 as lote_ref_kg,
      cp.costo_fijo_por_lote_ars::float8 as costo_fijo_por_lote_ars,
      cp.costo_variable_por_kg_ars::float8 as costo_variable_por_kg_ars
    FROM app.formula_v2 f
    LEFT JOIN app.costos_produccion cp ON cp.producto_id = f.producto_id
    WHERE f.producto_id = $1
    `,
    [producto_id]
  );
  const hdr = normalizeQueryResult(hdrR)[0];
  if (!hdr) return;

  const loteRefG = numOrNull(hdr.lote_ref_g) ?? 1000;

  const lote_ref_kg = numOrNull(hdr.lote_ref_kg);
  const fijo = numOrNull(hdr.costo_fijo_por_lote_ars);
  const variable = numOrNull(hdr.costo_variable_por_kg_ars);

  const prod_ars_kg =
    lote_ref_kg && fijo !== null && fijo !== undefined ? fijo / lote_ref_kg + (variable ?? 0) : variable ?? null;

  const lineasR: any = await sql.query(
    `
    SELECT
      l.linea_id,
      l.producto_id,
      l.cost_option_id,
      l.pct_peso::float8 as pct_peso,
      l.is_csp,
      l.orden,

      co.tipo,
      co.item_id,
      co.item_presentacion::float8 as item_presentacion,

      jip.price_ars::float8 as job_price_ars,
      jip.as_of_date::text as job_as_of_date,

      co.manual_nombre,
      co.manual_uom,
      co.manual_cantidad::float8 as manual_cantidad,
      co.manual_costo_ars::float8 as manual_costo_ars,

      co.bulk_producto_id,

      co.densidad_g_ml::float8 as densidad_g_ml,
      b.ars_por_kg::float8 as bulk_ars_kg

    FROM app.formula_linea_v2 l
    JOIN app.cost_option co ON co.cost_option_id = l.cost_option_id

    LEFT JOIN app.job_item_presentacion jip
      ON jip.item_id = co.item_id
      AND jip.presentacion = co.item_presentacion

    LEFT JOIN app.producto_bulk_costo b
      ON b.producto_id = co.bulk_producto_id

    WHERE l.producto_id = $1
    ORDER BY l.orden ASC, l.linea_id ASC
    `,
    [producto_id]
  );
  const lineas = normalizeQueryResult(lineasR);

  const cspLinea = lineas.find((x) => !!x.is_csp);
  const pctFijos = lineas.filter((x) => !x.is_csp).reduce((acc, x) => acc + (numOrNull(x.pct_peso) ?? 0), 0);
  const pctCsp = cspLinea ? 100 - pctFijos : null;

  let totalARS = 0;
  for (const l of lineas) {
    const pct = l.is_csp ? pctCsp : numOrNull(l.pct_peso);
    if (pct === null) continue;

    const masa_g = (loteRefG * pct) / 100;
    if (!(masa_g > 0)) continue;

    const arsG = arsPorGramoFromLinea(l);
    if (!arsG.ok) continue;

    totalARS += masa_g * arsG.arsPorG;
  }

  const bulk_ars_kg_sin_prod = loteRefG > 0 ? (totalARS / loteRefG) * 1000 : null;
  const bulk_ars_kg_con_prod =
    bulk_ars_kg_sin_prod !== null ? bulk_ars_kg_sin_prod + (prod_ars_kg ?? 0) : null;

  // Densidad usada para convertir ml -> g si la oferta es por volumen
  const densidad_usada_g_ml =
    numOrNull(oferta.densidad_override_g_ml) ?? numOrNull(oferta.densidad_producto_g_ml) ?? null;

  const peso_neto_g = numOrNull(oferta.peso_neto_g);
  const volumen_neto_ml = numOrNull(oferta.volumen_neto_ml);
  const unidades_pack = numOrNull(oferta.unidades_pack);
  const masa_por_unidad_g = numOrNull(oferta.masa_por_unidad_g);
  const volumen_por_unidad_ml = numOrNull(oferta.volumen_por_unidad_ml);

  let masa_total_g: number | null = null;
  let vol_total_ml: number | null = null;

  if (peso_neto_g !== null && peso_neto_g > 0) {
    masa_total_g = peso_neto_g;
  } else if (volumen_neto_ml !== null && volumen_neto_ml > 0) {
    vol_total_ml = volumen_neto_ml;
    if (densidad_usada_g_ml !== null && densidad_usada_g_ml > 0) masa_total_g = vol_total_ml * densidad_usada_g_ml;
  } else if (unidades_pack !== null && unidades_pack > 0 && masa_por_unidad_g !== null && masa_por_unidad_g > 0) {
    masa_total_g = unidades_pack * masa_por_unidad_g;
  } else if (
    unidades_pack !== null &&
    unidades_pack > 0 &&
    volumen_por_unidad_ml !== null &&
    volumen_por_unidad_ml > 0
  ) {
    vol_total_ml = unidades_pack * volumen_por_unidad_ml;
    if (densidad_usada_g_ml !== null && densidad_usada_g_ml > 0) masa_total_g = vol_total_ml * densidad_usada_g_ml;
  }

  const costo_base_ars =
    bulk_ars_kg_con_prod !== null && masa_total_g !== null ? (bulk_ars_kg_con_prod * masa_total_g) / 1000 : null;

  // Packaging subtotal (override o costo catálogo)
  const packR: any = await sql.query(
    `
    SELECT
      op.oferta_packaging_id,
      op.cantidad::float8 as cantidad,
      op.costo_unitario_override_ars::float8 as costo_unitario_override_ars,
      pi.costo_unitario_ars::float8 as costo_unitario_ars
    FROM app.producto_oferta_packaging op
    JOIN app.packaging_item pi ON pi.packaging_item_id = op.packaging_item_id
    WHERE op.oferta_id = $1
    `,
    [oferta_id]
  );
  const packRows = normalizeQueryResult(packR);

  const packaging_subtotal_ars = packRows.reduce((acc, r) => {
    const qty = numOrNull(r.cantidad) ?? 0;
    const unit = numOrNull(r.costo_unitario_override_ars) ?? numOrNull(r.costo_unitario_ars) ?? 0;
    return acc + qty * unit;
  }, 0);

  const total_ars = costo_base_ars === null ? null : costo_base_ars + packaging_subtotal_ars;

  // Insert snapshot
  await sql.query(
    `
    INSERT INTO app.oferta_costo_snapshot (
      oferta_id,
      producto_id,
      fuente,
      origin,
      bulk_ars_kg_sin_prod,
      prod_ars_kg,
      bulk_ars_kg_con_prod,
      densidad_usada_g_ml,
      masa_total_g,
      vol_total_ml,
      costo_base_ars,
      packaging_subtotal_ars,
      total_ars
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `,
    [
      oferta_id,
      producto_id,
      fuente,
      origin ?? null,
      bulk_ars_kg_sin_prod,
      prod_ars_kg,
      bulk_ars_kg_con_prod,
      densidad_usada_g_ml,
      masa_total_g,
      vol_total_ml,
      costo_base_ars,
      packaging_subtotal_ars,
      total_ars,
    ]
  );
}

/**
 * Alias para mantener compatibilidad con routes que importan este nombre.
 * (Tu route de packaging estaba intentando importar createAutoOfertaCostoSnapshot).
 */
export async function createAutoOfertaCostoSnapshot(arg: number | RecalcOfertaArgs): Promise<void> {
  return recalcAndInsertOfertaSnapshot(arg);
}