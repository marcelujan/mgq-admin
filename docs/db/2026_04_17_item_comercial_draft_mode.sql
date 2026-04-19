BEGIN;

ALTER TABLE app.item_comercial
  ALTER COLUMN cantidad DROP NOT NULL,
  ALTER COLUMN unidad DROP NOT NULL;

ALTER TABLE app.item_comercial
  DROP CONSTRAINT IF EXISTS item_comercial_unidad_chk,
  DROP CONSTRAINT IF EXISTS item_comercial_cantidad_chk,
  DROP CONSTRAINT IF EXISTS item_comercial_un_entera_chk,
  DROP CONSTRAINT IF EXISTS item_comercial_origen_unico_chk;

ALTER TABLE app.item_comercial
  ADD CONSTRAINT item_comercial_unidad_chk
    CHECK (unidad IS NULL OR unidad IN ('GR', 'ML', 'UN')),
  ADD CONSTRAINT item_comercial_cantidad_chk
    CHECK (cantidad IS NULL OR cantidad > 0),
  ADD CONSTRAINT item_comercial_un_entera_chk
    CHECK (unidad IS DISTINCT FROM 'UN' OR cantidad IS NULL OR cantidad = trunc(cantidad)),
  ADD CONSTRAINT item_comercial_origen_unico_chk
    CHECK (
      ((proveedor_item_id IS NOT NULL)::int +
       (manual_cost_option_id IS NOT NULL)::int +
       (formulado_item_formulado_id IS NOT NULL)::int) <= 1
    );

COMMIT;
