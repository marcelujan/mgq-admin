// src/lib/ofertaSnapshots.ts
import { db } from "@/lib/db";

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

export type SnapshotFuente =
  | "COST_OPTION_DENS_PATCH"
  | "CRON_DAILY"
  | "FORMULA_LINEA_CREATE"
  | "FORMULA_LINEA_DELETE"
  | "FORMULA_LINEA_PATCH"
  | "FORMULA_V2_SAVE"
  | "PACKAGING_ADD"
  | "PACKAGING_DELETE"
  | "PACKAGING_PATCH";

type OfertaSnapshotRow = {
  snapshot_id: number;
  oferta_id: number;
  created_at: any;

  bulk_ars_kg_con_prod: number | null;
  densidad_usada_g_ml: number | null;
  masa_total_g: number | null;

  costo_base_ars: number | null;
  packaging_subtotal_ars: number | null;
  total_ars: number | null;
};

function arsPorKgAarsPorG(arsKg: number | null): number | null {
  if (arsKg === null || arsKg === undefined) return null;
  const n = Number(arsKg);
  if (!Number.isFinite(n)) return null;
  return n / 1000;
}

async function getProductoIdFromOferta(sql: any, oferta_id: number): Promise<number | null> {
  const r: any = await sql.query(
    `SELECT producto_id FROM app.producto_oferta WHERE oferta_id = $1`,
    [oferta_id]
  );
  const rows = normalizeQueryResult(r);
  const pid = rows?.[0]?.producto_id;
  const n = Number(pid);
  return Number.isFinite(n) ? n : null;
}

async function getLatestBulkCostoForProducto(sql: any, producto_id: number): Promise<number | null> {
  // Nota: no dependemos de app.producto_costo_bulk (puede no existir).
  // Usamos el endpoint/tabla existente de snapshots de producto bulk si la tenés;
  // si no, devolvemos null.
  //
  // Si en tu esquema real el costo bulk vive en otra tabla/vista, ajustá SOLO este SELECT.
  const r: any = await sql.query(
    `
    SELECT ars_por_kg::float8 as ars_por_kg
    FROM app.producto_bulk_costo_snapshot
    WHERE producto_id = $1
    ORDER BY as_of_date DESC, snapshot_id DESC
    LIMIT 1
    `,
    [producto_id]
  );

  const rows = normalizeQueryResult(r);
  if (!rows.length) return null;
  return numOrNull(rows[0]?.ars_por_kg);
}

function calcOfertaMasaTotalG(args: {
  densidad_usada_g_ml: number | null;
  peso_neto_g: number | null;
  volumen_neto_ml: number | null;
  unidades_pack: number | null;
  masa_por_unidad_g: number | null;
  volumen_por_unidad_ml: number | null;
}): { masa_total_g: number | null; densidad_usada_g_ml: number | null } {
  const dens = numOrNull(args.densidad_usada_g_ml);
  const peso = numOrNull(args.peso_neto_g);
  const vol = numOrNull(args.volumen_neto_ml);
  const un = numOrNull(args.unidades_pack);
  const mpu = numOrNull(args.masa_por_unidad_g);
  const vpu = numOrNull(args.volumen_por_unidad_ml);

  let masaTotalG: number | null = null;
  let densUsada: number | null = dens;

  if (peso !== null && peso > 0) {
    masaTotalG = peso;
  } else if (vol !== null && vol > 0) {
    if (densUsada !== null && densUsada > 0) masaTotalG = vol * densUsada;
  } else if (un !== null && un > 0 && mpu !== null && mpu > 0) {
    masaTotalG = un * mpu;
  } else if (un !== null && un > 0 && vpu !== null && vpu > 0) {
    if (densUsada !== null && densUsada > 0) masaTotalG = un * vpu * densUsada;
  }

  return { masa_total_g: masaTotalG, densidad_usada_g_ml: densUsada };
}

async function getPackagingSubtotalForOferta(sql: any, oferta_id: number): Promise<number> {
  const r: any = await sql.query(
    `
    SELECT
      SUM(op.cantidad * COALESCE(op.costo_unitario_override_ars, pi.costo_unitario_ars))::float8 AS subtotal
    FROM app.producto_oferta_packaging op
    JOIN app.packaging_item pi ON pi.packaging_item_id = op.packaging_item_id
    WHERE op.oferta_id = $1
    `,
    [oferta_id]
  );
  const rows = normalizeQueryResult(r);
  const subtotal = numOrNull(rows?.[0]?.subtotal);
  return subtotal ?? 0;
}

async function computeOfertaCostoForSnapshot(sql: any, oferta_id: number): Promise<{
  oferta_id: number;
  bulk_ars_kg_con_prod: number | null;
  densidad_usada_g_ml: number | null;
  masa_total_g: number | null;
  costo_base_ars: number | null;
  packaging_subtotal_ars: number;
  total_ars: number | null;
}> {
  // 1) Oferta + densidad producto (fallback)
  const rO: any = await sql.query(
    `
    SELECT
      o.oferta_id,
      o.producto_id,
      o.peso_neto_g::float8 AS peso_neto_g,
      o.volumen_neto_ml::float8 AS volumen_neto_ml,
      o.unidades_pack::float8 AS unidades_pack,
      o.masa_por_unidad_g::float8 AS masa_por_unidad_g,
      o.volumen_por_unidad_ml::float8 AS volumen_por_unidad_ml,
      o.densidad_override_g_ml::float8 AS densidad_override_g_ml,
      p.densidad_producto_g_ml::float8 AS densidad_producto_g_ml
    FROM app.producto_oferta o
    JOIN app.producto p ON p.producto_id = o.producto_id
    WHERE o.oferta_id = $1
    `,
    [oferta_id]
  );
  const rowsO = normalizeQueryResult(rO);
  if (!rowsO.length) {
    return {
      oferta_id,
      bulk_ars_kg_con_prod: null,
      densidad_usada_g_ml: null,
      masa_total_g: null,
      costo_base_ars: null,
      packaging_subtotal_ars: 0,
      total_ars: null,
    };
  }

  const row = rowsO[0];
  const producto_id = Number(row.producto_id);

  const densidadUsada =
    numOrNull(row.densidad_override_g_ml) ?? numOrNull(row.densidad_producto_g_ml) ?? null;

  const { masa_total_g, densidad_usada_g_ml } = calcOfertaMasaTotalG({
    densidad_usada_g_ml: densidadUsada,
    peso_neto_g: row.peso_neto_g,
    volumen_neto_ml: row.volumen_neto_ml,
    unidades_pack: row.unidades_pack,
    masa_por_unidad_g: row.masa_por_unidad_g,
    volumen_por_unidad_ml: row.volumen_por_unidad_ml,
  });

  // 2) Bulk ARS/kg con prod (si no existe snapshot de bulk, queda null)
  const bulk_ars_kg_con_prod = await getLatestBulkCostoForProducto(sql, producto_id);

  // 3) Packaging subtotal
  const packaging_subtotal_ars = await getPackagingSubtotalForOferta(sql, oferta_id);

  // 4) Base y total
  const costo_base_ars =
    bulk_ars_kg_con_prod !== null && masa_total_g !== null
      ? (bulk_ars_kg_con_prod * masa_total_g) / 1000
      : null;

  const total_ars = costo_base_ars !== null ? costo_base_ars + packaging_subtotal_ars : null;

  return {
    oferta_id,
    bulk_ars_kg_con_prod: numOrNull(bulk_ars_kg_con_prod),
    densidad_usada_g_ml: numOrNull(densidad_usada_g_ml),
    masa_total_g: numOrNull(masa_total_g),
    costo_base_ars: numOrNull(costo_base_ars),
    packaging_subtotal_ars,
    total_ars: numOrNull(total_ars),
  };
}

export async function recalcAndInsertOfertaSnapshot(_oferta_id: number): Promise<void>;
export async function recalcAndInsertOfertaSnapshot(args: {
  oferta_id: number;
  fuente: SnapshotFuente;
  origin: string;
}): Promise<void>;
export async function recalcAndInsertOfertaSnapshot(
  arg: number | { oferta_id: number; fuente: SnapshotFuente; origin: string }
): Promise<void> {
  const oferta_id = typeof arg === "number" ? arg : Number(arg.oferta_id);
  const fuente: SnapshotFuente = typeof arg === "number" ? "FORMULA_V2_SAVE" : arg.fuente;
  const origin = typeof arg === "number" ? "unknown" : arg.origin;

  if (!Number.isFinite(oferta_id)) return;

  const sql = db();
  const computed = await computeOfertaCostoForSnapshot(sql, oferta_id);

  await sql.query(
    `
    INSERT INTO app.oferta_costo_snapshot
      (oferta_id, bulk_ars_kg_con_prod, densidad_usada_g_ml, masa_total_g, costo_base_ars, packaging_subtotal_ars, total_ars, fuente, origin)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
    [
      computed.oferta_id,
      computed.bulk_ars_kg_con_prod,
      computed.densidad_usada_g_ml,
      computed.masa_total_g,
      computed.costo_base_ars,
      computed.packaging_subtotal_ars,
      computed.total_ars,
      fuente,
      origin,
    ]
  );
}

export async function recalcAndInsertSnapshotsForProducto(args: {
  producto_id: number;
  fuente: SnapshotFuente;
  origin: string;
}): Promise<void> {
  const producto_id = Number(args.producto_id);
  if (!Number.isFinite(producto_id)) return;

  const sql = db();

  const r: any = await sql.query(
    `SELECT oferta_id FROM app.producto_oferta WHERE producto_id = $1`,
    [producto_id]
  );
  const ofertas = normalizeQueryResult(r).map((x) => Number(x.oferta_id)).filter((x) => Number.isFinite(x));

  for (const oferta_id of ofertas) {
    await recalcAndInsertOfertaSnapshot({
      oferta_id,
      fuente: args.fuente,
      origin: args.origin,
    });
  }
}

// Backward-compatible alias used by some routes
export const createAutoOfertaCostoSnapshot = recalcAndInsertOfertaSnapshot;