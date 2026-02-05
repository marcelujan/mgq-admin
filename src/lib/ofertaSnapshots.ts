// src/lib/ofertaSnapshots.ts
import { db } from "@/lib/db";
import { normalizeQueryResult, numOrNull } from "@/lib/api";

type TipoLinea = "ITEM_PRESENTACION" | "MANUAL_PRESENTACION" | "BULK_PRODUCTO";

function asTipo(v: any): TipoLinea {
  const s = String(v ?? "");
  if (s === "ITEM_PRESENTACION" || s === "MANUAL_PRESENTACION" || s === "BULK_PRODUCTO") return s;
  throw new Error(`tipo cost_option inválido: ${s}`);
}

type Linea = {
  linea_id: number;
  cost_option_id: number;
  pct_peso: number | null;
  is_csp: boolean;

  tipo: TipoLinea;
  item_id: number | null;
  item_presentacion: number | null;

  manual_uom: "GR" | "ML" | "UN" | null;
  manual_cantidad: number | null;
  manual_costo_ars: number | null;

  bulk_producto_id: number | null;

  densidad_g_ml: number | null;
};

type BulkCost = {
  ars_por_kg: number;
  ars_por_g: number;
  lote_ref_g: number;
  prod_ars_por_kg: number;
  material_ars_por_kg: number;
};

function keyItem(item_id: number, pres: number) {
  return `${item_id}::${pres}`;
}

async function arsPorGramoDeLinea(
  sql: any,
  linea: Linea,
  itemPriceByKey: Map<string, number>,
  bulkResolver: (bulk_producto_id: number) => Promise<BulkCost>
): Promise<{ ok: true; arsPorG: number } | { ok: false; err: string }> {
  if (linea.tipo === "ITEM_PRESENTACION") {
    const item_id = linea.item_id ?? null;
    const pres = linea.item_presentacion ?? null;
    if (!item_id || !pres || pres <= 0) return { ok: false, err: "item/presentación inválidos" };

    const price = itemPriceByKey.get(keyItem(item_id, pres));
    if (price === undefined) return { ok: false, err: "precio job no encontrado" };

    // presentacion = gramos
    return { ok: true, arsPorG: price / pres };
  }

  if (linea.tipo === "MANUAL_PRESENTACION") {
    const u = linea.manual_uom ?? null;
    const qty = linea.manual_cantidad ?? null;
    const costo = linea.manual_costo_ars ?? null;

    if (!u || !qty || qty <= 0) return { ok: false, err: "manual: falta uom/cantidad" };
    if (costo === null || costo < 0) return { ok: false, err: "manual: falta costo" };

    if (u === "GR") return { ok: true, arsPorG: costo / qty };

    if (u === "ML") {
      const dens = linea.densidad_g_ml ?? null;
      if (!dens || dens <= 0) return { ok: false, err: "manual: falta densidad (ML→GR)" };
      const gramos = qty * dens;
      if (gramos <= 0) return { ok: false, err: "manual: conversión inválida" };
      return { ok: true, arsPorG: costo / gramos };
    }

    if (u === "UN") return { ok: false, err: "manual: UN no convertible a gramos" };
    return { ok: false, err: "manual: uom inválida" };
  }

  if (linea.tipo === "BULK_PRODUCTO") {
    const bp = linea.bulk_producto_id ?? null;
    if (!bp) return { ok: false, err: "bulk_producto_id faltante" };
    const bc = await bulkResolver(bp);
    const arsKg = Number(bc.ars_por_kg);
    if (!Number.isFinite(arsKg)) return { ok: false, err: "bulk: ars_por_kg inválido" };
    return { ok: true, arsPorG: arsKg / 1000 };
  }

  return { ok: false, err: "tipo no soportado" };
}

async function computeBulkCost(sql: any, producto_id: number, stack: number[], depth: number): Promise<BulkCost> {
  if (depth > 10) throw new Error("bulk: profundidad máxima excedida");
  if (stack.includes(producto_id)) throw new Error("bulk: ciclo detectado");
  const nextStack = [...stack, producto_id];

  const fRes: any = await sql.query(
    `SELECT producto_id, lote_ref_g
     FROM app.producto_formula_v2
     WHERE producto_id=$1`,
    [producto_id]
  );
  const fRows = normalizeQueryResult(fRes);
  const lote_ref_g = fRows?.[0]?.lote_ref_g ? Number(fRows[0].lote_ref_g) : 1000;
  if (!Number.isFinite(lote_ref_g) || lote_ref_g <= 0) throw new Error("lote_ref_g inválido");

  const lRes: any = await sql.query(
    `
    SELECT
      l.linea_id,
      l.cost_option_id,
      l.pct_peso,
      l.is_csp,
      co.tipo,
      co.item_id,
      co.item_presentacion,
      co.manual_uom,
      co.manual_cantidad,
      co.manual_costo_ars,
      co.bulk_producto_id,
      co.densidad_g_ml
    FROM app.producto_formula_linea_v2 l
    JOIN app.cost_option co ON co.cost_option_id = l.cost_option_id
    WHERE l.producto_id=$1
    ORDER BY l.orden ASC, l.linea_id ASC
    `,
    [producto_id]
  );

  const lineas: Linea[] = normalizeQueryResult(lRes).map((r: any) => ({
    linea_id: Number(r.linea_id),
    cost_option_id: Number(r.cost_option_id),
    pct_peso: numOrNull(r.pct_peso),
    is_csp: !!r.is_csp,

    tipo: asTipo(r.tipo),

    item_id: r.item_id === null ? null : Number(r.item_id),
    item_presentacion: r.item_presentacion === null ? null : Number(r.item_presentacion),

    manual_uom: (r.manual_uom ?? null) as "GR" | "ML" | "UN" | null,
    manual_cantidad: numOrNull(r.manual_cantidad),
    manual_costo_ars: numOrNull(r.manual_costo_ars),

    bulk_producto_id: r.bulk_producto_id === null ? null : Number(r.bulk_producto_id),

    densidad_g_ml: numOrNull(r.densidad_g_ml),
  }));

  const csp = lineas.filter((x) => x.is_csp);
  if (csp.length > 1) throw new Error("CSP: más de una línea marcada");
  const pctFijos = lineas.filter((x) => !x.is_csp).reduce((acc, x) => acc + (x.pct_peso ?? 0), 0);
  const pctCsp = csp.length === 1 ? 100 - pctFijos : null;
  if (pctCsp !== null && pctCsp < 0) throw new Error("CSP negativo: fijos > 100%");

  const itemPairs = lineas
    .filter((l) => l.tipo === "ITEM_PRESENTACION" && l.item_id && l.item_presentacion)
    .map((l) => ({ item_id: l.item_id as number, pres: l.item_presentacion as number }));

  const itemPriceByKey = new Map<string, number>();

  if (itemPairs.length) {
    const ids = [...new Set(itemPairs.map((x) => x.item_id))];
    const pres = [...new Set(itemPairs.map((x) => x.pres))];

    const r: any = await sql.query(
      `
      WITH last_rows AS (
        SELECT item_id, presentacion, max(as_of_date) as max_date
        FROM app.item_price_daily_pres
        WHERE item_id = ANY($1) AND presentacion = ANY($2)
        GROUP BY item_id, presentacion
      )
      SELECT lr.item_id, lr.presentacion::float8 as presentacion, ip.price_ars::float8 as price_ars
      FROM last_rows lr
      JOIN app.item_price_daily_pres ip
        ON ip.item_id = lr.item_id AND ip.presentacion = lr.presentacion AND ip.as_of_date = lr.max_date
      `,
      [ids, pres]
    );
    for (const row of normalizeQueryResult(r)) {
      itemPriceByKey.set(keyItem(Number(row.item_id), Number(row.presentacion)), Number(row.price_ars));
    }
  }

  const bulkResolver = async (bulk_producto_id: number) => {
    return await computeBulkCost(sql, bulk_producto_id, nextStack, depth + 1);
  };

  let totalMaterialARS = 0;

  for (const l of lineas) {
    const pct = l.is_csp ? pctCsp : l.pct_peso;
    if (pct === null || pct === undefined) throw new Error(`línea ${l.linea_id}: falta % p/p`);
    const masa_g = (lote_ref_g * pct) / 100;

    const arsG = await arsPorGramoDeLinea(sql, l, itemPriceByKey, bulkResolver);
    if (!arsG.ok) throw new Error(`línea ${l.linea_id}: ${arsG.err}`);

    totalMaterialARS += masa_g * arsG.arsPorG;
  }

  const material_ars_por_kg = (totalMaterialARS / lote_ref_g) * 1000;

  const cRes: any = await sql.query(
    `SELECT lote_ref_kg, costo_fijo_por_lote_ars, costo_variable_por_kg_ars
     FROM app.producto_costos_produccion
     WHERE producto_id=$1`,
    [producto_id]
  );
  const cRows = normalizeQueryResult(cRes);
  const c = cRows[0] ?? null;

  const lote_ref_kg = c ? numOrNull(c.lote_ref_kg) : null;
  const fijo = c ? numOrNull(c.costo_fijo_por_lote_ars) : null;
  const variable = c ? numOrNull(c.costo_variable_por_kg_ars) : null;

  let prod_ars_por_kg = 0;
  if (variable !== null) prod_ars_por_kg += variable;
  if (lote_ref_kg && fijo !== null) prod_ars_por_kg += fijo / lote_ref_kg;

  const ars_por_kg = material_ars_por_kg + prod_ars_por_kg;

  return {
    ars_por_kg,
    ars_por_g: ars_por_kg / 1000,
    lote_ref_g,
    prod_ars_por_kg,
    material_ars_por_kg,
  };
}

function computeMasaTotalG(params: {
  peso_neto_g: number | null;
  volumen_neto_ml: number | null;
  unidades_pack: number | null;
  masa_por_unidad_g: number | null;
  volumen_por_unidad_ml: number | null;
  densidad_g_ml: number | null;
}): { masa_total_g: number | null } {
  const peso_neto_g = params.peso_neto_g;
  const volumen_neto_ml = params.volumen_neto_ml;
  const unidades_pack = params.unidades_pack;
  const masa_por_unidad_g = params.masa_por_unidad_g;
  const volumen_por_unidad_ml = params.volumen_por_unidad_ml;
  const dens = params.densidad_g_ml;

  let masaTotalG: number | null = null;
  let volTotalML: number | null = null;

  if (peso_neto_g !== null && peso_neto_g > 0) {
    masaTotalG = peso_neto_g;
  } else if (volumen_neto_ml !== null && volumen_neto_ml > 0) {
    volTotalML = volumen_neto_ml;
    if (dens !== null && dens > 0) masaTotalG = volTotalML * dens;
  } else if (unidades_pack !== null && unidades_pack > 0 && masa_por_unidad_g !== null && masa_por_unidad_g > 0) {
    masaTotalG = unidades_pack * masa_por_unidad_g;
  } else if (unidades_pack !== null && unidades_pack > 0 && volumen_por_unidad_ml !== null && volumen_por_unidad_ml > 0) {
    volTotalML = unidades_pack * volumen_por_unidad_ml;
    if (dens !== null && dens > 0) masaTotalG = volTotalML * dens;
  }

  return { masa_total_g: masaTotalG };
}

export async function recalcAndInsertSnapshotsForProducto(producto_id: number) {
  const sql = db();

  if (!Number.isFinite(producto_id)) throw new Error("producto_id inválido");

  // densidad producto (fallback para ofertas por volumen)
  const pRes: any = await sql.query(`SELECT densidad_producto_g_ml::float8 as dens FROM app.producto WHERE producto_id=$1`, [
    producto_id,
  ]);
  const pRow = normalizeQueryResult(pRes)?.[0] ?? null;
  const densProd = pRow ? numOrNull(pRow.dens) : null;

  // costo bulk del producto (ARS/kg con prod)
  const bulk = await computeBulkCost(sql, producto_id, [], 0);
  const bulk_ars_kg_con_prod = Number(bulk.ars_por_kg);
  if (!Number.isFinite(bulk_ars_kg_con_prod)) throw new Error("bulk ars_por_kg inválido");

  // ofertas del producto
  const oRes: any = await sql.query(
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
    WHERE producto_id=$1
    `,
    [producto_id]
  );
  const ofertas = normalizeQueryResult(oRes).map((r: any) => ({
    oferta_id: Number(r.oferta_id),
    densidad_override_g_ml: numOrNull(r.densidad_override_g_ml),
    peso_neto_g: numOrNull(r.peso_neto_g),
    volumen_neto_ml: numOrNull(r.volumen_neto_ml),
    unidades_pack: numOrNull(r.unidades_pack),
    masa_por_unidad_g: numOrNull(r.masa_por_unidad_g),
    volumen_por_unidad_ml: numOrNull(r.volumen_por_unidad_ml),
  }));

  const inserted: { oferta_id: number; snapshot_id: number }[] = [];

  await sql.query("BEGIN");
  try {
    for (const o of ofertas) {
      const dens = o.densidad_override_g_ml ?? densProd ?? null;

      const { masa_total_g } = computeMasaTotalG({
        peso_neto_g: o.peso_neto_g,
        volumen_neto_ml: o.volumen_neto_ml,
        unidades_pack: o.unidades_pack,
        masa_por_unidad_g: o.masa_por_unidad_g,
        volumen_por_unidad_ml: o.volumen_por_unidad_ml,
        densidad_g_ml: dens,
      });

      const base_costo_ars =
        masa_total_g !== null ? (Number(bulk_ars_kg_con_prod) * Number(masa_total_g)) / 1000 : null;

      // packaging rows
      const pkRes: any = await sql.query(
        `
        SELECT
          op.packaging_item_id,
          pi.nombre,
          op.cantidad::float8 as cantidad,
          op.costo_unitario_override_ars::float8 as override_ars,
          pi.costo_unitario_ars::float8 as base_ars
        FROM app.producto_oferta_packaging op
        JOIN app.packaging_item pi ON pi.packaging_item_id = op.packaging_item_id
        WHERE op.oferta_id = $1
        ORDER BY pi.nombre ASC, op.oferta_packaging_id ASC
        `,
        [o.oferta_id]
      );

      const pkRows = normalizeQueryResult(pkRes).map((r: any) => {
        const cantidad = Number(r.cantidad ?? 0);
        const unit = numOrNull(r.override_ars) ?? numOrNull(r.base_ars) ?? 0;
        const subtotal = cantidad * unit;
        return {
          packaging_item_id: Number(r.packaging_item_id),
          nombre: String(r.nombre ?? ""),
          cantidad,
          costo_unitario_ars: unit,
          subtotal_ars: subtotal,
        };
      });

      const packaging_costo_ars = pkRows.reduce((acc: number, x: any) => acc + Number(x.subtotal_ars ?? 0), 0);
      const total_costo_ars = base_costo_ars === null ? null : Number(base_costo_ars) + Number(packaging_costo_ars);

      const snapRes: any = await sql.query(
        `
        INSERT INTO app.producto_oferta_costo_snapshot
          (oferta_id, bulk_ars_kg_con_prod, masa_total_g, base_costo_ars, packaging_costo_ars, total_costo_ars, densidad_usada_g_ml)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING snapshot_id
        `,
        [
          o.oferta_id,
          bulk_ars_kg_con_prod,
          masa_total_g,
          base_costo_ars,
          packaging_costo_ars,
          total_costo_ars,
          dens,
        ]
      );

      const snapshot_id = Number(normalizeQueryResult(snapRes)?.[0]?.snapshot_id);
      if (!Number.isFinite(snapshot_id)) throw new Error("snapshot_id inválido");

      for (const p of pkRows) {
        if (!p.nombre) continue;
        if (!Number.isFinite(p.cantidad) || p.cantidad <= 0) continue;

        await sql.query(
          `
          INSERT INTO app.producto_oferta_costo_snapshot_packaging
            (snapshot_id, packaging_item_id, nombre, cantidad, costo_unitario_ars, subtotal_ars)
          VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [snapshot_id, p.packaging_item_id, p.nombre, p.cantidad, p.costo_unitario_ars, p.subtotal_ars]
        );
      }

      inserted.push({ oferta_id: o.oferta_id, snapshot_id });
    }

    await sql.query("COMMIT");
    return { ok: true as const, producto_id, inserted_count: inserted.length, inserted };
  } catch (e) {
    await sql.query("ROLLBACK");
    throw e;
  }
}