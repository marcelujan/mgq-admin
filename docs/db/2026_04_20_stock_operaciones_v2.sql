-- 2026-04-20
-- Stock real mínimo v2
-- Objetivo: definir stock real a partir de operaciones y movimientos,
-- sin campo stock editable, con producción tolerante a diferencias reales.

BEGIN;

CREATE TABLE IF NOT EXISTS app.stock_operacion (
  stock_operacion_id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO','VENTA','PRODUCCION','AJUSTE')),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  nota TEXT NULL,
  referencia_externa TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.stock_movimiento (
  stock_movimiento_id BIGSERIAL PRIMARY KEY,
  stock_operacion_id BIGINT NOT NULL REFERENCES app.stock_operacion(stock_operacion_id) ON DELETE CASCADE,

  proveedor_item_id BIGINT NULL REFERENCES app.item_seguimiento(item_id) ON DELETE RESTRICT,
  manual_cost_option_id BIGINT NULL REFERENCES app.cost_option(cost_option_id) ON DELETE RESTRICT,
  formulado_item_formulado_id INTEGER NULL REFERENCES app.item_formulado(item_formulado_id) ON DELETE RESTRICT,
  item_envase_id BIGINT NULL REFERENCES app.item_envase(item_envase_id) ON DELETE RESTRICT,
  item_etiqueta_id BIGINT NULL REFERENCES app.item_etiqueta(item_etiqueta_id) ON DELETE RESTRICT,
  item_paqueteria_id BIGINT NULL REFERENCES app.item_paqueteria(item_paqueteria_id) ON DELETE RESTRICT,

  delta_cantidad NUMERIC(18,4) NOT NULL,
  nota TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT stock_movimiento_objetivo_unico_chk CHECK (
    ((CASE WHEN proveedor_item_id IS NOT NULL THEN 1 ELSE 0 END) +
     (CASE WHEN manual_cost_option_id IS NOT NULL THEN 1 ELSE 0 END) +
     (CASE WHEN formulado_item_formulado_id IS NOT NULL THEN 1 ELSE 0 END) +
     (CASE WHEN item_envase_id IS NOT NULL THEN 1 ELSE 0 END) +
     (CASE WHEN item_etiqueta_id IS NOT NULL THEN 1 ELSE 0 END) +
     (CASE WHEN item_paqueteria_id IS NOT NULL THEN 1 ELSE 0 END)) = 1
  ),
  CONSTRAINT stock_movimiento_delta_no_cero_chk CHECK (delta_cantidad <> 0)
);

CREATE INDEX IF NOT EXISTS stock_operacion_tipo_fecha_idx
  ON app.stock_operacion(tipo, fecha DESC);

CREATE INDEX IF NOT EXISTS stock_movimiento_operacion_idx
  ON app.stock_movimiento(stock_operacion_id);
CREATE INDEX IF NOT EXISTS stock_movimiento_proveedor_idx
  ON app.stock_movimiento(proveedor_item_id) WHERE proveedor_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movimiento_manual_idx
  ON app.stock_movimiento(manual_cost_option_id) WHERE manual_cost_option_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movimiento_formulado_idx
  ON app.stock_movimiento(formulado_item_formulado_id) WHERE formulado_item_formulado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movimiento_envase_idx
  ON app.stock_movimiento(item_envase_id) WHERE item_envase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movimiento_etiqueta_idx
  ON app.stock_movimiento(item_etiqueta_id) WHERE item_etiqueta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movimiento_paqueteria_idx
  ON app.stock_movimiento(item_paqueteria_id) WHERE item_paqueteria_id IS NOT NULL;

CREATE OR REPLACE VIEW app.stock_saldo_actual_v AS
SELECT
  'PROVEEDOR'::text AS item_tipo,
  m.proveedor_item_id::text AS item_ref_id,
  SUM(m.delta_cantidad) AS saldo
FROM app.stock_movimiento m
WHERE m.proveedor_item_id IS NOT NULL
GROUP BY m.proveedor_item_id

UNION ALL

SELECT
  'MANUAL'::text AS item_tipo,
  m.manual_cost_option_id::text AS item_ref_id,
  SUM(m.delta_cantidad) AS saldo
FROM app.stock_movimiento m
WHERE m.manual_cost_option_id IS NOT NULL
GROUP BY m.manual_cost_option_id

UNION ALL

SELECT
  'FORMULADO'::text AS item_tipo,
  m.formulado_item_formulado_id::text AS item_ref_id,
  SUM(m.delta_cantidad) AS saldo
FROM app.stock_movimiento m
WHERE m.formulado_item_formulado_id IS NOT NULL
GROUP BY m.formulado_item_formulado_id

UNION ALL

SELECT
  'ENVASE'::text AS item_tipo,
  m.item_envase_id::text AS item_ref_id,
  SUM(m.delta_cantidad) AS saldo
FROM app.stock_movimiento m
WHERE m.item_envase_id IS NOT NULL
GROUP BY m.item_envase_id

UNION ALL

SELECT
  'ETIQUETA'::text AS item_tipo,
  m.item_etiqueta_id::text AS item_ref_id,
  SUM(m.delta_cantidad) AS saldo
FROM app.stock_movimiento m
WHERE m.item_etiqueta_id IS NOT NULL
GROUP BY m.item_etiqueta_id

UNION ALL

SELECT
  'PAQUETERIA'::text AS item_tipo,
  m.item_paqueteria_id::text AS item_ref_id,
  SUM(m.delta_cantidad) AS saldo
FROM app.stock_movimiento m
WHERE m.item_paqueteria_id IS NOT NULL
GROUP BY m.item_paqueteria_id;

COMMIT;
