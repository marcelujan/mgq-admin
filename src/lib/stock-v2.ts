import { db } from "@/lib/db";

export type StockItemTipo = "PROVEEDOR" | "MANUAL" | "FORMULADO" | "ENVASE" | "ETIQUETA" | "PAQUETERIA";
export type StockOperacionTipo = "INGRESO" | "VENTA" | "PRODUCCION" | "AJUSTE";

export type StockObjetivoRow = {
  item_tipo: StockItemTipo;
  item_ref_id: number;
  nombre: string;
  label: string;
  uom: string | null;
  cantidad_referencia: number | null;
  costo_ref_ars: number | null;
  saldo: number | null;
  densidad_g_ml: number | null;
};

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export function isStockItemTipo(v: any): v is StockItemTipo {
  return ["PROVEEDOR", "MANUAL", "FORMULADO", "ENVASE", "ETIQUETA", "PAQUETERIA"].includes(String(v ?? "").trim().toUpperCase());
}

export function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function textOrNull(v: any): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

export function parseFechaOrNull(v: any): string | null {
  const s = textOrNull(v);
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export function intParam(v: string | null, def: number, lo: number, hi: number) {
  const n = v === null ? def : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function targetSpec(tipo: StockItemTipo) {
  switch (tipo) {
    case "PROVEEDOR":
      return { fkCol: "proveedor_item_id", table: "app.item_seguimiento", idCol: "item_id" };
    case "MANUAL":
      return { fkCol: "manual_cost_option_id", table: "app.cost_option", idCol: "cost_option_id" };
    case "FORMULADO":
      return { fkCol: "formulado_item_formulado_id", table: "app.item_formulado", idCol: "item_formulado_id" };
    case "ENVASE":
      return { fkCol: "item_envase_id", table: "app.item_envase", idCol: "item_envase_id" };
    case "ETIQUETA":
      return { fkCol: "item_etiqueta_id", table: "app.item_etiqueta", idCol: "item_etiqueta_id" };
    case "PAQUETERIA":
      return { fkCol: "item_paqueteria_id", table: "app.item_paqueteria", idCol: "item_paqueteria_id" };
  }
}

export async function ensureTargetExists(tipo: StockItemTipo, id: number) {
  const sql = db();
  const spec = targetSpec(tipo);
  const r: any = await sql.query(`SELECT ${spec.idCol} FROM ${spec.table} WHERE ${spec.idCol} = $1 LIMIT 1`, [id]);
  return !!rowsOf(r)[0];
}

export async function createStockOperacion(params: { tipo: StockOperacionTipo; fecha: string | null; nota: string | null; referencia_externa: string | null; }) {
  const sql = db();
  const r: any = await sql.query(
    `
    INSERT INTO app.stock_operacion (tipo, fecha, nota, referencia_externa)
    VALUES ($1, COALESCE($2::timestamptz, now()), $3, $4)
    RETURNING stock_operacion_id, tipo, fecha
    `,
    [params.tipo, params.fecha, params.nota, params.referencia_externa]
  );
  const row = rowsOf(r)[0] ?? null;
  return row ? { stock_operacion_id: Number(row.stock_operacion_id), tipo: row.tipo, fecha: row.fecha } : null;
}

export async function updateStockOperacionMeta(stock_operacion_id: number, params: { tipo: StockOperacionTipo; fecha: string | null; nota: string | null; referencia_externa: string | null; }) {
  const sql = db();
  await sql.query(
    `
    UPDATE app.stock_operacion
       SET tipo = $2,
           fecha = COALESCE($3::timestamptz, fecha),
           nota = $4,
           referencia_externa = $5,
           updated_at = now()
     WHERE stock_operacion_id = $1
    `,
    [stock_operacion_id, params.tipo, params.fecha, params.nota, params.referencia_externa]
  );
}

export async function clearStockMovimientos(stock_operacion_id: number) {
  const sql = db();
  await sql.query(`DELETE FROM app.stock_movimiento WHERE stock_operacion_id = $1`, [stock_operacion_id]);
}

export async function insertStockMovimiento(params: { stock_operacion_id: number; item_tipo: StockItemTipo; item_ref_id: number; delta_cantidad: number; nota?: string | null; }) {
  const sql = db();
  const spec = targetSpec(params.item_tipo);
  const values: any[] = [params.stock_operacion_id, params.delta_cantidad, params.nota ?? null, params.item_ref_id];
  const r: any = await sql.query(
    `
    INSERT INTO app.stock_movimiento (stock_operacion_id, delta_cantidad, nota, ${spec.fkCol})
    VALUES ($1, $2, $3, $4)
    RETURNING stock_movimiento_id
    `,
    values
  );
  const row = rowsOf(r)[0] ?? null;
  return row ? Number(row.stock_movimiento_id) : null;
}



export async function deleteStockOperacion(stock_operacion_id: number) {
  const sql = db();
  await sql.query(`DELETE FROM app.stock_operacion WHERE stock_operacion_id = $1`, [stock_operacion_id]);
}

export type StockOperacionListRow = {
  stock_operacion_id: number;
  tipo: string;
  fecha: string;
  nota: string | null;
  referencia_externa: string | null;
  movimientos_count: number;
  total_entradas: number;
  total_salidas: number;
};

export async function listStockOperaciones(params: { tipo: "" | StockOperacionTipo; search: string; fromDate: string; toDate: string; limit: number; }) {
  const sql = db();
  const r: any = await sql.query(
    `
    SELECT
      o.stock_operacion_id,
      o.tipo,
      o.fecha,
      o.nota,
      o.referencia_externa,
      COUNT(m.stock_movimiento_id)::int as movimientos_count,
      COALESCE(SUM(CASE WHEN m.delta_cantidad > 0 THEN m.delta_cantidad ELSE 0 END), 0)::float8 as total_entradas,
      COALESCE(SUM(CASE WHEN m.delta_cantidad < 0 THEN abs(m.delta_cantidad) ELSE 0 END), 0)::float8 as total_salidas
    FROM app.stock_operacion o
    LEFT JOIN app.stock_movimiento m ON m.stock_operacion_id = o.stock_operacion_id
    WHERE ($1::text = '' OR o.tipo = $1::text)
      AND ($2::text = '' OR o.stock_operacion_id::text ILIKE '%' || $2::text || '%' OR coalesce(o.nota,'') ILIKE '%' || $2::text || '%' OR coalesce(o.referencia_externa,'') ILIKE '%' || $2::text || '%')
      AND ($3::date IS NULL OR o.fecha::date >= $3::date)
      AND ($4::date IS NULL OR o.fecha::date <= $4::date)
    GROUP BY o.stock_operacion_id, o.tipo, o.fecha, o.nota, o.referencia_externa
    ORDER BY o.fecha DESC, o.stock_operacion_id DESC
    LIMIT $5
    `,
    [params.tipo, params.search, params.fromDate || null, params.toDate || null, params.limit]
  );
  return rowsOf(r) as StockOperacionListRow[];
}

export async function getStockObjetivoOne(tipo: StockItemTipo, item_ref_id: number): Promise<StockObjetivoRow | null> {
  const items = await listStockObjetivos(tipo, String(item_ref_id), 20);
  const found = items.find((x: any) => Number(x.item_ref_id) === Number(item_ref_id)) ?? null;
  return found as StockObjetivoRow | null;
}

export async function listStockObjetivos(tipo: StockItemTipo, search: string, limit: number) {
  const sql = db();
  if (tipo === "MANUAL") {
    const r: any = await sql.query(
      `
      SELECT
        'MANUAL'::text as item_tipo,
        co.cost_option_id::bigint as item_ref_id,
        coalesce(co.manual_nombre, 'Manual #' || co.cost_option_id::text) as nombre,
        trim(both ' ' from concat_ws(' · ', 'Manual', coalesce(co.manual_nombre,''), 'ID ' || co.cost_option_id::text)) as label,
        co.manual_uom as uom,
        co.manual_cantidad::float8 as cantidad_referencia,
        co.manual_costo_ars::float8 as costo_ref_ars,
        coalesce(s.saldo, 0)::float8 as saldo,
        co.densidad_g_ml::float8 as densidad_g_ml
      FROM app.cost_option co
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'MANUAL' AND s.item_ref_id = co.cost_option_id::text
      WHERE co.activo = true
        AND co.tipo = 'MANUAL_PRESENTACION'
        AND ($1::text = '' OR coalesce(co.manual_nombre,'') ILIKE '%' || $1::text || '%' OR co.cost_option_id::text ILIKE '%' || $1::text || '%')
      ORDER BY co.manual_nombre ASC NULLS LAST, co.cost_option_id ASC
      LIMIT $2
      `,
      [search, limit]
    );
    return rowsOf(r);
  }
  if (tipo === "PROVEEDOR") {
    const r: any = await sql.query(
      `
      WITH current_density AS (
        SELECT DISTINCT ON (co.item_id)
          co.item_id,
          co.densidad_g_ml::float8 as densidad_g_ml
        FROM app.cost_option co
        WHERE co.tipo = 'ITEM_PRESENTACION'
        ORDER BY co.item_id, co.cost_option_id DESC
      )
      SELECT
        'PROVEEDOR'::text as item_tipo,
        i.item_id::bigint as item_ref_id,
        coalesce(i.descripcion_fuente, 'Item #' || i.item_id::text) as nombre,
        trim(both ' ' from concat_ws(' · ', coalesce(pr.nombre,''), nullif(i.descripcion_fuente,''), 'Item #' || i.item_id::text)) as label,
        'GR'::text as uom,
        null::float8 as cantidad_referencia,
        null::float8 as costo_ref_ars,
        coalesce(s.saldo, 0)::float8 as saldo,
        cd.densidad_g_ml::float8 as densidad_g_ml
      FROM app.item_seguimiento i
      LEFT JOIN app.proveedor pr ON pr.proveedor_id = i.proveedor_id
      LEFT JOIN current_density cd ON cd.item_id = i.item_id
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'PROVEEDOR' AND s.item_ref_id = i.item_id::text
      WHERE i.estado = 'OK'
        AND ($1::text = '' OR coalesce(pr.nombre,'') ILIKE '%' || $1::text || '%' OR coalesce(i.descripcion_fuente,'') ILIKE '%' || $1::text || '%' OR i.item_id::text ILIKE '%' || $1::text || '%')
      ORDER BY pr.nombre ASC NULLS LAST, i.item_id DESC
      LIMIT $2
      `,
      [search, limit]
    );
    return rowsOf(r);
  }
  if (tipo === "FORMULADO") {
    const r: any = await sql.query(
      `
      SELECT
        'FORMULADO'::text as item_tipo,
        f.item_formulado_id::bigint as item_ref_id,
        coalesce(p.nombre, 'Formulado #' || f.item_formulado_id::text) as nombre,
        trim(both ' ' from concat_ws(' · ', 'Formulado', coalesce(p.nombre,''), 'ID ' || f.item_formulado_id::text)) as label,
        'GR'::text as uom,
        null::float8 as cantidad_referencia,
        null::float8 as costo_ref_ars,
        coalesce(sv.saldo, 0)::float8 as saldo,
        p.densidad_producto_g_ml::float8 as densidad_g_ml
      FROM app.item_formulado f
      JOIN app.producto p ON p.producto_id = f.producto_id
      LEFT JOIN app.stock_saldo_actual_v sv ON sv.item_tipo = 'FORMULADO' AND sv.item_ref_id = f.item_formulado_id::text
      WHERE f.activo = true
        AND f.tipo = 'BULK'
        AND ($1::text = '' OR coalesce(p.nombre,'') ILIKE '%' || $1::text || '%' OR f.item_formulado_id::text ILIKE '%' || $1::text || '%')
      ORDER BY p.nombre ASC, f.item_formulado_id ASC
      LIMIT $2
      `,
      [search, limit]
    );
    return rowsOf(r);
  }
  if (tipo === "ENVASE") {
    const r: any = await sql.query(
      `
      SELECT 'ENVASE'::text as item_tipo, c.item_envase_id::bigint as item_ref_id, c.nombre,
             c.nombre as label, c.uom, c.cantidad_referencia::float8 as cantidad_referencia,
             c.costo_ars::float8 as costo_ref_ars, coalesce(s.saldo, 0)::float8 as saldo,
             null::float8 as densidad_g_ml
      FROM app.item_envase c
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'ENVASE' AND s.item_ref_id = c.item_envase_id::text
      WHERE c.activo = true
        AND ($1::text = '' OR coalesce(c.nombre,'') ILIKE '%' || $1::text || '%' OR c.item_envase_id::text ILIKE '%' || $1::text || '%')
      ORDER BY c.nombre ASC, c.item_envase_id ASC
      LIMIT $2
      `,
      [search, limit]
    );
    return rowsOf(r);
  }
  if (tipo === "ETIQUETA") {
    const r: any = await sql.query(
      `
      SELECT 'ETIQUETA'::text as item_tipo, c.item_etiqueta_id::bigint as item_ref_id, c.nombre,
             trim(both ' ' from concat_ws(' · ', c.nombre, concat_ws(' x ', c.ancho_mm::text, c.largo_mm::text))) as label,
             c.uom, c.cantidad_referencia::float8 as cantidad_referencia,
             c.costo_ars::float8 as costo_ref_ars, coalesce(s.saldo, 0)::float8 as saldo,
             null::float8 as densidad_g_ml
      FROM app.item_etiqueta c
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'ETIQUETA' AND s.item_ref_id = c.item_etiqueta_id::text
      WHERE c.activo = true
        AND ($1::text = '' OR coalesce(c.nombre,'') ILIKE '%' || $1::text || '%' OR concat_ws(' x ', c.ancho_mm::text, c.largo_mm::text) ILIKE '%' || $1::text || '%' OR c.item_etiqueta_id::text ILIKE '%' || $1::text || '%')
      ORDER BY c.nombre ASC, c.item_etiqueta_id ASC
      LIMIT $2
      `,
      [search, limit]
    );
    return rowsOf(r);
  }
  const r: any = await sql.query(
    `
    SELECT 'PAQUETERIA'::text as item_tipo, c.item_paqueteria_id::bigint as item_ref_id, c.nombre,
           c.nombre as label, c.uom, c.cantidad_referencia::float8 as cantidad_referencia,
           c.costo_ars::float8 as costo_ref_ars, coalesce(s.saldo, 0)::float8 as saldo,
           null::float8 as densidad_g_ml
    FROM app.item_paqueteria c
    LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'PAQUETERIA' AND s.item_ref_id = c.item_paqueteria_id::text
    WHERE c.activo = true
      AND ($1::text = '' OR coalesce(c.nombre,'') ILIKE '%' || $1::text || '%' OR c.item_paqueteria_id::text ILIKE '%' || $1::text || '%')
    ORDER BY c.nombre ASC, c.item_paqueteria_id ASC
    LIMIT $2
    `,
    [search, limit]
  );
  return rowsOf(r);
}

export async function listStockSaldos(tipo: StockItemTipo | "", search: string, limit: number) {
  const sql = db();
  const r: any = await sql.query(
    `
    WITH all_rows AS (
      SELECT 'MANUAL'::text as item_tipo, co.cost_option_id::text as item_ref_id,
             coalesce(co.manual_nombre, 'Manual #' || co.cost_option_id::text) as nombre,
             trim(both ' ' from concat_ws(' · ', 'Manual', coalesce(co.manual_nombre,''), 'ID ' || co.cost_option_id::text)) as label,
             co.manual_uom::text as uom, coalesce(s.saldo,0)::float8 as saldo
      FROM app.cost_option co
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo='MANUAL' AND s.item_ref_id = co.cost_option_id::text
      WHERE co.activo = true AND co.tipo = 'MANUAL_PRESENTACION'
      UNION ALL
      SELECT 'PROVEEDOR'::text, i.item_id::text,
             coalesce(i.descripcion_fuente, 'Item #' || i.item_id::text),
             trim(both ' ' from concat_ws(' · ', coalesce(pr.nombre,''), nullif(i.descripcion_fuente,''), 'Item #' || i.item_id::text)),
             'GR'::text, coalesce(s.saldo,0)::float8
      FROM app.item_seguimiento i
      LEFT JOIN app.proveedor pr ON pr.proveedor_id = i.proveedor_id
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo='PROVEEDOR' AND s.item_ref_id = i.item_id::text
      WHERE i.estado = 'OK'
      UNION ALL
      SELECT 'FORMULADO'::text, f.item_formulado_id::text,
             coalesce(p.nombre, 'Formulado #' || f.item_formulado_id::text),
             trim(both ' ' from concat_ws(' · ', 'Formulado', coalesce(p.nombre,''), 'ID ' || f.item_formulado_id::text)),
             'GR'::text, coalesce(s.saldo,0)::float8
      FROM app.item_formulado f
      JOIN app.producto p ON p.producto_id = f.producto_id
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo='FORMULADO' AND s.item_ref_id = f.item_formulado_id::text
      WHERE f.activo = true AND f.tipo = 'BULK'
      UNION ALL
      SELECT 'ENVASE'::text, c.item_envase_id::text, c.nombre, c.nombre, c.uom::text, coalesce(s.saldo,0)::float8
      FROM app.item_envase c
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo='ENVASE' AND s.item_ref_id = c.item_envase_id::text
      WHERE c.activo = true
      UNION ALL
      SELECT 'ETIQUETA'::text, c.item_etiqueta_id::text, c.nombre,
             trim(both ' ' from concat_ws(' · ', c.nombre, concat_ws(' x ', c.ancho_mm::text, c.largo_mm::text))),
             c.uom::text, coalesce(s.saldo,0)::float8
      FROM app.item_etiqueta c
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo='ETIQUETA' AND s.item_ref_id = c.item_etiqueta_id::text
      WHERE c.activo = true
      UNION ALL
      SELECT 'PAQUETERIA'::text, c.item_paqueteria_id::text, c.nombre, c.nombre, c.uom::text, coalesce(s.saldo,0)::float8
      FROM app.item_paqueteria c
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo='PAQUETERIA' AND s.item_ref_id = c.item_paqueteria_id::text
      WHERE c.activo = true
    )
    SELECT *
    FROM all_rows x
    WHERE ($1::text = '' OR x.item_tipo = $1::text)
      AND ($2::text = '' OR x.nombre ILIKE '%' || $2::text || '%' OR x.label ILIKE '%' || $2::text || '%' OR x.item_ref_id ILIKE '%' || $2::text || '%')
    LIMIT $3
    `,
    [tipo, search, limit]
  );
  return rowsOf(r);
}

export async function listRecentStockOperaciones(limit: number) {
  const sql = db();
  const r: any = await sql.query(
    `
    SELECT
      o.stock_operacion_id,
      o.tipo,
      o.fecha,
      o.nota,
      o.referencia_externa,
      COUNT(m.stock_movimiento_id)::int as movimientos_count,
      COALESCE(SUM(CASE WHEN m.delta_cantidad > 0 THEN m.delta_cantidad ELSE 0 END), 0)::float8 as total_entradas,
      COALESCE(SUM(CASE WHEN m.delta_cantidad < 0 THEN abs(m.delta_cantidad) ELSE 0 END), 0)::float8 as total_salidas
    FROM app.stock_operacion o
    LEFT JOIN app.stock_movimiento m ON m.stock_operacion_id = o.stock_operacion_id
    GROUP BY o.stock_operacion_id, o.tipo, o.fecha, o.nota, o.referencia_externa
    ORDER BY o.fecha DESC, o.stock_operacion_id DESC
    LIMIT $1
    `,
    [limit]
  );
  return rowsOf(r);
}

export async function getStockOperacionDetail(stock_operacion_id: number) {
  const sql = db();
  const opRes: any = await sql.query(
    `
    SELECT stock_operacion_id, tipo, fecha, nota, referencia_externa
    FROM app.stock_operacion
    WHERE stock_operacion_id = $1
    LIMIT 1
    `,
    [stock_operacion_id]
  );
  const op = rowsOf(opRes)[0] ?? null;
  if (!op) return null;

  const movRes: any = await sql.query(
    `
    SELECT
      stock_movimiento_id,
      delta_cantidad,
      nota,
      CASE
        WHEN proveedor_item_id IS NOT NULL THEN 'PROVEEDOR'
        WHEN manual_cost_option_id IS NOT NULL THEN 'MANUAL'
        WHEN formulado_item_formulado_id IS NOT NULL THEN 'FORMULADO'
        WHEN item_envase_id IS NOT NULL THEN 'ENVASE'
        WHEN item_etiqueta_id IS NOT NULL THEN 'ETIQUETA'
        WHEN item_paqueteria_id IS NOT NULL THEN 'PAQUETERIA'
      END::text AS item_tipo,
      COALESCE(
        proveedor_item_id::bigint,
        manual_cost_option_id::bigint,
        formulado_item_formulado_id::bigint,
        item_envase_id::bigint,
        item_etiqueta_id::bigint,
        item_paqueteria_id::bigint
      )::bigint AS item_ref_id
    FROM app.stock_movimiento
    WHERE stock_operacion_id = $1
    ORDER BY stock_movimiento_id ASC
    `,
    [stock_operacion_id]
  );
  const rawMovs = rowsOf(movRes);
  const movimientos = [] as any[];
  for (const m of rawMovs) {
    const tipo = String(m.item_tipo ?? "").toUpperCase() as StockItemTipo;
    const ref = Number(m.item_ref_id);
    const target = isStockItemTipo(tipo) ? await getStockObjetivoOne(tipo, ref) : null;
    movimientos.push({
      stock_movimiento_id: Number(m.stock_movimiento_id),
      item_tipo: tipo,
      item_ref_id: ref,
      delta_cantidad: Number(m.delta_cantidad),
      nombre: target?.nombre ?? `${tipo} #${ref}`,
      label: target?.label ?? `${tipo} #${ref}`,
      uom: target?.uom ?? null,
      saldo: target?.saldo ?? null,
      densidad_g_ml: target?.densidad_g_ml ?? null,
    });
  }

  return {
    stock_operacion_id: Number(op.stock_operacion_id),
    tipo: String(op.tipo ?? "").toUpperCase(),
    fecha: op.fecha,
    nota: op.nota ?? null,
    referencia_externa: op.referencia_externa ?? null,
    movimientos,
  };
}

export type ComercialEstado = "BORRADOR" | "OFERTABLE" | "BLOQUEADO";

export type ComercialDiagnosticoRow = {
  item_comercial_id: number;
  nombre: string | null;
  cantidad: number | null;
  unidad: string | null;
  origen_tipo: "PROVEEDOR" | "MANUAL" | "FORMULADO" | null;
  origen_ref_id: number | null;
  origen_label: string | null;
  origen_uom: string | null;
  densidad_g_ml: number | null;
  bulk_saldo: number;
  bulk_requerido: number | null;
  bulk_faltante: number;
  estado: ComercialEstado;
  warnings_envases: number;
  warnings_etiquetas: number;
  warnings_detalle: string[];
};

export type FaltanteCompraRow = {
  key: string;
  item_tipo: StockItemTipo;
  item_ref_id: number;
  nombre: string;
  label: string;
  uom: string | null;
  saldo: number;
  faltante_total: number;
  comerciales_afectados: number;
  comerciales_labels: string[];
};

function familyOf(uom?: string | null): "mass" | "volume" | "unit" | null {
  const x = String(uom ?? "").trim().toUpperCase();
  if (x === "GR") return "mass";
  if (x === "ML") return "volume";
  if (x === "UN") return "unit";
  return null;
}

function normalizeQtyToOrigin(qty: number, itemUom?: string | null, originUom?: string | null, densidad?: number | null): number | null {
  const iu = String(itemUom ?? "").trim().toUpperCase();
  const ou = String(originUom ?? "").trim().toUpperCase();
  if (!["GR", "ML", "UN"].includes(iu) || !["GR", "ML", "UN"].includes(ou)) return null;
  if (iu === ou) return qty;
  if (iu === "UN" || ou === "UN") return null;
  const d = Number(densidad ?? NaN);
  if (!Number.isFinite(d) || d <= 0) return null;
  if (iu === "ML" && ou === "GR") return qty * d;
  if (iu === "GR" && ou === "ML") return qty / d;
  return null;
}

function needsDensity(itemUom?: string | null, originUom?: string | null) {
  const a = familyOf(itemUom);
  const b = familyOf(originUom);
  return !!a && !!b && a !== b && a !== "unit" && b !== "unit";
}

function keyFor(item_tipo: StockItemTipo, item_ref_id: number) {
  return `${item_tipo}:${item_ref_id}`;
}

export async function listStockFaltantes(search: string, estado: "" | ComercialEstado | "CON_ADVERTENCIAS", limit: number) {
  const sql = db();
  const rCom: any = await sql.query(
    `
    WITH current_density AS (
      SELECT DISTINCT ON (co.item_id)
        co.item_id,
        co.densidad_g_ml::float8 as densidad_g_ml
      FROM app.cost_option co
      WHERE co.tipo = 'ITEM_PRESENTACION'
      ORDER BY co.item_id, co.cost_option_id DESC
    )
    SELECT
      c.item_comercial_id,
      c.nombre,
      c.descripcion,
      c.cantidad::float8 as cantidad,
      c.unidad,
      CASE
        WHEN c.proveedor_item_id IS NOT NULL THEN 'PROVEEDOR'
        WHEN c.manual_cost_option_id IS NOT NULL THEN 'MANUAL'
        WHEN c.formulado_item_formulado_id IS NOT NULL THEN 'FORMULADO'
        ELSE NULL
      END::text as origen_tipo,
      COALESCE(c.proveedor_item_id::bigint, c.manual_cost_option_id::bigint, c.formulado_item_formulado_id::bigint) as origen_ref_id,
      CASE
        WHEN c.proveedor_item_id IS NOT NULL THEN trim(both ' ' from concat_ws(' · ', coalesce(pr.nombre,''), nullif(i.descripcion_fuente,''), 'Item #' || i.item_id::text))
        WHEN c.manual_cost_option_id IS NOT NULL THEN trim(both ' ' from concat_ws(' · ', 'Manual', coalesce(co.manual_nombre,''), 'ID ' || co.cost_option_id::text))
        WHEN c.formulado_item_formulado_id IS NOT NULL THEN trim(both ' ' from concat_ws(' · ', 'Formulado', coalesce(p.nombre,''), 'ID ' || f.item_formulado_id::text))
        ELSE NULL
      END as origen_label,
      CASE
        WHEN c.proveedor_item_id IS NOT NULL THEN 'GR'
        WHEN c.manual_cost_option_id IS NOT NULL THEN co.manual_uom
        WHEN c.formulado_item_formulado_id IS NOT NULL THEN 'GR'
        ELSE NULL
      END as origen_uom,
      COALESCE(sp.saldo, sm.saldo, sf.saldo, 0)::float8 as bulk_saldo,
      COALESCE(cd.densidad_g_ml, co.densidad_g_ml::float8, p.densidad_producto_g_ml::float8) as densidad_g_ml
    FROM app.item_comercial c
    LEFT JOIN app.item_seguimiento i ON i.item_id = c.proveedor_item_id
    LEFT JOIN app.proveedor pr ON pr.proveedor_id = i.proveedor_id
    LEFT JOIN current_density cd ON cd.item_id = i.item_id
    LEFT JOIN app.cost_option co ON co.cost_option_id = c.manual_cost_option_id
    LEFT JOIN app.item_formulado f ON f.item_formulado_id = c.formulado_item_formulado_id
    LEFT JOIN app.producto p ON p.producto_id = f.producto_id
    LEFT JOIN app.stock_saldo_actual_v sp ON sp.item_tipo = 'PROVEEDOR' AND sp.item_ref_id = c.proveedor_item_id::text
    LEFT JOIN app.stock_saldo_actual_v sm ON sm.item_tipo = 'MANUAL' AND sm.item_ref_id = c.manual_cost_option_id::text
    LEFT JOIN app.stock_saldo_actual_v sf ON sf.item_tipo = 'FORMULADO' AND sf.item_ref_id = c.formulado_item_formulado_id::text
    WHERE c.activo = true
      AND ($1::text = '' OR coalesce(c.nombre,'') ILIKE '%' || $1::text || '%' OR coalesce(i.descripcion_fuente,'') ILIKE '%' || $1::text || '%' OR coalesce(co.manual_nombre,'') ILIKE '%' || $1::text || '%' OR coalesce(p.nombre,'') ILIKE '%' || $1::text || '%')
    ORDER BY c.nombre ASC, c.item_comercial_id ASC
    LIMIT $2
    `,
    [search, limit]
  );
  const comercialesRaw = rowsOf(rCom);
  const ids = comercialesRaw.map((x) => Number(x.item_comercial_id)).filter((n) => Number.isFinite(n) && n > 0);
  const envMap = new Map<number, any[]>();
  const etMap = new Map<number, any[]>();

  if (ids.length) {
    const rEnv: any = await sql.query(
      `
      SELECT r.item_comercial_id, r.item_envase_id::bigint as item_ref_id, e.nombre, e.uom,
             r.cantidad::float8 as requerida, coalesce(s.saldo,0)::float8 as saldo
      FROM app.item_comercial_envase r
      JOIN app.item_envase e ON e.item_envase_id = r.item_envase_id
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'ENVASE' AND s.item_ref_id = e.item_envase_id::text
      WHERE r.item_comercial_id = ANY($1::bigint[])
      ORDER BY r.item_comercial_id, e.nombre ASC
      `,
      [ids]
    );
    for (const row of rowsOf(rEnv)) {
      const id = Number(row.item_comercial_id);
      const arr = envMap.get(id) ?? [];
      arr.push(row);
      envMap.set(id, arr);
    }

    const rEt: any = await sql.query(
      `
      SELECT r.item_comercial_id, r.item_etiqueta_id::bigint as item_ref_id, e.nombre,
             trim(both ' ' from concat_ws(' · ', e.nombre, concat_ws(' x ', e.ancho_mm::text, e.largo_mm::text))) as label,
             e.uom,
             r.cantidad::float8 as requerida,
             coalesce(s.saldo,0)::float8 as saldo
      FROM app.item_comercial_etiqueta r
      JOIN app.item_etiqueta e ON e.item_etiqueta_id = r.item_etiqueta_id
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'ETIQUETA' AND s.item_ref_id = e.item_etiqueta_id::text
      WHERE r.item_comercial_id = ANY($1::bigint[])
      ORDER BY r.item_comercial_id, e.nombre ASC
      `,
      [ids]
    );
    for (const row of rowsOf(rEt)) {
      const id = Number(row.item_comercial_id);
      const arr = etMap.get(id) ?? [];
      arr.push(row);
      etMap.set(id, arr);
    }
  }

  const comprasMap = new Map<string, FaltanteCompraRow>();
  const comerciales: ComercialDiagnosticoRow[] = [];

  for (const c of comercialesRaw) {
    const cantidad = numOrNull(c.cantidad);
    const unidad = textOrNull(c.unidad);
    const origen_tipo = textOrNull(c.origen_tipo) as any;
    const origen_ref_id = numOrNull(c.origen_ref_id);
    const origen_uom = textOrNull(c.origen_uom);
    const densidad = numOrNull(c.densidad_g_ml);
    const saldo = Number(numOrNull(c.bulk_saldo) ?? 0);
    let estado: ComercialEstado = "BORRADOR";
    let bulk_requerido: number | null = null;
    let bulk_faltante = 0;
    const warnings: string[] = [];

    const missingStructure = !textOrNull(c.nombre) || cantidad === null || !unidad || !origen_tipo || origen_ref_id === null;
    if (!missingStructure) {
      if (needsDensity(unidad, origen_uom) && !(Number.isFinite(Number(densidad)) && Number(densidad) > 0)) {
        estado = "BORRADOR";
      } else {
        const req = normalizeQtyToOrigin(Number(cantidad), unidad, origen_uom, densidad);
        if (req === null || !Number.isFinite(req) || req <= 0) {
          estado = "BORRADOR";
        } else {
          bulk_requerido = req;
          bulk_faltante = Math.max(req - saldo, 0);
          estado = bulk_faltante > 0 ? "BLOQUEADO" : "OFERTABLE";
          if (bulk_faltante > 0 && origen_tipo && origen_ref_id !== null) {
            const k = keyFor(origen_tipo, Number(origen_ref_id));
            const label = String(c.origen_label ?? c.nombre ?? `${origen_tipo} #${origen_ref_id}`);
            const cur = comprasMap.get(k) ?? {
              key: k,
              item_tipo: origen_tipo,
              item_ref_id: Number(origen_ref_id),
              nombre: String(c.origen_label ?? c.nombre ?? `${origen_tipo} #${origen_ref_id}`),
              label,
              uom: origen_uom,
              saldo,
              faltante_total: 0,
              comerciales_afectados: 0,
              comerciales_labels: [],
            };
            cur.faltante_total += bulk_faltante;
            cur.comerciales_labels.push(String(c.nombre ?? `Item Comercial #${c.item_comercial_id}`));
            comprasMap.set(k, cur);
          }
        }
      }
    }

    let warnings_envases = 0;
    for (const e of envMap.get(Number(c.item_comercial_id)) ?? []) {
      const requerida = Number(numOrNull(e.requerida) ?? 0);
      const saldoEnv = Number(numOrNull(e.saldo) ?? 0);
      const miss = Math.max(requerida - saldoEnv, 0);
      if (miss > 0) {
        warnings_envases += 1;
        warnings.push(`Envase: ${String(e.nombre ?? "")} (faltan ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(miss)} ${String(e.uom ?? "")})`);
        const k = keyFor("ENVASE", Number(e.item_ref_id));
        const cur = comprasMap.get(k) ?? {
          key: k,
          item_tipo: "ENVASE",
          item_ref_id: Number(e.item_ref_id),
          nombre: String(e.nombre ?? `Envase #${e.item_ref_id}`),
          label: String(e.nombre ?? `Envase #${e.item_ref_id}`),
          uom: e.uom ?? null,
          saldo: saldoEnv,
          faltante_total: 0,
          comerciales_afectados: 0,
          comerciales_labels: [],
        };
        cur.faltante_total += miss;
        cur.comerciales_labels.push(String(c.nombre ?? `Item Comercial #${c.item_comercial_id}`));
        comprasMap.set(k, cur);
      }
    }

    let warnings_etiquetas = 0;
    for (const e of etMap.get(Number(c.item_comercial_id)) ?? []) {
      const requerida = Number(numOrNull(e.requerida) ?? 0);
      const saldoEt = Number(numOrNull(e.saldo) ?? 0);
      const miss = Math.max(requerida - saldoEt, 0);
      if (miss > 0) {
        warnings_etiquetas += 1;
        warnings.push(`Etiqueta: ${String(e.label ?? e.nombre ?? "")} (faltan ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(miss)} ${String(e.uom ?? "")})`);
        const k = keyFor("ETIQUETA", Number(e.item_ref_id));
        const label = String(e.label ?? e.nombre ?? `Etiqueta #${e.item_ref_id}`);
        const cur = comprasMap.get(k) ?? {
          key: k,
          item_tipo: "ETIQUETA",
          item_ref_id: Number(e.item_ref_id),
          nombre: String(e.nombre ?? `Etiqueta #${e.item_ref_id}`),
          label,
          uom: e.uom ?? null,
          saldo: saldoEt,
          faltante_total: 0,
          comerciales_afectados: 0,
          comerciales_labels: [],
        };
        cur.faltante_total += miss;
        cur.comerciales_labels.push(String(c.nombre ?? `Item Comercial #${c.item_comercial_id}`));
        comprasMap.set(k, cur);
      }
    }

    comerciales.push({
      item_comercial_id: Number(c.item_comercial_id),
      nombre: c.nombre ?? null,
      cantidad,
      unidad,
      origen_tipo: origen_tipo ?? null,
      origen_ref_id,
      origen_label: c.origen_label ?? null,
      origen_uom,
      densidad_g_ml: densidad,
      bulk_saldo: saldo,
      bulk_requerido,
      bulk_faltante,
      estado,
      warnings_envases,
      warnings_etiquetas,
      warnings_detalle: warnings,
    });
  }

  const compras = Array.from(comprasMap.values()).map((r) => ({
    ...r,
    comerciales_afectados: new Set(r.comerciales_labels).size,
    comerciales_labels: Array.from(new Set(r.comerciales_labels)).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
  })).sort((a, b) => {
    if (b.faltante_total !== a.faltante_total) return b.faltante_total - a.faltante_total;
    return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
  });

  const filteredComerciales = comerciales.filter((r) => {
    if (estado === "") return true;
    if (estado === "CON_ADVERTENCIAS") return r.warnings_envases > 0 || r.warnings_etiquetas > 0;
    return r.estado === estado;
  });

  return { comerciales: filteredComerciales, compras };
}
