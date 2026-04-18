BEGIN;

-- Ajuste posterior a 2026_04_15_item_catalogos_autonomos_fix.sql
-- Convierte item_envase, item_etiqueta e item_paqueteria en catálogos con costo,
-- lote/cantidad de referencia y unidad operativa interna.
-- No se reintroducen FKs a manual/proveedor en esta iteración.

ALTER TABLE app.item_envase ADD COLUMN IF NOT EXISTS uom text;
ALTER TABLE app.item_envase ADD COLUMN IF NOT EXISTS cantidad_referencia numeric;
ALTER TABLE app.item_envase ADD COLUMN IF NOT EXISTS costo_ars numeric;
UPDATE app.item_envase SET uom = coalesce(uom, 'UN');
UPDATE app.item_envase SET cantidad_referencia = coalesce(cantidad_referencia, 1);
UPDATE app.item_envase SET costo_ars = coalesce(costo_ars, 0);
ALTER TABLE app.item_envase ALTER COLUMN uom SET NOT NULL;
ALTER TABLE app.item_envase ALTER COLUMN cantidad_referencia SET NOT NULL;
ALTER TABLE app.item_envase ALTER COLUMN costo_ars SET NOT NULL;
ALTER TABLE app.item_envase DROP COLUMN IF EXISTS descripcion;
ALTER TABLE app.item_envase DROP CONSTRAINT IF EXISTS item_envase_uom_chk;
ALTER TABLE app.item_envase DROP CONSTRAINT IF EXISTS item_envase_cantidad_referencia_chk;
ALTER TABLE app.item_envase DROP CONSTRAINT IF EXISTS item_envase_costo_ars_chk;
ALTER TABLE app.item_envase DROP CONSTRAINT IF EXISTS item_envase_un_entera_chk;
ALTER TABLE app.item_envase ADD CONSTRAINT item_envase_uom_chk CHECK (uom IN ('GR','ML','UN'));
ALTER TABLE app.item_envase ADD CONSTRAINT item_envase_cantidad_referencia_chk CHECK (cantidad_referencia > 0);
ALTER TABLE app.item_envase ADD CONSTRAINT item_envase_costo_ars_chk CHECK (costo_ars >= 0);
ALTER TABLE app.item_envase ADD CONSTRAINT item_envase_un_entera_chk CHECK (uom <> 'UN' OR cantidad_referencia = trunc(cantidad_referencia));

ALTER TABLE app.item_etiqueta ADD COLUMN IF NOT EXISTS uom text;
ALTER TABLE app.item_etiqueta ADD COLUMN IF NOT EXISTS cantidad_referencia numeric;
ALTER TABLE app.item_etiqueta ADD COLUMN IF NOT EXISTS costo_ars numeric;
UPDATE app.item_etiqueta SET uom = coalesce(uom, 'UN');
UPDATE app.item_etiqueta SET cantidad_referencia = coalesce(cantidad_referencia, 1);
UPDATE app.item_etiqueta SET costo_ars = coalesce(costo_ars, 0);
ALTER TABLE app.item_etiqueta ALTER COLUMN uom SET NOT NULL;
ALTER TABLE app.item_etiqueta ALTER COLUMN cantidad_referencia SET NOT NULL;
ALTER TABLE app.item_etiqueta ALTER COLUMN costo_ars SET NOT NULL;
ALTER TABLE app.item_etiqueta DROP COLUMN IF EXISTS descripcion;
ALTER TABLE app.item_etiqueta DROP COLUMN IF EXISTS material;
ALTER TABLE app.item_etiqueta DROP CONSTRAINT IF EXISTS item_etiqueta_uom_chk;
ALTER TABLE app.item_etiqueta DROP CONSTRAINT IF EXISTS item_etiqueta_cantidad_referencia_chk;
ALTER TABLE app.item_etiqueta DROP CONSTRAINT IF EXISTS item_etiqueta_costo_ars_chk;
ALTER TABLE app.item_etiqueta DROP CONSTRAINT IF EXISTS item_etiqueta_un_entera_chk;
ALTER TABLE app.item_etiqueta ADD CONSTRAINT item_etiqueta_uom_chk CHECK (uom IN ('GR','ML','UN'));
ALTER TABLE app.item_etiqueta ADD CONSTRAINT item_etiqueta_cantidad_referencia_chk CHECK (cantidad_referencia > 0);
ALTER TABLE app.item_etiqueta ADD CONSTRAINT item_etiqueta_costo_ars_chk CHECK (costo_ars >= 0);
ALTER TABLE app.item_etiqueta ADD CONSTRAINT item_etiqueta_un_entera_chk CHECK (uom <> 'UN' OR cantidad_referencia = trunc(cantidad_referencia));

ALTER TABLE app.item_paqueteria ADD COLUMN IF NOT EXISTS uom text;
ALTER TABLE app.item_paqueteria ADD COLUMN IF NOT EXISTS cantidad_referencia numeric;
ALTER TABLE app.item_paqueteria ADD COLUMN IF NOT EXISTS costo_ars numeric;
UPDATE app.item_paqueteria SET uom = coalesce(uom, 'UN');
UPDATE app.item_paqueteria SET cantidad_referencia = coalesce(cantidad_referencia, 1);
UPDATE app.item_paqueteria SET costo_ars = coalesce(costo_ars, 0);
ALTER TABLE app.item_paqueteria ALTER COLUMN uom SET NOT NULL;
ALTER TABLE app.item_paqueteria ALTER COLUMN cantidad_referencia SET NOT NULL;
ALTER TABLE app.item_paqueteria ALTER COLUMN costo_ars SET NOT NULL;
ALTER TABLE app.item_paqueteria DROP COLUMN IF EXISTS descripcion;
ALTER TABLE app.item_paqueteria DROP CONSTRAINT IF EXISTS item_paqueteria_uom_chk;
ALTER TABLE app.item_paqueteria DROP CONSTRAINT IF EXISTS item_paqueteria_cantidad_referencia_chk;
ALTER TABLE app.item_paqueteria DROP CONSTRAINT IF EXISTS item_paqueteria_costo_ars_chk;
ALTER TABLE app.item_paqueteria DROP CONSTRAINT IF EXISTS item_paqueteria_un_entera_chk;
ALTER TABLE app.item_paqueteria ADD CONSTRAINT item_paqueteria_uom_chk CHECK (uom IN ('GR','ML','UN'));
ALTER TABLE app.item_paqueteria ADD CONSTRAINT item_paqueteria_cantidad_referencia_chk CHECK (cantidad_referencia > 0);
ALTER TABLE app.item_paqueteria ADD CONSTRAINT item_paqueteria_costo_ars_chk CHECK (costo_ars >= 0);
ALTER TABLE app.item_paqueteria ADD CONSTRAINT item_paqueteria_un_entera_chk CHECK (uom <> 'UN' OR cantidad_referencia = trunc(cantidad_referencia));

COMMIT;
