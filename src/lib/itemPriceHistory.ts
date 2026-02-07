import { db } from "@/lib/db";

export type PricePoint = { date: string; value: number };

export type PriceSeries = {
  id: string;
  label: string;
  unit: "ARS" | "ARS/kg" | "ARS/L" | "ARS/u";
  points: PricePoint[];
};

export type PriceHistoryResponse = {
  item_key: string;
  kind: "PROVEEDOR" | "FORMULADO";
  rows?: Array<{ as_of_date: string; presentacion: number; price_ars: number }>;
  series?: PriceSeries[];
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

export async function getProveedorPriceHistory(item_id: number): Promise<PriceHistoryResponse> {
  const sql = db();
  const q: any = await sql.query(
    `
      select
        as_of_date::text as as_of_date,
        presentacion::float8 as presentacion,
        price_ars::float8 as price_ars
      from app.item_price_daily_pres
      where item_id = $1
      order by as_of_date asc, presentacion asc;
    `,
    [item_id]
  );

  return {
    item_key: `p:${item_id}`,
    kind: "PROVEEDOR",
    rows: normalizeQueryResult(q),
  };
}

async function getItemFormuladoMeta(item_formulado_id: number): Promise<null | { tipo: string; producto_id: number | null; oferta_id: number | null }> {
  const sql = db();
  const r: any = await sql.query(
    `
      select tipo, producto_id, oferta_id
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

  const points = normalizeQueryResult(r)
    .map((x: any) => ({ date: String(x.date ?? ""), value: Number(x.value) }))
    .filter((p: any) => p.date && Number.isFinite(p.value));

  return {
    id: `f:${item_formulado_id}:snap`,
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

  const points = normalizeQueryResult(r)
    .map((x: any) => ({ date: String(x.date ?? ""), value: Number(x.value) }))
    .filter((p: any) => p.date && Number.isFinite(p.value));

  return {
    id: `oferta:${oferta_id}:snap`,
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

  return normalizeQueryResult(r)
    .map((x: any) => ({ oferta_id: Number(x.oferta_id), nombre: String(x.nombre ?? "") }))
    .filter((x: any) => Number.isFinite(x.oferta_id) && x.oferta_id > 0);
}

export async function getFormuladoPriceHistory(item_formulado_id: number): Promise<PriceHistoryResponse> {
  const meta = await getItemFormuladoMeta(item_formulado_id);
  if (!meta) {
    return { item_key: `f:${item_formulado_id}`, kind: "FORMULADO", series: [] };
  }

  const series: PriceSeries[] = [];

  // incluir bulk (si se puede resolver por producto)
  if (meta.producto_id) {
    const bulkId = await getBulkItemFormuladoIdForProducto(meta.producto_id);
    if (bulkId) {
      series.push(await loadItemFormuladoSnapshotSeries(bulkId, "Bulk", "ARS/kg"));
    }
  }

  if (meta.tipo === "PRESENTACION" && meta.oferta_id) {
    series.push(await loadOfertaCostoSnapshotSeries(meta.oferta_id, "Presentación"));
    return { item_key: `f:${item_formulado_id}`, kind: "FORMULADO", series };
  }

  if (meta.tipo === "BULK" && meta.producto_id) {
    const pres = await listPresentacionesForProducto(meta.producto_id);
    for (const p of pres) {
      series.push(await loadOfertaCostoSnapshotSeries(p.oferta_id, p.nombre || `Oferta ${p.oferta_id}`));
    }
    return { item_key: `f:${item_formulado_id}`, kind: "FORMULADO", series };
  }

  return { item_key: `f:${item_formulado_id}`, kind: "FORMULADO", series };
}