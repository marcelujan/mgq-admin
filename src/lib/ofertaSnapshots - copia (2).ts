// src/lib/ofertaSnapshots.ts
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
  | "OFERTA_CHANGE"
  | "MANUAL";

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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Obtiene costo bulk actual del producto (ARS/kg).
 * Nota: en tu DB el objeto puede no existir; si falla, devolvemos null (no rompe build).
 */
async function getProductoCostoBulkARSkg(producto_id: number): Promise<number | null> {
  const sql = db();

  // 1) intenta tabla directa (si existe)
  try {
    const r: any = await sql.query(
      `
      SELECT ars_por_kg::float8 as ars_por_kg
      FROM app.producto_costo_bulk
      WHERE producto_id = $1
      `,
      [producto_id]
    );
    const rows = normalizeQueryResult(r);
    const arsKg = numOrNull(rows?.[0]?.ars_por_kg);
    if (arsKg !== null) return arsKg;
  } catch {
    // ignorar: tabla puede no existir
  }

  // 2) fallback: último snapshot de costo de oferta bulk (si hay oferta bulk del producto)
  try {
    const r2: any = await sql.query(
      `
      SELECT s.bulk_ars_kg_con_prod::float8 as ars_por_kg
      FROM app.producto_oferta_costo_snapshot s
      JOIN app.producto_oferta o ON o.oferta_id = s.oferta_id
      WHERE o.producto_id = $1 AND o.is_bulk = true
      ORDER BY s.snapshot_id DESC
      LIMIT 1
      `,
      [producto_id]
    );
    const rows2 = normalizeQueryResult(r2);
    return numOrNull(rows2?.[0]?.ars_por_kg);
  } catch {
    return null;
  }
}

function arsKgToArsPorG(arsKg: number | null): number | null {
  if (arsKg === null) return null;
  return arsKg / 1000;
}

function computeOfertaMasaTotalG(args: {
  densidad_g_ml: number | null;
  peso_neto_g: number | null;
  volumen_neto_ml: number | null;
  unidades_pack: number | null;
  masa_por_unidad_g: number | null;
  volumen_por_unidad_ml: number | null;
}): { masa_total_g: number | null; densidad_usada_g_ml: number | null } {
  const dens = numOrNull(args.densidad_g_ml);

  const peso_neto_g = numOrNull(args.peso_neto_g);
  const volumen_neto_ml = numOrNull(args.volumen_neto_ml);
  const unidades_pack = numOrNull(args.unidades_pack);
  const masa_por_unidad_g = numOrNull(args.masa_por_unidad_g);
  const volumen_por_unidad_ml = numOrNull(args.volumen_por_unidad_ml);

  let masaTotalG: number | null = null;
  let densUsada: number | null = dens !== null && dens > 0 ? dens : null;

  if (peso_neto_g !== null && peso_neto_g > 0) {
    masaTotalG = peso_neto_g;
  } else if (volumen_neto_ml !== null && volumen_neto_ml > 0) {
    if (densUsada !== null) masaTotalG = volumen_neto_ml * densUsada;
    else masaTotalG = null;
  } else if (unidades_pack !== null && unidades_pack > 0 && masa_por_unidad_g !== null && masa_por_unidad_g > 0) {
    masaTotalG = unidades_pack * masa_por_unidad_g;
  } else if (
    unidades_pack !== null &&
    unidades_pack > 0 &&
    volumen_por_unidad_ml !== null &&
    volumen_por_unidad_ml > 0
  ) {
    if (densUsada !== null) masaTotalG = unidades_pack * volumen_por_unidad_ml * densUsada;
    else masaTotalG = null;
  }

  return { masa_total_g: masaTotalG, densidad_usada_g_ml: densUsada };
}

async function computePackagingSubtotalARS(oferta_id: number): Promise<number> {
  const sql = db();
  const r: any = await sql.query(
    `
    SELECT
      op.cantidad::float8 as cantidad,
      coalesce(op.costo_unitario_override_ars::float8, pi.costo_unitario_ars::float8) as costo_unitario_ars
    FROM app.producto_oferta_packaging op
    JOIN app.packaging_item pi ON pi.packaging_item_id = op.packaging_item_id
    WHERE op.oferta_id = $1
    `,
    [oferta_id]
  );
  const rows = normalizeQueryResult(r);
  let sum = 0;
  for (const x of rows) {
    const qty = numOrNull(x.cantidad) ?? 0;
    const unit = numOrNull(x.costo_unitario_ars) ?? 0;
    sum += qty * unit;
  }
  return sum;
}

async function computeOfertaBaseCostARS(args: {
  oferta_id: number;
  producto_id: number;
  densidad_oferta_g_ml: number | null;
  masa_total_g: number | null;
}): Promise<number | null> {
  // costo base = bulk ARS/kg (con prod) * masa_total_g/1000
  const arsKg = await getProductoCostoBulkARSkg(args.producto_id);
  if (arsKg === null) return null;
  if (args.masa_total_g === null) return null;
  return (arsKg * args.masa_total_g) / 1000;
}

/**
 * Inserta snapshot para una oferta puntual.
 * Esta es la exportación que te faltaba en build (packaging routes la importan).
 */
export async function recalcAndInsertOfertaSnapshot(args: {
  oferta_id: number;
  fuente: SnapshotFuente;
  origin?: string;
}): Promise<{ ok: true; snapshot_id: number } | { ok: false; error: string }> {
  const sql = db();

  try {
    const oferta_id = Number(args.oferta_id);
    if (!Number.isFinite(oferta_id)) return { ok: false, error: "oferta_id inválido" };

    // traer oferta + producto + densidad producto
    const r: any = await sql.query(
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
      FROM app.producto_oferta o
      JOIN app.producto p ON p.producto_id = o.producto_id
      WHERE o.oferta_id = $1
      `,
      [oferta_id]
    );

    const rows = normalizeQueryResult(r);
    if (!rows.length) return { ok: false, error: "oferta no encontrada" };

    const o = rows[0];
    const producto_id = Number(o.producto_id);
    if (!Number.isFinite(producto_id)) return { ok: false, error: "producto_id inválido" };

    const densOferta = numOrNull(o.densidad_override_g_ml) ?? numOrNull(o.densidad_producto_g_ml);

    const { masa_total_g, densidad_usada_g_ml } = computeOfertaMasaTotalG({
      densidad_g_ml: densOferta,
      peso_neto_g: o.peso_neto_g,
      volumen_neto_ml: o.volumen_neto_ml,
      unidades_pack: o.unidades_pack,
      masa_por_unidad_g: o.masa_por_unidad_g,
      volumen_por_unidad_ml: o.volumen_por_unidad_ml,
    });

    const bulk_ars_kg_con_prod = await getProductoCostoBulkARSkg(producto_id);
    const base_costo_ars = await computeOfertaBaseCostARS({
      oferta_id,
      producto_id,
      densidad_oferta_g_ml: densOferta,
      masa_total_g,
    });

    const packaging_costo_ars = await computePackagingSubtotalARS(oferta_id);
    const total_costo_ars = base_costo_ars === null ? null : base_costo_ars + packaging_costo_ars;

    await sql.query("BEGIN");

    const ins: any = await sql.query(
      `
      INSERT INTO app.producto_oferta_costo_snapshot
        (oferta_id, bulk_ars_kg_con_prod, masa_total_g, base_costo_ars, packaging_costo_ars, total_costo_ars, densidad_usada_g_ml)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7)
      RETURNING snapshot_id
      `,
      [
        oferta_id,
        bulk_ars_kg_con_prod,
        masa_total_g,
        base_costo_ars,
        packaging_costo_ars,
        total_costo_ars,
        densidad_usada_g_ml,
      ]
    );

    const snapshot_id = Number(normalizeQueryResult(ins)?.[0]?.snapshot_id);
    if (!Number.isFinite(snapshot_id)) throw new Error("snapshot_id inválido");

    // opcional: snapshot packaging detalle (si tu tabla existe; si no existe, no rompe)
    try {
      const pack: any = await sql.query(
        `
        SELECT
          op.packaging_item_id,
          pi.nombre,
          op.cantidad::float8 as cantidad,
          coalesce(op.costo_unitario_override_ars::float8, pi.costo_unitario_ars::float8) as costo_unitario_ars
        FROM app.producto_oferta_packaging op
        JOIN app.packaging_item pi ON pi.packaging_item_id = op.packaging_item_id
        WHERE op.oferta_id = $1
        `,
        [oferta_id]
      );

      const packRows = normalizeQueryResult(pack);
      for (const pr of packRows) {
        const nombre = typeof pr.nombre === "string" ? pr.nombre : "";
        const cantidad = numOrNull(pr.cantidad);
        const costo_unitario_ars = numOrNull(pr.costo_unitario_ars);
        if (!nombre || cantidad === null || costo_unitario_ars === null) continue;
        const subtotal_ars = cantidad * costo_unitario_ars;

        // si existe la tabla de detalle (según tu diseño anterior)
        await sql.query(
          `
          INSERT INTO app.producto_oferta_costo_snapshot_packaging
            (snapshot_id, packaging_item_id, nombre, cantidad, costo_unitario_ars, subtotal_ars)
          VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [snapshot_id, numOrNull(pr.packaging_item_id), nombre, cantidad, costo_unitario_ars, subtotal_ars]
        );
      }
    } catch {
      // ignorar si no existe la tabla/columna
    }

    await sql.query("COMMIT");
    return { ok: true, snapshot_id };
  } catch (e: any) {
    try {
      await db().query("ROLLBACK");
    } catch {}
    return { ok: false, error: e?.message ?? "error" };
  }
}

/**
 * Compat: nombre usado en otros routes (si lo tenías).
 * Mantengo esta exportación para no romper imports existentes.
 */
export async function createAutoOfertaCostoSnapshot(args: {
  oferta_id: number;
  fuente: SnapshotFuente;
  origin?: string;
}) {
  return recalcAndInsertOfertaSnapshot(args);
}

/**
 * Recalcula e inserta snapshots para TODAS las ofertas del producto.
 * (Útil cuando cambia fórmula/costos/densidades.)
 */
export async function recalcAndInsertSnapshotsForProducto(args: {
  producto_id: number;
  fuente: SnapshotFuente;
  origin?: string;
}): Promise<{ ok: true; oferta_ids: number[] } | { ok: false; error: string }> {
  const sql = db();
  try {
    const producto_id = Number(args.producto_id);
    if (!Number.isFinite(producto_id)) return { ok: false, error: "producto_id inválido" };

    const r: any = await sql.query(
      `
      SELECT oferta_id
      FROM app.producto_oferta
      WHERE producto_id = $1
      `,
      [producto_id]
    );
    const rows = normalizeQueryResult(r);
    const oferta_ids = rows.map((x) => Number(x.oferta_id)).filter((x) => Number.isFinite(x));

    for (const oferta_id of oferta_ids) {
      await recalcAndInsertOfertaSnapshot({
        oferta_id,
        fuente: args.fuente,
        origin: args.origin,
      });
    }

    return { ok: true, oferta_ids };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "error" };
  }
}

// export explícito (para evitar cualquier issue de build por tree-shaking)
export const __exports = {
  recalcAndInsertOfertaSnapshot,
  recalcAndInsertSnapshotsForProducto,
  createAutoOfertaCostoSnapshot,
};