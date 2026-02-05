import { db } from "@/lib/db";
import { normalizeQueryResult, numOrNull } from "@/lib/api";

export type SnapshotFuente =
  | "FORMULA_V2_SAVE"
  | "FORMULA_LINEA_CREATE"
  | "FORMULA_LINEA_PATCH"
  | "FORMULA_LINEA_DELETE"
  | "COST_OPTION_DENS_PATCH"
  | "PACKAGING_ADD"
  | "PACKAGING_PATCH"
  | "PACKAGING_DELETE"
  | "OFERTA_CHANGE"
  | "MANUAL";

/**
 * Nota:
 * - Esta implementación prioriza: compilar + poder insertar snapshots.
 * - Si ya tenés una función SQL real de recálculo (app.recalc_*), se enchufa acá.
 */

export type RecalcArgs = { producto_id: number; fuente?: SnapshotFuente };

/** Overloads para compat con llamadas existentes */
export async function recalcAndInsertSnapshotsForProducto(producto_id: number): Promise<void>;
export async function recalcAndInsertSnapshotsForProducto(args: RecalcArgs): Promise<void>;
export async function recalcAndInsertSnapshotsForProducto(arg: number | RecalcArgs): Promise<void> {
  const producto_id = typeof arg === "number" ? arg : arg.producto_id;

  const sql = db();

  // Ofertas del producto
  const ofertasRes: any = await sql.query(
    `SELECT oferta_id FROM app.producto_oferta WHERE producto_id = $1`,
    [producto_id]
  );

  const ofertas = normalizeQueryResult(ofertasRes)
    .map((r) => Number(r.oferta_id))
    .filter((x) => Number.isFinite(x));

  for (const oferta_id of ofertas) {
    await recalcAndInsertOfertaSnapshot({
      oferta_id,
      fuente: typeof arg === "number" ? "MANUAL" : arg.fuente,
    });
  }
}

export type RecalcOfertaArgs = { oferta_id: number; fuente?: SnapshotFuente };

export async function recalcAndInsertOfertaSnapshot(oferta_id: number): Promise<void>;
export async function recalcAndInsertOfertaSnapshot(args: RecalcOfertaArgs): Promise<void>;
export async function recalcAndInsertOfertaSnapshot(arg: number | RecalcOfertaArgs): Promise<void> {
  const oferta_id = typeof arg === "number" ? arg : arg.oferta_id;

  const sql = db();

  // 1) Packaging actual de la oferta
  const packRes: any = await sql.query(
    `
    SELECT
      op.packaging_item_id,
      pi.nombre,
      op.cantidad::float8 as cantidad,
      coalesce(op.costo_unitario_override_ars, pi.costo_unitario_ars)::float8 as costo_unitario_ars
    FROM app.producto_oferta_packaging op
    JOIN app.packaging_item pi ON pi.packaging_item_id = op.packaging_item_id
    WHERE op.oferta_id = $1
    ORDER BY op.oferta_packaging_id ASC
    `,
    [oferta_id]
  );

  const packagingRows = normalizeQueryResult(packRes).map((r) => ({
    packaging_item_id: Number(r.packaging_item_id),
    nombre: String(r.nombre ?? ""),
    cantidad: Number(r.cantidad ?? 0),
    costo_unitario_ars: Number(r.costo_unitario_ars ?? 0),
    subtotal_ars: Number(r.cantidad ?? 0) * Number(r.costo_unitario_ars ?? 0),
  }));

  const packaging_costo_ars = packagingRows.reduce(
    (acc, r) => acc + (Number.isFinite(r.subtotal_ars) ? r.subtotal_ars : 0),
    0
  );

  // 2) Base cost: leer ARS/kg con prod desde DB si existe.
  // Ajustar a tu schema real (esto intenta app.producto_bulk_costo).
  let bulk_ars_kg_con_prod: number | null = null;

  try {
    const bulkRes: any = await sql.query(
      `
      SELECT ars_por_kg_con_prod::float8 as ars_por_kg_con_prod
      FROM app.producto_bulk_costo
      WHERE producto_id = (SELECT producto_id FROM app.producto_oferta WHERE oferta_id = $1)
      `,
      [oferta_id]
    );
    bulk_ars_kg_con_prod = numOrNull(normalizeQueryResult(bulkRes)?.[0]?.ars_por_kg_con_prod);
  } catch {
    bulk_ars_kg_con_prod = null;
  }

  if (bulk_ars_kg_con_prod === null) bulk_ars_kg_con_prod = 0;

  // 3) Masa total (g) para la oferta (similar a UI)
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

  const o = normalizeQueryResult(ofertaRes)?.[0];
  if (!o) return;

  const peso_neto_g = numOrNull(o.peso_neto_g);
  const volumen_neto_ml = numOrNull(o.volumen_neto_ml);
  const unidades_pack = numOrNull(o.unidades_pack);
  const masa_por_unidad_g = numOrNull(o.masa_por_unidad_g);
  const volumen_por_unidad_ml = numOrNull(o.volumen_por_unidad_ml);
  const dens_override = numOrNull(o.densidad_override_g_ml);

  // densidad producto si no hay override
  let dens_prod: number | null = dens_override;
  if (dens_prod === null) {
    try {
      const pRes: any = await sql.query(
        `SELECT densidad_producto_g_ml::float8 as densidad_producto_g_ml FROM app.producto WHERE producto_id = $1`,
        [Number(o.producto_id)]
      );
      dens_prod = numOrNull(normalizeQueryResult(pRes)?.[0]?.densidad_producto_g_ml);
    } catch {
      dens_prod = null;
    }
  }

  let masa_total_g: number | null = null;

  if (peso_neto_g !== null && peso_neto_g > 0) {
    masa_total_g = peso_neto_g;
  } else if (volumen_neto_ml !== null && volumen_neto_ml > 0) {
    if (dens_prod !== null && dens_prod > 0) masa_total_g = volumen_neto_ml * dens_prod;
  } else if (unidades_pack !== null && unidades_pack > 0 && masa_por_unidad_g !== null && masa_por_unidad_g > 0) {
    masa_total_g = unidades_pack * masa_por_unidad_g;
  } else if (unidades_pack !== null && unidades_pack > 0 && volumen_por_unidad_ml !== null && volumen_por_unidad_ml > 0) {
    if (dens_prod !== null && dens_prod > 0) masa_total_g = unidades_pack * volumen_por_unidad_ml * dens_prod;
  }

  const base_costo_ars =
    masa_total_g !== null && Number.isFinite(masa_total_g)
      ? (Number(bulk_ars_kg_con_prod) * Number(masa_total_g)) / 1000
      : 0;

  const total_costo_ars = Number(base_costo_ars) + Number(packaging_costo_ars);

  // 4) Insert snapshot head + detail
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
        masa_total_g ?? 0,
        base_costo_ars,
        packaging_costo_ars,
        total_costo_ars,
        dens_prod,
      ]
    );

    const snapshot_id = Number(normalizeQueryResult(snapRes)?.[0]?.snapshot_id);
    if (!Number.isFinite(snapshot_id)) throw new Error("snapshot_id inválido");

    for (const r of packagingRows) {
      await sql.query(
        `
        INSERT INTO app.producto_oferta_costo_snapshot_packaging
          (snapshot_id, packaging_item_id, nombre, cantidad, costo_unitario_ars, subtotal_ars)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [snapshot_id, r.packaging_item_id, r.nombre, r.cantidad, r.costo_unitario_ars, r.subtotal_ars]
      );
    }

    await sql.query("COMMIT");
  } catch (e) {
    try {
      await sql.query("ROLLBACK");
    } catch {}
    throw e;
  }
}