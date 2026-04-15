BEGIN;

-- Ajuste posterior a 2026_04_14_item_comercial_vnext.sql
-- Deja item_envase, item_etiqueta e item_paqueteria como catálogos autónomos.

ALTER TABLE app.item_envase DROP CONSTRAINT IF EXISTS item_envase_origen_unico_chk;
ALTER TABLE app.item_envase DROP CONSTRAINT IF EXISTS item_envase_proveedor_fk;
ALTER TABLE app.item_envase DROP CONSTRAINT IF EXISTS item_envase_manual_fk;
DROP INDEX IF EXISTS app.idx_item_envase_proveedor_item_id;
DROP INDEX IF EXISTS app.idx_item_envase_manual_cost_option_id;
ALTER TABLE app.item_envase DROP COLUMN IF EXISTS proveedor_item_id;
ALTER TABLE app.item_envase DROP COLUMN IF EXISTS manual_cost_option_id;

ALTER TABLE app.item_etiqueta DROP CONSTRAINT IF EXISTS item_etiqueta_origen_unico_chk;
ALTER TABLE app.item_etiqueta DROP CONSTRAINT IF EXISTS item_etiqueta_proveedor_fk;
ALTER TABLE app.item_etiqueta DROP CONSTRAINT IF EXISTS item_etiqueta_manual_fk;
DROP INDEX IF EXISTS app.idx_item_etiqueta_proveedor_item_id;
DROP INDEX IF EXISTS app.idx_item_etiqueta_manual_cost_option_id;
ALTER TABLE app.item_etiqueta DROP COLUMN IF EXISTS proveedor_item_id;
ALTER TABLE app.item_etiqueta DROP COLUMN IF EXISTS manual_cost_option_id;

ALTER TABLE app.item_paqueteria DROP CONSTRAINT IF EXISTS item_paqueteria_origen_unico_chk;
ALTER TABLE app.item_paqueteria DROP CONSTRAINT IF EXISTS item_paqueteria_proveedor_fk;
ALTER TABLE app.item_paqueteria DROP CONSTRAINT IF EXISTS item_paqueteria_manual_fk;
DROP INDEX IF EXISTS app.idx_item_paqueteria_proveedor_item_id;
DROP INDEX IF EXISTS app.idx_item_paqueteria_manual_cost_option_id;
ALTER TABLE app.item_paqueteria DROP COLUMN IF EXISTS proveedor_item_id;
ALTER TABLE app.item_paqueteria DROP COLUMN IF EXISTS manual_cost_option_id;

COMMIT;
