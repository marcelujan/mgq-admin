import { db } from "@/lib/db";

export type PricePoint = { date: string; value: number };

export type PriceSeries = {
  id: string;
  label: string;
  unit: "ARS" | "ARS/kg" | "ARS/L" | "ARS/u";
  points: PricePoint[];
};

export type PriceHistoryResponse = {
  item_id: number;
  kind: "PROVEEDOR" | "MANUAL" | "FORMULADO";
  series: PriceSeries[];
};

function normalizeQueryResult(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Intenta resolver el id numérico como un item_formulado_id.
 * Si existe, devuelve metadata básica del item formulado.
 */
export async function tryGetItemFormuladoMeta(item_formulado_id: number): Promise<
  | null
  | {
      item_formulado_id: number;
      tipo: string;
      producto_id: number | null;
      oferta_id: number | null;
    }
> {
  const sql = db();
  const r: any = await sql.query(
    `
      select item_formulado_id, tipo, producto_id, oferta_id
      from app.item_formulado
      where item_formulado_id = $1
        and activo = true
      limit 1;
    `,
    [item_formulado_id]
  );

  const row = normalizeQueryResult(r)[0];
  if (!row) return null;

  return {
    item_formulado_id: Number(row.item_formulado_id),
    tipo: String(row.tipo ?? ""),
    producto_id: numOrNull(row.producto_id),
    oferta_id: numOrNull(row.oferta_id),
  };
}

async function getBulkItemFormuladoIdForProducto(producto_id: number): Promise<number | null> {
  const sql = db();
  const r: any = await sql.query(
    `
      select item_formulado_id
      from app.item_formulado
      where producto_id = $1
        and tipo = 'BULK'
        and activo = true
      limit 1;
    `,
    [producto_id]
  );
  const row = normalizeQueryResult(r)[0];
  const n = numOrNull(row?.item_formulado_id);
  return n && n > 0 ? n : null;
}

async function loadItemFormuladoSnapshotSeries(
  item_formulado_id: number,
  label: string,
  unit: PriceSeries["unit"]
): Promise<PriceSeries> {
  const sql = db();

  const r: any = await sql.query(
    `
      select
        created_at::date::text as date,
        precio_unitario_ars::float8 as value
      from app.item_formulado_snapshot
      where item_formulado_id = $1
      order by created_at asc, snapshot_id asc;
    `,
    [item_formulado_id]
  );
  const rows = normalizeQueryResult(r);

  const points: PricePoint[] = rows
    .map((x: any) => ({ date: String(x.date ?? ""), value: Number(x.value) }))
    .filter((p) => p.date && Number.isFinite(p.value));

  return {
    id: `item_formulado:${item_formulado_id}`,
    label,
    unit,
    points,
  };
}

async function loadOfertaCostoSnapshotSeries(oferta_id: number, label: string): Promise<PriceSeries> {
  const sql = db();

  const r: any = await sql.query(
    `
      select
        created_at::date::text as date,
        total_costo_ars::float8 as value
      from app.producto_oferta_costo_snapshot
      where oferta_id = $1
      order by created_at asc, snapshot_id asc;
    `,
    [oferta_id]
  );
  const rows = normalizeQueryResult(r);

  const points: PricePoint[] = rows
    .map((x: any) => ({ date: String(x.date ?? ""), value: Number(x.value) }))
    .filter((p) => p.date && Number.isFinite(p.value));

  return {
    id: `oferta:${oferta_id}`,
    label,
    unit: "ARS",
    points,
  };
}

async function listPresentacionesForProducto(producto_id: number): Promise<Array<{ oferta_id: number; nombre: string }>> {
  const sql = db();
  const r: any = await sql.query(
    `
      select oferta_id, nombre
      from app.producto_oferta
      where producto_id = $1
        and activo = true
        and is_bulk = false
      order by oferta_id asc;
    `,
    [producto_id]
  );
  const rows = normalizeQueryResult(r);
  return rows
    .map((x: any) => ({ oferta_id: Number(x.oferta_id), nombre: String(x.nombre ?? "") }))
    .filter((x) => Number.isFinite(x.oferta_id) && x.oferta_id > 0);
}

/**
 * Historial unificado para items formulados (bulk + presentaciones).
 * Nota: si el id no es item_formulado, devuelve null (para permitir fallback proveedor).
 */
export async function getPriceHistoryForItemFormulado(id: number): Promise<PriceHistoryResponse | null> {
  const meta = await tryGetItemFormuladoMeta(id);
  if (!meta) return null;

  const series: PriceSeries[] = [];

  const producto_id = meta.producto_id;

  // Siempre intentamos incluir el bulk si existe.
  if (producto_id) {
    const bulkId = await getBulkItemFormuladoIdForProducto(producto_id);
    if (bulkId) {
      series.push(await loadItemFormuladoSnapshotSeries(bulkId, "Bulk", "ARS/kg"));
    }
  }

  // Si este item_formulado es una presentación concreta, incluimos solo esa (y el bulk si lo pudimos resolver).
  if (meta.tipo === "PRESENTACION" && meta.oferta_id) {
    series.push(await loadOfertaCostoSnapshotSeries(meta.oferta_id, "Presentación"));
    return { item_id: id, kind: "FORMULADO", series };
  }

  // Si es bulk, incluimos todas las presentaciones del producto.
  if (meta.tipo === "BULK" && producto_id) {
    const pres = await listPresentacionesForProducto(producto_id);
    for (const p of pres) {
      series.push(await loadOfertaCostoSnapshotSeries(p.oferta_id, p.nombre || `Oferta ${p.oferta_id}`));
    }
    return { item_id: id, kind: "FORMULADO", series };
  }

  // Tipo desconocido: devolvemos lo que haya.
  return { item_id: id, kind: "FORMULADO", series };
}