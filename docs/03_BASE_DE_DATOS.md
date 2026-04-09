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

