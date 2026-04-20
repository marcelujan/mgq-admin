# API backend – pricing por canal implementable

## Endpoints mínimos
- `GET /api/items-comerciales/[item_comercial_id]/pricing`
- `PATCH /api/items-comerciales/[item_comercial_id]/pricing`

## Campos manejados
- `costo_referencia_ars`
- `margen_referencia_pct`
- `precio_sin_impuestos`
- `precio_directo`
- `precio_web`
- `precio_ml`

## Reglas de primera versión
- todos los precios quedan editables
- `costo_referencia_ars` puede venir sugerido desde el costeo actual
- `precio_ml` sigue siendo manual
