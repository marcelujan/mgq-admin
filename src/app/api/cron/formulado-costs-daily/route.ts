// cron/formulado-costs-daily/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

function assertCronAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    const err: any = new Error("unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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
  client: PoolClient,
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

    // Asunción actual: presentacion = gramos del pack
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
    return { ok: true, arsPorG: bc.ars_por_kg / 1000 };
  }

  return { ok: false, err: "tipo no soportado" };
}

/**
 * Replica de la lógica de /api/productos/[producto_id]/costo-bulk,
 * usada por el cron para persistir snapshots diarios de BULK.
 *
 * Dependencias:
 * - item_price_daily_pres (fuente PROVEEDOR)
 * - cost_option (MANUAL_PRESENTACION)
 * - producto_costos_produccion (costo prod fijo/variable)
 * - producto_formula_v2 + producto_formula_linea_v2 (materiales)
 */
async function computeBulkCost(client: PoolClient, producto_id: number, stack: number[], depth: number): Promise<BulkCost> {
  if (depth > 10) throw new Error("bulk: profundidad máxima excedida");
  if (stack.includes(producto_id)) throw new Error("bulk: ciclo detectado");
  const nextStack = [...stack, producto_id];

  const fRes = await client.query(
    `SELECT producto_id, lote_ref_g
     FROM app.producto_formula_v2
     WHERE producto_id=$1`,
    [producto_id]
  );
  const lote_ref_g = fRes.rows?.[0]?.lote_ref_g ? Number(fRes.rows[0].lote_ref_g) : 1000;
  if (!Number.isFinite(lote_ref_g) || lote_ref_g <= 0) throw new Error("lote_ref_g inválido");

  const lRes = await client.query(
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

  const lineas: Linea[] = (lRes.rows ?? []).map((r: any) => ({
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

    const r = await client.query(
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

    for (const row of r.rows ?? []) {
      itemPriceByKey.set(keyItem(Number(row.item_id), Number(row.presentacion)), Number(row.price_ars));
    }
  }

  const bulkResolver = async (bulk_producto_id: number) => {
    return await computeBulkCost(client, bulk_producto_id, nextStack, depth + 1);
  };

  let totalMaterialARS = 0;

  for (const l of lineas) {
    const pct = l.is_csp ? pctCsp : l.pct_peso;
    if (pct === null || pct === undefined) throw new Error(`línea ${l.linea_id}: falta % p/p`);
    const masa_g = (lote_ref_g * pct) / 100;

    const arsG = await arsPorGramoDeLinea(client, l, itemPriceByKey, bulkResolver);
    if (!arsG.ok) throw new Error(`línea ${l.linea_id}: ${arsG.err}`);

    totalMaterialARS += masa_g * arsG.arsPorG;
  }

  const material_ars_por_kg = (totalMaterialARS / lote_ref_g) * 1000;

  const cRes = await client.query(
    `SELECT lote_ref_kg, costo_fijo_por_lote_ars, costo_variable_por_kg_ars
     FROM app.producto_costos_produccion
     WHERE producto_id=$1`,
    [producto_id]
  );
  const c = cRes.rows?.[0] ?? null;

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

async function run() {
  const started = Date.now();
  const client = await pool.connect();

  try {
    const d0 = await client.query<{ d: string }>(`select current_date::text as d;`);
    const asOfDate = d0.rows[0]?.d;

    // Productos con fórmula v2 + BULK activo (según dominio, 0/1 por producto).
    const rProd = await client.query(
      `
      SELECT f.producto_id, i.item_formulado_id
      FROM app.producto_formula_v2 f
      JOIN app.item_formulado i
        ON i.producto_id = f.producto_id
       AND i.tipo = 'BULK'
       AND i.activo = true
      ORDER BY f.producto_id ASC
      `
    );

    const errors: Array<{ producto_id: number; item_formulado_id: number; error: string }> = [];
    let ok = 0;

    for (const row of rProd.rows ?? []) {
      const producto_id = Number(row.producto_id);
      const item_formulado_id = Number(row.item_formulado_id);
      if (!Number.isFinite(producto_id) || !Number.isFinite(item_formulado_id)) continue;

      try {
        const bc = await computeBulkCost(client, producto_id, [], 0);

        // Persistir snapshot diario (idempotente por (item_formulado_id, as_of_date))
        await client.query(
          `
          insert into app.item_formulado_snapshot
            (item_formulado_id, as_of_date, precio_unitario_ars, fuente, created_at)
          values
            ($1, $2::date, $3::float8, 'CRON'::text, now())
          on conflict (item_formulado_id, as_of_date)
          do update set
            precio_unitario_ars = excluded.precio_unitario_ars,
            fuente = excluded.fuente,
            created_at = excluded.created_at
          `,
          [item_formulado_id, asOfDate, bc.ars_por_kg]
        );

        ok++;
      } catch (e: any) {
        errors.push({
          producto_id,
          item_formulado_id,
          error: String(e?.message ?? e ?? "error"),
        });
      }
    }

    return {
      ok: true,
      as_of_date: asOfDate,
      productos_total: (rProd.rows ?? []).length,
      productos_ok: ok,
      productos_error: errors.length,
      errors,
      time_ms: Date.now() - started,
    };
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCronAuth(req);
    const payload = await run();
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: e?.statusCode ?? 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
