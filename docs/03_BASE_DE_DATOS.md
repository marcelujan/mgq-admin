# 03_BASE_DE_DATOS.md
## Base de Datos – Mapa Estructural Core (v2)

Este archivo es el “mapa curado” del esquema (orientado a decisiones de producto/arquitectura). El snapshot exhaustivo está en `/docs/db/schema_app.md`.

## Tablas core (dominio)

- `app.producto`: entidad central (técnica + comercial).
- `app.item_formulado`: representación formulada reutilizable (incluye BULK).
- `app.producto_formula_v2` / `app.producto_formula_linea_v2`: fórmula v2.
- `app.offers`: ofertas comerciales (URL + motor + presentación).

## Tablas operativas (pricing)

- `app.pricing_daily_runs`: corrida diaria (por fecha).
- `app.pricing_daily_run_items`: detalle por oferta (PENDING/OK/FAIL, attempts, last_error).
- `app.item_price_daily_pres`: precios diarios por presentación (upsert).

## Invariantes DB relevantes

- Bulk reutilizable: `item_formulado.tipo='BULK' and activo=true`.
- Oferta elegible para pricing: `offers.estado='OK'`.
- Mismatch de presentación es una causa esperable de FAIL: `last_error like 'no_or_invalid_price_for_presentacion:%'`.


---

## Propuesta vNext — Capa comercial nueva (2026-04-14)

Se propone **no reutilizar** `app.producto_oferta*` ni `app.packaging_item` como base conceptual de la nueva comercialización. La base viva actual permanece en:

- `app.item_seguimiento` (PROVEEDOR)
- `app.cost_option` (MANUAL)
- `app.item_formulado` (FORMULADO)

Sobre esa base se agrega una capa nueva mínima:

- `app.item_comercial`
- `app.item_envase`
- `app.item_etiqueta`
- `app.item_paqueteria`
- `app.item_comercial_envase`
- `app.item_comercial_etiqueta`

### Reglas estructurales fijadas

- `item_comercial` nace de **un único origen técnico**.
- Un origen técnico posible es exactamente uno de:
  - `app.item_seguimiento.item_id`
  - `app.cost_option.cost_option_id`
  - `app.item_formulado.item_formulado_id`
- `item_envase`, `item_etiqueta` e `item_paqueteria` nacen de un origen `PROVEEDOR` o `MANUAL`.
- No se crea relación fija `item_comercial_paqueteria` en esta fase.
- `item_comercial` **no** almacena stock propio.
- Las unidades internas oficiales siguen siendo `GR`, `ML` y `UN`.

### Script listo para correr

Ver: `docs/db/2026_04_14_item_comercial_vnext.sql`


---

## Propuesta siguiente — Stock real mínimo para ofertabilidad y faltantes (2026-04-19)

Diagnóstico: en el esquema actual existe costo de referencia en `app.cost_option` (`manual_uom`, `manual_cantidad`, `manual_costo_ars`) y en los catálogos nuevos (`uom`, `cantidad_referencia`, `costo_ars`), pero **no existe una capa de stock real** para ninguno de los ítems que después deben intervenir en la ofertabilidad de `Items Comerciales`.

Por eso, antes de calcular automáticamente `Borrador / Ofertable / Bloqueado`, lista de faltantes y compras sugeridas, se propone agregar una única tabla mínima de movimientos:

- `app.stock_movimiento`

### Cobertura de `app.stock_movimiento`

Un movimiento puede apuntar a exactamente uno de estos seis tipos de ítem con stock real:

- `PROVEEDOR` → `app.item_seguimiento.item_id`
- `MANUAL` → `app.cost_option.cost_option_id`
- `FORMULADO` → `app.item_formulado.item_formulado_id`
- `ENVASE` → `app.item_envase.item_envase_id`
- `ETIQUETA` → `app.item_etiqueta.item_etiqueta_id`
- `PAQUETERIA` → `app.item_paqueteria.item_paqueteria_id`

### Tipos mínimos de movimiento

- `INGRESO`
- `VENTA`
- `CONSUMO_INTERNO`
- `REGALO_MUESTRA`
- `MERMA_PERDIDA`
- `AJUSTE`

### Invariantes nuevas

- El stock real **nunca** vive en `app.item_comercial`.
- Las salidas no comerciales se cargan siempre sobre el ítem que tiene stock real.
- `Items Paquetería` no bloquea oferta, pero sí participa del stock real.
- `Envases` y `Etiquetas` participarán inicialmente como advertencia de faltantes, no como bloqueo duro.

### Script listo para revisión

Ver: `docs/db/2026_04_19_stock_real_minimo.sql`
