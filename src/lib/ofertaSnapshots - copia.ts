import { db } from "@/lib/db";

// Local helpers (avoid depending on "@/lib/api")
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
  | "FORMULA_V2_SAVE"
  | "FORMULA_LINEA_CREATE"
  | "FORMULA_LINEA_PATCH"
  | "FORMULA_LINEA_DELETE"
  | "COST_OPTION_DENS_PATCH"
  | "PACKAGING_ADD"
  | "PACKAGING_PATCH"
  | "PACKAGING_DELETE"
  | "AUTO_OFFER_COST";

type OfertaRow = {
  oferta_id: number;
  producto_id: number;
  densidad_override_g_ml: number | null;
  peso_neto_g: number | null;
  volumen_neto_ml: number | null;
  unidades_pack: number | null;
  masa_por_unidad_g: number | null;
  volumen_por_unidad_ml: number | null;
};

type OfertaCalc = {
  oferta_id: number;
  bulk_ars_kg_con_prod: number | null;
  densidad_usada_g_ml: number | null;
  masa_total_g: number | null;
  base_costo_ars: number | null;
  packaging_costo_ars: number | null;
  total_costo_ars: number | null;
  packaging_rows: Array<{
    packaging_item_id: number | null;
    nombre: string;
    cantidad: number;
    costo_unitario_ars: number;
    subtotal_ars: number;
  }>;
};

async function fetchJSON(origin: string, path: string): Promise<any> {
  const r = await fetch(`${origin}${path}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({} as any));
  if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status} ${path}`);
  return j;
}

async function loadOfertaFromDB(oferta_id: number): Promise<OfertaRow> {
  const sql = db();
  const r: any = await sql.query(
    `
    SELECT
      oferta_id,
      producto_id,
      densidad_override_g_ml::float8 as densidad_override_g_ml,
      peso_neto_g::float8 as peso_neto_g,
      volumen_neto_ml::float8 as volumen_neto_ml,
      unidades_pack::float8 as unidades_pack,
      masa_por_unidad_g::float8 as masa_por_unidad_g,
      volumen_por_unidad_ml::float8 as volumen_por_unidad_ml
    FROM app.producto_oferta
    WHERE oferta_id = $1
    `,
    [oferta_id]
  );

  const row = normalizeQueryResult(r)?.[0];
  if (!row) throw new Error("oferta no encontrada");
  const producto_id = Number(row.producto_id);
  if (!Number.isFinite(producto_id)) throw new Error("oferta.producto_id inválido");

  return {
    oferta_id: Number(row.oferta_id),
    producto_id,
    densidad_override_g_ml: numOrNull(row.densidad_override_g_ml),
    peso_neto_g: numOrNull(row.peso_neto_g),
    volumen_neto_ml: numOrNull(row.volumen_neto_ml),
    unidades_pack: numOrNull(row.unidades_pack),
    masa_por_unidad_g: numOrNull(row.masa_por_unidad_g),
    volumen_por_unidad_ml: numOrNull(row.volumen_por_unidad_ml),
  };
}

async function loadProductoDensidadFromDB(producto_id: number): Promise<number | null> {
  const sql = db();
  const r: any = await sql.query(
    `SELECT densidad_producto_g_ml::float8 as densidad_producto_g_ml FROM app.producto WHERE producto_id = $1`,
    [producto_id]
  );
  const row = normalizeQueryResult(r)?.[0];
  return numOrNull(row?.densidad_producto_g_ml);
}

async function computeOfertaCost(args: { oferta_id: number; origin: string }): Promise<OfertaCalc> {
  const { oferta_id, origin } = args;

  const oferta = await loadOfertaFromDB(oferta_id);
  const densProd = await loadProductoDensidadFromDB(oferta.producto_id);

  // bulk cost: use existing endpoint (source of truth for formula)
  const bulkJ = await fetchJSON(origin, `/api/productos/${oferta.producto_id}/costo-bulk`);
  const bulk_ars_kg_con_prod = numOrNull(bulkJ.ars_por_kg_con_prod ?? bulkJ.ars_por_kg ?? null);

  const densidad_usada_g_ml = oferta.densidad_override_g_ml ?? densProd;

  let masa_total_g: number | null = null;

  if (oferta.peso_neto_g !== null && oferta.peso_neto_g > 0) {
    masa_total_g = oferta.peso_neto_g;
  } else if (oferta.volumen_neto_ml !== null && oferta.volumen_neto_ml > 0) {
    if (densidad_usada_g_ml !== null && densidad_usada_g_ml > 0) masa_total_g = oferta.volumen_neto_ml * densidad_usada_g_ml;
  } else if (oferta.unidades_pack !== null && oferta.unidades_pack > 0 && oferta.masa_por_unidad_g !== null && oferta.masa_por_unidad_g > 0) {
    masa_total_g = oferta.unidades_pack * oferta.masa_por_unidad_g;
  } else if (oferta.unidades_pack !== null && oferta.unidades_pack > 0 && oferta.volumen_por_unidad_ml !== null && oferta.volumen_por_unidad_ml > 0) {
    if (densidad_usada_g_ml !== null && densidad_usada_g_ml > 0) {
      masa_total_g = oferta.unidades_pack * oferta.volumen_por_unidad_ml * densidad_usada_g_ml;
    }
  }

  const base_costo_ars =
    bulk_ars_kg_con_prod !== null && masa_total_g !== null ? (bulk_ars_kg_con_prod * masa_total_g) / 1000 : null;

  // packaging: use existing endpoint (already joins and resolves overrides)
  const packJ = await fetchJSON(origin, `/api/productos/ofertas/${oferta_id}/packaging`);
  const packRows = (packJ.rows || []) as any[];

  const packaging_rows: OfertaCalc["packaging_rows"] = [];
  let packaging_costo_ars = 0;

  for (const r of packRows) {
    const cantidad = numOrNull(r.cantidad) ?? 0;
    const unit = numOrNull(r.costo_unitario_override_ars) ?? numOrNull(r.costo_unitario_ars) ?? 0;
    const subtotal = cantidad * unit;

    const nombre = String(r.nombre ?? "").trim() || `packaging ${r.packaging_item_id ?? ""}`;

    packaging_rows.push({
      packaging_item_id: numOrNull(r.packaging_item_id),
      nombre,
      cantidad,
      costo_unitario_ars: unit,
      subtotal_ars: subtotal,
    });

    packaging_costo_ars += subtotal;
  }

  const total_costo_ars = base_costo_ars === null ? null : base_costo_ars + packaging_costo_ars;

  return {
    oferta_id,
    bulk_ars_kg_con_prod,
    densidad_usada_g_ml,
    masa_total_g,
    base_costo_ars,
    packaging_costo_ars,
    total_costo_ars,
    packaging_rows,
  };
}

export async function recalcAndInsertOfertaSnapshot(args: { oferta_id: number; fuente: SnapshotFuente; origin: string }): Promise<number> {
  const { oferta_id, origin } = args;
  if (!Number.isFinite(oferta_id)) throw new Error("oferta_id inválido");
  if (!origin) throw new Error("origin requerido");

  const calc = await computeOfertaCost({ oferta_id, origin });

  const sql = db();
  await sql.query("BEGIN");

  try {
    const headRes: any = await sql.query(
      `
      INSERT INTO app.producto_oferta_costo_snapshot
        (oferta_id, bulk_ars_kg_con_prod, masa_total_g, base_costo_ars, packaging_costo_ars, total_costo_ars, densidad_usada_g_ml)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING snapshot_id
      `,
      [
        oferta_id,
        calc.bulk_ars_kg_con_prod,
        calc.masa_total_g,
        calc.base_costo_ars,
        calc.packaging_costo_ars,
        calc.total_costo_ars,
        calc.densidad_usada_g_ml,
      ]
    );

    const snapshot_id = Number(normalizeQueryResult(headRes)?.[0]?.snapshot_id);
    if (!Number.isFinite(snapshot_id)) throw new Error("snapshot_id inválido");

    for (const p of calc.packaging_rows) {
      const nombre = String(p.nombre ?? "").trim();
      if (!nombre) continue;

      await sql.query(
        `
        INSERT INTO app.producto_oferta_costo_snapshot_packaging
          (snapshot_id, packaging_item_id, nombre, cantidad, costo_unitario_ars, subtotal_ars)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [snapshot_id, p.packaging_item_id, nombre, p.cantidad, p.costo_unitario_ars, p.subtotal_ars]
      );
    }

    await sql.query("COMMIT");
    return snapshot_id;
  } catch (e) {
    try {
      await sql.query("ROLLBACK");
    } catch {}
    throw e;
  }
}

// Convenience alias used by some route handlers
export async function createAutoOfertaCostoSnapshot(args: { oferta_id: number; origin: string }): Promise<number> {
  return recalcAndInsertOfertaSnapshot({ oferta_id: args.oferta_id, origin: args.origin, fuente: "AUTO_OFFER_COST" });
}

// Recalculate snapshots for all offers of a product (used after formula/cost changes)
export async function recalcAndInsertSnapshotsForProducto(args: { producto_id: number; fuente: SnapshotFuente; origin: string }): Promise<{ ok: true; count: number }> {
  const { producto_id, fuente, origin } = args;
  if (!Number.isFinite(producto_id)) throw new Error("producto_id inválido");
  if (!origin) throw new Error("origin requerido");

  const sql = db();
  const ofertasRes: any = await sql.query(`SELECT oferta_id FROM app.producto_oferta WHERE producto_id = $1 ORDER BY oferta_id ASC`, [producto_id]);
  const ofertas = normalizeQueryResult(ofertasRes).map((r) => Number(r.oferta_id)).filter((x) => Number.isFinite(x));

  let count = 0;
  for (const oferta_id of ofertas) {
    await recalcAndInsertOfertaSnapshot({ oferta_id, fuente, origin });
    count++;
  }

  return { ok: true, count };
}