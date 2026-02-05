import { db } from "@/lib/db";

export type SnapshotFuente =
  | "FORMULA_V2_SAVE"
  | "FORMULA_LINEA_CREATE"
  | "FORMULA_LINEA_PATCH"
  | "FORMULA_LINEA_DELETE"
  | "COST_OPTION_DENS_PATCH"
  | "PACKAGING_ADD"
  | "PACKAGING_PATCH"
  | "PACKAGING_DELETE"
  | "CRON_DAILY";

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

function asNumber(v: any, fallback: number | null = null): number | null {
  const n = numOrNull(v);
  return n === null ? fallback : n;
}

/**
 * Convierte ARS/kg → ARS/g
 */
function arsKgToArsG(arsKg: number): number {
  return arsKg / 1000;
}

/**
 * Recalcula e inserta snapshots para TODAS las ofertas del producto (y el “último snapshot” por oferta te queda disponible).
 * Se asume que ya existe app.oferta_costo_snapshot (la tabla de snapshots de oferta) y app.producto_oferta / packaging, etc.
 */
export async function recalcAndInsertSnapshotsForProducto(args: {
  producto_id: number;
  fuente: SnapshotFuente;
  origin: string;
}) {
  const { producto_id, fuente, origin } = args;
  if (!Number.isFinite(producto_id)) throw new Error("producto_id inválido");

  const sql = db();

  // 1) Traer densidad del producto
  const pr: any = await sql.query(
    `
    SELECT densidad_producto_g_ml::float8 AS dens
    FROM app.producto
    WHERE producto_id = $1
    `,
    [producto_id]
  );
  const pRows = normalizeQueryResult(pr);
  const densProd = pRows.length ? asNumber(pRows[0].dens, null) : null;

  // 2) Traer costo bulk ARS/kg “con prod” desde tu lógica actual:
  //    - Este bloque asume que tu cálculo ya está consolidado en algún lado.
  //    - Si ya tenés un view/función o tabla para bulk_ars_kg_con_prod, reemplazalo acá.
  //
  // En este MVP: intentamos leer desde app.producto_costo_bulk (si existiera) o devolvemos null.
  let bulkArsKgConProd: number | null = null;
  try {
    const br: any = await sql.query(
      `
      SELECT ars_por_kg_con_prod::float8 AS ars
      FROM app.producto_costo_bulk
      WHERE producto_id = $1
      `,
      [producto_id]
    );
    const bRows = normalizeQueryResult(br);
    bulkArsKgConProd = bRows.length ? asNumber(bRows[0].ars, null) : null;
  } catch {
    bulkArsKgConProd = null;
  }

  // 3) Ofertas del producto
  const or: any = await sql.query(
    `
    SELECT
      oferta_id,
      is_bulk,
      peso_neto_g::float8 as peso_neto_g,
      volumen_neto_ml::float8 as volumen_neto_ml,
      unidades_pack::float8 as unidades_pack,
      masa_por_unidad_g::float8 as masa_por_unidad_g,
      volumen_por_unidad_ml::float8 as volumen_por_unidad_ml,
      densidad_override_g_ml::float8 as densidad_override_g_ml
    FROM app.producto_oferta
    WHERE producto_id = $1
    ORDER BY oferta_id ASC
    `,
    [producto_id]
  );
  const ofertas = normalizeQueryResult(or);

  // helper para masa total g
  const calcMasaTotalG = (o: any): { masaTotalG: number | null; densUsada: number | null } => {
    const dens = asNumber(o.densidad_override_g_ml, null) ?? densProd;

    const peso_neto_g = asNumber(o.peso_neto_g, null);
    const volumen_neto_ml = asNumber(o.volumen_neto_ml, null);
    const unidades_pack = asNumber(o.unidades_pack, null);
    const masa_por_unidad_g = asNumber(o.masa_por_unidad_g, null);
    const volumen_por_unidad_ml = asNumber(o.volumen_por_unidad_ml, null);

    let masaTotalG: number | null = null;

    if (peso_neto_g !== null && peso_neto_g > 0) {
      masaTotalG = peso_neto_g;
    } else if (volumen_neto_ml !== null && volumen_neto_ml > 0) {
      if (dens !== null && dens > 0) masaTotalG = volumen_neto_ml * dens;
    } else if (unidades_pack !== null && unidades_pack > 0 && masa_por_unidad_g !== null && masa_por_unidad_g > 0) {
      masaTotalG = unidades_pack * masa_por_unidad_g;
    } else if (unidades_pack !== null && unidades_pack > 0 && volumen_por_unidad_ml !== null && volumen_por_unidad_ml > 0) {
      if (dens !== null && dens > 0) masaTotalG = unidades_pack * volumen_por_unidad_ml * dens;
    }

    return { masaTotalG, densUsada: dens };
  };

  for (const o of ofertas) {
    const oferta_id = Number(o.oferta_id);
    if (!Number.isFinite(oferta_id)) continue;

    // no snapshot para ofertas bulk (según tu regla)
    if (o.is_bulk) continue;

    const { masaTotalG, densUsada } = calcMasaTotalG(o);

    // costo base (bulk kg con prod * masaTotalG/1000)
    const baseArs =
      bulkArsKgConProd !== null && masaTotalG !== null ? (bulkArsKgConProd * masaTotalG) / 1000 : null;

    // packaging subtotal
    const pr2: any = await sql.query(
      `
      SELECT
        op.cantidad::float8 as cantidad,
        coalesce(op.costo_unitario_override_ars, pi.costo_unitario_ars)::float8 as unit_ars
      FROM app.producto_oferta_packaging op
      JOIN app.packaging_item pi ON pi.packaging_item_id = op.packaging_item_id
      WHERE op.oferta_id = $1
      `,
      [oferta_id]
    );
    const packRows = normalizeQueryResult(pr2);
    const packagingArs = packRows.reduce((acc, r) => acc + Number(r.cantidad || 0) * Number(r.unit_ars || 0), 0);

    const totalArs = baseArs === null ? null : baseArs + packagingArs;

    // insert snapshot
    await sql.query(
      `
      INSERT INTO app.oferta_costo_snapshot (
        oferta_id,
        producto_id,
        fuente,
        origin,
        bulk_ars_kg_con_prod,
        densidad_usada_g_ml,
        masa_total_g,
        costo_base_ars,
        packaging_total_ars,
        total_ars
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        oferta_id,
        producto_id,
        fuente,
        origin,
        bulkArsKgConProd,
        densUsada,
        masaTotalG,
        baseArs,
        packagingArs,
        totalArs,
      ]
    );
  }
}

/**
 * Compat: si algún route viejo llama esto para “crear snapshot automático”.
 * Lo resolvemos delegando al recálculo del producto completo.
 */
export async function createAutoOfertaCostoSnapshot(args: {
  oferta_id: number;
  producto_id: number;
  fuente: SnapshotFuente;
  origin: string;
}) {
  const { producto_id, fuente, origin } = args;
  return recalcAndInsertSnapshotsForProducto({ producto_id, fuente, origin });
}