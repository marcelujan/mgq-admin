-- 2026-04-19 — Stock real mínimo para Item Comercial vNext
-- Objetivo: habilitar stock real, salidas no comerciales, ofertabilidad y lista de faltantes
-- sin tocar cron ni snapshots existentes.

BEGIN;

CREATE TABLE IF NOT EXISTS app.stock_movimiento (
  stock_movimiento_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proveedor_item_id bigint REFERENCES app.item_seguimiento(item_id) ON DELETE RESTRICT,
  manual_cost_option_id bigint REFERENCES app.cost_option(cost_option_id) ON DELETE RESTRICT,
  formulado_item_formulado_id integer REFERENCES app.item_formulado(item_formulado_id) ON DELETE RESTRICT,
  item_envase_id bigint REFERENCES app.item_envase(item_envase_id) ON DELETE RESTRICT,
  item_etiqueta_id bigint REFERENCES app.item_etiqueta(item_etiqueta_id) ON DELETE RESTRICT,
  item_paqueteria_id bigint REFERENCES app.item_paqueteria(item_paqueteria_id) ON DELETE RESTRICT,
  movimiento_tipo text NOT NULL,
  cantidad_delta numeric(18,6) NOT NULL,
  referencia text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movimiento_one_target_chk CHECK (
    (
      CASE WHEN proveedor_item_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN manual_cost_option_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN formulado_item_formulado_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN item_envase_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN item_etiqueta_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN item_paqueteria_id IS NOT NULL THEN 1 ELSE 0 END
    ) = 1
  ),
  CONSTRAINT stock_movimiento_tipo_chk CHECK (
    movimiento_tipo IN (
      'INGRESO',
      'VENTA',
      'CONSUMO_INTERNO',
      'REGALO_MUESTRA',
      'MERMA_PERDIDA',
      'AJUSTE'
    )
  ),
  CONSTRAINT stock_movimiento_delta_chk CHECK (cantidad_delta <> 0)
);

CREATE INDEX IF NOT EXISTS stock_movimiento_proveedor_idx ON app.stock_movimiento(proveedor_item_id) WHERE proveedor_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movimiento_manual_idx ON app.stock_movimiento(manual_cost_option_id) WHERE manual_cost_option_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movimiento_formulado_idx ON app.stock_movimiento(formulado_item_formulado_id) WHERE formulado_item_formulado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movimiento_envase_idx ON app.stock_movimiento(item_envase_id) WHERE item_envase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movimiento_etiqueta_idx ON app.stock_movimiento(item_etiqueta_id) WHERE item_etiqueta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movimiento_paqueteria_idx ON app.stock_movimiento(item_paqueteria_id) WHERE item_paqueteria_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movimiento_tipo_created_idx ON app.stock_movimiento(movimiento_tipo, created_at DESC);

CREATE OR REPLACE VIEW app.stock_saldo_actual_v AS
SELECT
  CASE
    WHEN proveedor_item_id IS NOT NULL THEN 'PROVEEDOR'
    WHEN manual_cost_option_id IS NOT NULL THEN 'MANUAL'
    WHEN formulado_item_formulado_id IS NOT NULL THEN 'FORMULADO'
    WHEN item_envase_id IS NOT NULL THEN 'ENVASE'
    WHEN item_etiqueta_id IS NOT NULL THEN 'ETIQUETA'
    ELSE 'PAQUETERIA'
  END AS stock_tipo,
  proveedor_item_id,
  manual_cost_option_id,
  formulado_item_formulado_id,
  item_envase_id,
  item_etiqueta_id,
  item_paqueteria_id,
  SUM(cantidad_delta)::numeric(18,6) AS saldo_actual
FROM app.stock_movimiento
GROUP BY 1, proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id, item_envase_id, item_etiqueta_id, item_paqueteria_id;

COMMIT;
