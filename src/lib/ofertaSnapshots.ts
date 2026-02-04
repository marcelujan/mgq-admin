import "server-only";
import { db } from "@/lib/db";

/** Normaliza respuesta de drivers tipo { rows } o array directo */
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

type LineaV2 = {
  linea_id: number;
  cost_option_id: number;
  pct_peso: number | null;
  is_csp: boolean;

  tipo: "ITEM_PRESENTACION" | "MANUAL_PRESENTACION" | "BULK_PRODUCTO";
  item_id: number | null;
  item_presentacion: number | null;

  job_price_ars: number | null;

  manual_uom: "GR" | "ML" | "UN" | null;
  manual_cantidad: number | null;
  manual_costo_ars: number | null;

  bulk_producto_id: number | null;

  densidad_g_ml: number | null;
};

type ItemOption = {
  tipo: "ITEM_PRESENTACION";
  item_id: number;
  presentacion: number;
  price_ars: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => ({} as any));
  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || `HTTP ${r.status} (${url})`);
  }
  return j as T;
}

/**
 * Crea snapshot automático para una oferta.
 * - Lee oferta y producto desde DB (para evitar dependencia de un endpoint puntual)
 * - Usa endpoints existentes para fórmula/lineas/cost-options/bulk de bulks anidados
 * - Lee packaging desde DB
 * - Inserta snapshot + detalle packaging en una transacción
 */
export async function createAutoOfertaCostoSnapshot(args: { oferta_id: number; origin: string }) {
  const { oferta_id, origin } = args;
  const sql = db();

  // 1) Traer oferta (mínimo necesario)
  const ofertaRes: any = await sql.query(
    `
    SELECT
      oferta_id,
      producto_id,
      peso_neto_g::float8 as peso_neto_g,
      volumen_neto_ml::float8 as volumen_neto_ml,
      unidades_pack::float8 as unidades_pack,
      masa_por_unidad_g::float8 as masa_por_unidad_g,
      volumen_por_unidad_ml::float8 as volumen_por_unidad_ml,
      densidad_override_g_ml::float8 as densidad_override_g_ml
    FROM app.producto_oferta
    WHERE oferta_id = $1
    `,
    [oferta_id]
  );

  const oferta = normalizeQueryResult(ofertaRes)?.[0];
  if (!oferta) throw new Error("oferta no encontrada");

  const producto_id = Number(oferta.producto_id);
  if (!Number.isFinite(producto_id)) throw new Error("producto_id inválido en oferta");

  // 2) Densidad producto (para cálculos por volumen si aplica)
  const prodRes: any = await sql.query(
    `
    SELECT densidad_producto_g_ml::float8 as densidad_producto_g_ml
    FROM app.producto
    WHERE producto_id = $1
    `,
    [producto_id]
  );
  const densProd = numOrNull(normalizeQueryResult(prodRes)?.[0]?.densidad_producto_g_ml);

  // 3) Traer fórmula header + líneas (ya lo tenés funcionando)
  const fJ = await fetchJSON<{
    ok: true;
    formula: { producto_id: number; lote_ref_g: number } | null;
    costos_produccion: {
      lote_ref_kg: number | null;
      costo_fijo_por_lote_ars: number | null;
      costo_variable_por_kg_ars: number | null;
    } | null;
  }>(`${origin}/api/productos/${producto_id}/formula-v2`);

  const lJ = await fetchJSON<{ ok: true; lineas: LineaV2[] }>(`${origin}/api/productos/${producto_id}/formula-v2/lineas`);

  const formula = fJ.formula;
  const costosProd = fJ.costos_produccion;
  const lineas = (lJ.lineas || []).map((l: any) => ({
    ...l,
    pct_peso: numOrNull(l.pct_peso),
    densidad_g_ml: numOrNull(l.densidad_g_ml),
    job_price_ars: numOrNull(l.job_price_ars),
    manual_cantidad: numOrNull(l.manual_cantidad),
    manual_costo_ars: numOrNull(l.manual_costo_ars),
    bulk_producto_id: numOrNull(l.bulk_producto_id),
    item_presentacion: numOrNull(l.item_presentacion),
    item_id: numOrNull(l.item_id),
  })) as LineaV2[];

  const loteRefG = numOrNull(formula?.lote_ref_g) ?? 1000;

  // 4) Cost-options item_options para fallback cuando job_price_ars viene null
  const optJ = await fetchJSON<{
    ok: true;
    item_options: ItemOption[];
  }>(`${origin}/api/cost-options?limit=400&solo_seleccionados=true&search=`);

  const itemOptions = (optJ.item_options || []).map((x: any) => ({
    ...x,
    presentacion: Number(x.presentacion),
    price_ars: Number(x.price_ars),
  })) as ItemOption[];

  // 5) Prefetch costos de bulks usados como componentes (igual a UI)
  const bulkIds = Array.from(
    new Set(
      lineas
        .filter((x) => x.tipo === "BULK_PRODUCTO" && x.bulk_producto_id)
        .map((x) => Number(x.bulk_producto_id))
        .filter((x) => Number.isFinite(x))
    )
  );

  const bulkCostByProducto: Record<number, number> = {};
  for (const id of bulkIds) {
    const bJ = await fetchJSON<{ ok: true; ars_por_kg: number | null }>(`${origin}/api/productos/${id}/costo-bulk`);
    const arsKg = numOrNull(bJ.ars_por_kg);
    if (arsKg !== null) bulkCostByProducto[id] = arsKg;
  }

  // 6) Recalcular bulk ARS/kg con prod (misma lógica conceptual del UI)
  const cspLinea = lineas.find((l) => !!l.is_csp) ?? null;
  const pctFijos = lineas.filter((l) => !l.is_csp).reduce((acc, l) => acc + (numOrNull(l.pct_peso) ?? 0), 0);
  const pctCsp = cspLinea ? 100 - pctFijos : null;

  function getCostoOptionARSporUnidad(l: LineaV2): { ok: true; ars: number } | { ok: false; err: string } {
    if (l.tipo === "ITEM_PRESENTACION") {
      if (l.job_price_ars !== null && l.job_price_ars !== undefined) {
        return { ok: true, ars: Number(l.job_price_ars) };
      }
      const item_id = l.item_id ?? null;
      const pres = l.item_presentacion ?? null;
      if (!item_id || !pres) return { ok: false, err: "item/presentación incompletos" };
      const found = itemOptions.find((x) => x.item_id === item_id && Number(x.presentacion) === Number(pres));
      if (!found) return { ok: false, err: "precio no encontrado (job)" };
      return { ok: true, ars: Number(found.price_ars) };
    }

    if (l.tipo === "MANUAL_PRESENTACION") {
      if (l.manual_costo_ars === null || l.manual_costo_ars === undefined) return { ok: false, err: "falta costo manual" };
      return { ok: true, ars: Number(l.manual_costo_ars) };
    }

    if (l.tipo === "BULK_PRODUCTO") {
      const bp = l.bulk_producto_id ?? null;
      if (!bp) return { ok: false, err: "bulk_producto_id faltante" };
      const arsKg = bulkCostByProducto[bp];
      if (arsKg === undefined) return { ok: false, err: "bulk: costo no cargado" };
      return { ok: true, ars: arsKg }; // ARS/kg
    }

    return { ok: false, err: "tipo no soportado" };
  }

  function getARSporGramo(l: LineaV2): { ok: true; arsPorG: number } | { ok: false; err: string } {
    const c = getCostoOptionARSporUnidad(l);
    if (!c.ok) return c;

    if (l.tipo === "ITEM_PRESENTACION") {
      const pres = l.item_presentacion ?? null;
      if (!pres || pres <= 0) return { ok: false, err: "presentación inválida" };
      return { ok: true, arsPorG: c.ars / pres };
    }

    if (l.tipo === "MANUAL_PRESENTACION") {
      const u = l.manual_uom;
      const qty = l.manual_cantidad ?? null;
      if (!u || !qty || qty <= 0) return { ok: false, err: "manual: falta uom/cantidad" };

      if (u === "GR") return { ok: true, arsPorG: c.ars / qty };

      if (u === "ML") {
        const dens = numOrNull(l.densidad_g_ml);
        if (!dens || dens <= 0) return { ok: false, err: "manual: falta densidad para convertir ML→GR" };
        const gramos = qty * dens;
        if (gramos <= 0) return { ok: false, err: "manual: conversión inválida" };
        return { ok: true, arsPorG: c.ars / gramos };
      }

      return { ok: false, err: "manual: UN no convertible a gramos" };
    }

    if (l.tipo === "BULK_PRODUCTO") {
      return { ok: true, arsPorG: c.ars / 1000 };
    }

    return { ok: false, err: "conversión no soportada" };
  }

  const rows = lineas.map((l) => {
    const pct = l.is_csp ? pctCsp : numOrNull(l.pct_peso);
    const masa_g = pct === null ? null : (loteRefG * pct) / 100;
    const arsG = getARSporGramo(l);
    const costo_linea = masa_g !== null && arsG.ok ? masa_g * arsG.arsPorG : null;
    return { pct, masa_g, costo_linea, arsG_ok: arsG.ok };
  });

  const totalARS = rows.reduce((acc, r) => acc + (r.costo_linea ?? 0), 0);
  const arsPorKg = loteRefG > 0 ? (totalARS / loteRefG) * 1000 : null;

  const lote_ref_kg = numOrNull(costosProd?.lote_ref_kg);
  const fijo = numOrNull(costosProd?.costo_fijo_por_lote_ars);
  const variable = numOrNull(costosProd?.costo_variable_por_kg_ars);
  const prodARSporKg = lote_ref_kg && fijo !== null ? fijo / lote_ref_kg + (variable ?? 0) : variable ?? null;

  const bulk_ars_kg_con_prod = arsPorKg !== null ? arsPorKg + (prodARSporKg ?? 0) : null;
  if (bulk_ars_kg_con_prod === null) throw new Error("no se pudo calcular bulk ARS/kg con prod (revisar fórmula)");

  // 7) Calcular masa_total_g según oferta (misma lógica de UI)
  const densUsada = numOrNull(oferta.densidad_override_g_ml) ?? densProd;

  const peso_neto_g = numOrNull(oferta.peso_neto_g);
  const volumen_neto_ml = numOrNull(oferta.volumen_neto_ml);
  const unidades_pack = numOrNull(oferta.unidades_pack);
  const masa_por_unidad_g = numOrNull(oferta.masa_por_unidad_g);
  const volumen_por_unidad_ml = numOrNull(oferta.volumen_por_unidad_ml);

  let masa_total_g: number | null = null;

  if (peso_neto_g !== null && peso_neto_g > 0) {
    masa_total_g = peso_neto_g;
  } else if (volumen_neto_ml !== null && volumen_neto_ml > 0) {
    if (densUsada !== null && densUsada > 0) masa_total_g = volumen_neto_ml * densUsada;
  } else if (unidades_pack !== null && unidades_pack > 0 && masa_por_unidad_g !== null && masa_por_unidad_g > 0) {
    masa_total_g = unidades_pack * masa_por_unidad_g;
  } else if (unidades_pack !== null && unidades_pack > 0 && volumen_por_unidad_ml !== null && volumen_por_unidad_ml > 0) {
    if (densUsada !== null && densUsada > 0) masa_total_g = unidades_pack * volumen_por_unidad_ml * densUsada;
  }

  if (masa_total_g === null || masa_total_g <= 0) {
    throw new Error("oferta: no se pudo determinar masa_total_g (faltan datos de presentación/densidad)");
  }

  const base_costo_ars = (bulk_ars_kg_con_prod * masa_total_g) / 1000;

  // 8) Packaging desde DB + subtotal
  const packRes: any = await sql.query(
    `
    SELECT
      op.oferta_packaging_id,
      op.packaging_item_id,
      op.cantidad::float8 as cantidad,
      op.costo_unitario_override_ars::float8 as costo_unitario_override_ars,
      pi.nombre,
      pi.costo_unitario_ars::float8 as costo_unitario_ars
    FROM app.producto_oferta_packaging op
    JOIN app.packaging_item pi ON pi.packaging_item_id = op.packaging_item_id
    WHERE op.oferta_id = $1
    ORDER BY op.oferta_packaging_id ASC
    `,
    [oferta_id]
  );

  const packRows = normalizeQueryResult(packRes).map((r: any) => {
    const cantidad = Number(r.cantidad);
    const unit = numOrNull(r.costo_unitario_override_ars) ?? numOrNull(r.costo_unitario_ars) ?? 0;
    const subtotal = cantidad * unit;
    return {
      packaging_item_id: Number(r.packaging_item_id),
      nombre: String(r.nombre ?? ""),
      cantidad,
      costo_unitario_ars: unit,
      subtotal_ars: subtotal,
    };
  });

  const packaging_costo_ars = packRows.reduce((acc, r) => acc + (numOrNull(r.subtotal_ars) ?? 0), 0);
  const total_costo_ars = base_costo_ars + packaging_costo_ars;

  // 9) Insert snapshot + detalle en transacción
  await sql.query("BEGIN");

  try {
    const snapRes: any = await sql.query(
      `
      INSERT INTO app.producto_oferta_costo_snapshot
        (oferta_id, bulk_ars_kg_con_prod, masa_total_g, base_costo_ars, packaging_costo_ars, total_costo_ars, densidad_usada_g_ml)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING snapshot_id
      `,
      [
        oferta_id,
        bulk_ars_kg_con_prod,
        masa_total_g,
        base_costo_ars,
        packaging_costo_ars,
        total_costo_ars,
        densUsada,
      ]
    );

    const snapshot_id = Number(normalizeQueryResult(snapRes)?.[0]?.snapshot_id);
    if (!Number.isFinite(snapshot_id)) throw new Error("snapshot_id inválido");

    for (const p of packRows) {
      await sql.query(
        `
        INSERT INTO app.producto_oferta_costo_snapshot_packaging
          (snapshot_id, packaging_item_id, nombre, cantidad, costo_unitario_ars, subtotal_ars)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [snapshot_id, p.packaging_item_id, p.nombre, p.cantidad, p.costo_unitario_ars, p.subtotal_ars]
      );
    }

    await sql.query("COMMIT");

    return {
      snapshot_id,
      oferta_id,
      bulk_ars_kg_con_prod,
      masa_total_g,
      base_costo_ars,
      packaging_costo_ars,
      total_costo_ars,
      densidad_usada_g_ml: densUsada,
    };
  } catch (e) {
    try {
      await sql.query("ROLLBACK");
    } catch {}
    throw e;
  }
}