import { db } from "@/lib/db";

export type SnapshotFuente =
  | "CRON_DAILY"
  | "FORMULA_V2_SAVE"
  | "FORMULA_LINEA_CREATE"
  | "FORMULA_LINEA_PATCH"
  | "FORMULA_LINEA_DELETE"
  | "COST_OPTION_DENS_PATCH"
  | "PACKAGING_ADD"
  | "PACKAGING_PATCH"
  | "PACKAGING_DELETE"
  | "OFERTA_CHANGE";

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeQueryResult(res: any): any[] {
  // neon(sql) devuelve un array
  if (Array.isArray(res)) return res;
  // defensivo para otros drivers
  if (res && Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

type OfertaRow = {
  oferta_id: number;
  producto_id: number;
  nombre: string;
  activo: boolean;
  is_bulk: boolean;
  peso_neto_g: number | null;
  volumen_neto_ml: number | null;
  unidades_pack: number | null;
  masa_por_unidad_g: number | null;
  volumen_por_unidad_ml: number | null;
  densidad_override_g_ml: number | null;
};

type ProductoRow = {
  producto_id: number;
  densidad_producto_g_ml: number | null;
};

async function getLatestPrecioUnitarioARSForProducto(producto_id: number): Promise<number | null> {
  const sql = db();

  // item_formulado (1:1 con producto formulado)
  const itemRows = normalizeQueryResult(
    await sql`
      SELECT item_formulado_id
      FROM app.item_formulado
      WHERE producto_id = ${producto_id}
      LIMIT 1
    `
  );
  const item_formulado_id = numOrNull(itemRows?.[0]?.item_formulado_id);
  if (!item_formulado_id) return null;

  const snapRows = normalizeQueryResult(
    await sql`
      SELECT precio_unitario_ars
      FROM app.item_formulado_snapshot
      WHERE item_formulado_id = ${item_formulado_id}
      ORDER BY created_at DESC, snapshot_id DESC
      LIMIT 1
    `
  );
  return numOrNull(snapRows?.[0]?.precio_unitario_ars);
}

async function computeOfertaCostoActual(oferta_id: number): Promise<{
  oferta: OfertaRow;
  densidad_usada_g_ml: number | null;
  masa_total_g: number | null;
  bulk_ars_kg_con_prod: number | null;
  base_costo_ars: number | null;
  packaging_costo_ars: number;
  total_costo_ars: number | null;
  packaging_rows: Array<{
    packaging_item_id: number;
    nombre: string;
    cantidad: number;
    costo_unitario_ars: number;
    costo_unitario_override_ars: number | null;
    subtotal_ars: number;
  }>;
}> {
  const sql = db();

  const ofertaRows = normalizeQueryResult(
    await sql`
      SELECT
        oferta_id, producto_id, nombre, activo, is_bulk,
        peso_neto_g, volumen_neto_ml,
        unidades_pack, masa_por_unidad_g, volumen_por_unidad_ml,
        densidad_override_g_ml
      FROM app.producto_oferta
      WHERE oferta_id = ${oferta_id}
      LIMIT 1
    `
  );
  if (!ofertaRows.length) throw new Error("oferta no encontrada");

  const o: OfertaRow = {
    oferta_id: Number(ofertaRows[0].oferta_id),
    producto_id: Number(ofertaRows[0].producto_id),
    nombre: String(ofertaRows[0].nombre ?? ""),
    activo: !!ofertaRows[0].activo,
    is_bulk: !!ofertaRows[0].is_bulk,
    peso_neto_g: numOrNull(ofertaRows[0].peso_neto_g),
    volumen_neto_ml: numOrNull(ofertaRows[0].volumen_neto_ml),
    unidades_pack: numOrNull(ofertaRows[0].unidades_pack),
    masa_por_unidad_g: numOrNull(ofertaRows[0].masa_por_unidad_g),
    volumen_por_unidad_ml: numOrNull(ofertaRows[0].volumen_por_unidad_ml),
    densidad_override_g_ml: numOrNull(ofertaRows[0].densidad_override_g_ml),
  };

  const prodRows = normalizeQueryResult(
    await sql`
      SELECT producto_id, densidad_producto_g_ml
      FROM app.producto
      WHERE producto_id = ${o.producto_id}
      LIMIT 1
    `
  );
  const p: ProductoRow | null = prodRows.length
    ? {
        producto_id: Number(prodRows[0].producto_id),
        densidad_producto_g_ml: numOrNull(prodRows[0].densidad_producto_g_ml),
      }
    : null;

  const densidad_usada_g_ml = numOrNull(o.densidad_override_g_ml) ?? numOrNull(p?.densidad_producto_g_ml);

  // masa total (g) según reglas de UI
  let masa_total_g: number | null = null;

  const peso_neto_g = numOrNull(o.peso_neto_g);
  const volumen_neto_ml = numOrNull(o.volumen_neto_ml);
  const unidades_pack = numOrNull(o.unidades_pack);
  const masa_por_unidad_g = numOrNull(o.masa_por_unidad_g);
  const volumen_por_unidad_ml = numOrNull(o.volumen_por_unidad_ml);

  if (peso_neto_g !== null && peso_neto_g > 0) {
    masa_total_g = peso_neto_g;
  } else if (volumen_neto_ml !== null && volumen_neto_ml > 0) {
    if (densidad_usada_g_ml !== null && densidad_usada_g_ml > 0) masa_total_g = volumen_neto_ml * densidad_usada_g_ml;
  } else if (unidades_pack !== null && unidades_pack > 0 && masa_por_unidad_g !== null && masa_por_unidad_g > 0) {
    masa_total_g = unidades_pack * masa_por_unidad_g;
  } else if (
    unidades_pack !== null &&
    unidades_pack > 0 &&
    volumen_por_unidad_ml !== null &&
    volumen_por_unidad_ml > 0 &&
    densidad_usada_g_ml !== null &&
    densidad_usada_g_ml > 0
  ) {
    masa_total_g = unidades_pack * volumen_por_unidad_ml * densidad_usada_g_ml;
  }

  // bulk ARS/kg (con prod) desde último snapshot del item formulado
  const bulk_ars_kg_con_prod = await getLatestPrecioUnitarioARSForProducto(o.producto_id);

  const base_costo_ars =
    bulk_ars_kg_con_prod !== null && masa_total_g !== null ? (bulk_ars_kg_con_prod * masa_total_g) / 1000 : null;

  const packRows = normalizeQueryResult(
    await sql`
      SELECT
        op.packaging_item_id,
        op.cantidad,
        op.costo_unitario_override_ars,
        pi.nombre,
        pi.costo_unitario_ars
      FROM app.oferta_packaging op
      JOIN app.packaging_item pi
        ON pi.packaging_item_id = op.packaging_item_id
      WHERE op.oferta_id = ${oferta_id}
      ORDER BY op.oferta_packaging_id ASC
    `
  );

  const packaging_rows = packRows.map((r: any) => {
    const costo_unitario_override_ars = numOrNull(r.costo_unitario_override_ars);
    const costo_unitario_ars = numOrNull(costo_unitario_override_ars) ?? Number(r.costo_unitario_ars ?? 0);
    const cantidad = Number(r.cantidad ?? 0);
    const subtotal_ars = cantidad * costo_unitario_ars;

    return {
      packaging_item_id: Number(r.packaging_item_id),
      nombre: String(r.nombre ?? ""),
      cantidad,
      costo_unitario_ars,
      costo_unitario_override_ars,
      subtotal_ars,
    };
  });

  const packaging_costo_ars = packaging_rows.reduce((acc, r) => acc + (Number.isFinite(r.subtotal_ars) ? r.subtotal_ars : 0), 0);

  const total_costo_ars = base_costo_ars === null ? null : base_costo_ars + packaging_costo_ars;

  return {
    oferta: o,
    densidad_usada_g_ml,
    masa_total_g,
    bulk_ars_kg_con_prod,
    base_costo_ars,
    packaging_costo_ars,
    total_costo_ars,
    packaging_rows,
  };
}

/**
 * Inserta un snapshot de costo de oferta + detalle de packaging.
 * Devuelve snapshot_id.
 */
export async function createAutoOfertaCostoSnapshot(args: {
  oferta_id: number;
  fuente: SnapshotFuente;
  origin?: string;
}): Promise<number> {
  const { oferta_id } = args;
  const sql = db();

  const c = await computeOfertaCostoActual(oferta_id);

  await sql`BEGIN`;
  try {
    const ins = normalizeQueryResult(
      await sql`
        INSERT INTO app.producto_oferta_costo_snapshot (
          oferta_id,
          bulk_ars_kg_con_prod,
          base_costo_ars,
          packaging_costo_ars,
          total_costo_ars,
          masa_total_g,
          densidad_usada_g_ml
        )
        VALUES (
          ${oferta_id},
          ${c.bulk_ars_kg_con_prod},
          ${c.base_costo_ars},
          ${c.packaging_costo_ars},
          ${c.total_costo_ars},
          ${c.masa_total_g},
          ${c.densidad_usada_g_ml}
        )
        RETURNING snapshot_id
      `
    );

    const snapshot_id = Number(ins?.[0]?.snapshot_id);
    if (!Number.isFinite(snapshot_id)) throw new Error("snapshot_id inválido");

    for (const r of c.packaging_rows) {
      await sql`
        INSERT INTO app.producto_oferta_costo_snapshot_packaging (
          snapshot_id,
          packaging_item_id,
          nombre,
          cantidad,
          costo_unitario_ars,
          subtotal_ars
        )
        VALUES (
          ${snapshot_id},
          ${r.packaging_item_id},
          ${r.nombre},
          ${r.cantidad},
          ${r.costo_unitario_ars},
          ${r.subtotal_ars}
        )
      `;
    }

    await sql`COMMIT`;
    return snapshot_id;
  } catch (e) {
    await sql`ROLLBACK`;
    throw e;
  }
}

export async function recalcAndInsertOfertaSnapshot(args: {
  oferta_id: number;
  fuente: SnapshotFuente;
  origin?: string;
}): Promise<number> {
  return createAutoOfertaCostoSnapshot(args);
}

export async function recalcAndInsertSnapshotsForProducto(args: {
  producto_id: number;
  fuente: SnapshotFuente;
  origin?: string;
}): Promise<{ ofertas: number; snapshot_ids: number[] }> {
  const { producto_id } = args;
  const sql = db();

  const ofertaRows = normalizeQueryResult(
    await sql`
      SELECT oferta_id
      FROM app.producto_oferta
      WHERE producto_id = ${producto_id}
      ORDER BY oferta_id ASC
    `
  );

  const snapshot_ids: number[] = [];
  for (const r of ofertaRows) {
    const oferta_id = Number(r.oferta_id);
    if (!Number.isFinite(oferta_id)) continue;
    const sid = await recalcAndInsertOfertaSnapshot({ oferta_id, fuente: args.fuente, origin: args.origin });
    snapshot_ids.push(sid);
  }

  return { ofertas: snapshot_ids.length, snapshot_ids };
}