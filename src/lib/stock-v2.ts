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
