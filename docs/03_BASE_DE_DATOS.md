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



## Propuesta mínima — Línea comercial v2 (no implementada aún)

Esta sección no describe el estado actual de la base. Describe el corte mínimo propuesto para soportar `Items Comerciales` sin alterar la base viva de `PROVEEDOR`, `MANUAL` y `FORMULADO`.

### Matriz de tablas nuevas propuestas

| Tabla propuesta | PK | FKs mínimas | Checks mínimos | Índices mínimos | Notas |
|---|---|---|---|---|---|
| `app.item_comercial` | `item_comercial_id` | `proveedor_item_id -> app.item_seguimiento(item_id)`; `manual_cost_option_id -> app.cost_option(cost_option_id)`; `formulado_item_formulado_id -> app.item_formulado(item_formulado_id)` | exactamente una FK de origen técnico debe estar informada; `unidad in ('GR','ML','UN')`; `cantidad > 0` | índice por cada FK de origen; índice por `activo`; índice por `nombre` | Variante vendible concreta. No guarda stock propio ni una segunda densidad. |
| `app.item_envase` | `item_envase_id` | `proveedor_item_id -> app.item_seguimiento(item_id)`; `manual_cost_option_id -> app.cost_option(cost_option_id)` | exactamente una FK de origen técnico; `activo` not null | índice por cada FK de origen; índice por `activo`; índice por `nombre` | Catálogo separado de envases y accesorios funcionales. |
| `app.item_etiqueta` | `item_etiqueta_id` | `proveedor_item_id -> app.item_seguimiento(item_id)`; `manual_cost_option_id -> app.cost_option(cost_option_id)` | exactamente una FK de origen técnico; `medidas` not null; `activo` not null | índice por cada FK de origen; índice por `activo`; índice por `medidas` | Consumible exigible por variante. `medidas` usa formato `ancho x largo`. |
| `app.item_paqueteria` | `item_paqueteria_id` | `proveedor_item_id -> app.item_seguimiento(item_id)`; `manual_cost_option_id -> app.cost_option(cost_option_id)` | exactamente una FK de origen técnico; `activo` not null | índice por cada FK de origen; índice por `activo`; índice por `nombre` | No bloquea ofertabilidad; solo control de stock. |
| `app.item_comercial_envase` | `item_comercial_envase_id` | `item_comercial_id -> app.item_comercial(item_comercial_id)`; `item_envase_id -> app.item_envase(item_envase_id)` | `cantidad > 0`; `obligatorio` not null; UNIQUE (`item_comercial_id`, `item_envase_id`) | índice por `item_comercial_id`; índice por `item_envase_id` | Relación N:M entre comercial y envases requeridos. |
| `app.item_comercial_etiqueta` | `item_comercial_etiqueta_id` | `item_comercial_id -> app.item_comercial(item_comercial_id)`; `item_etiqueta_id -> app.item_etiqueta(item_etiqueta_id)` | `cantidad > 0`; `obligatorio` not null; UNIQUE (`item_comercial_id`, `item_etiqueta_id`) | índice por `item_comercial_id`; índice por `item_etiqueta_id` | Relación N:M entre comercial y etiquetas requeridas. |

### Campos mínimos recomendados por tabla

#### `app.item_comercial`

- `item_comercial_id`
- `nombre` — obligatorio y editable
- `descripcion` — opcional y editable
- `cantidad` — obligatorio
- `unidad` — obligatorio (`GR`, `ML`, `UN`)
- `activo`
- `proveedor_item_id` / `manual_cost_option_id` / `formulado_item_formulado_id`
- `created_at`
- `updated_at`

#### `app.item_envase`

- `item_envase_id`
- `nombre`
- `descripcion`
- `activo`
- `proveedor_item_id` / `manual_cost_option_id`
- `created_at`
- `updated_at`

#### `app.item_etiqueta`

- `item_etiqueta_id`
- `nombre`
- `material`
- `medidas`
- `descripcion`
- `activo`
- `proveedor_item_id` / `manual_cost_option_id`
- `created_at`
- `updated_at`

#### `app.item_paqueteria`

- `item_paqueteria_id`
- `nombre`
- `descripcion`
- `activo`
- `proveedor_item_id` / `manual_cost_option_id`
- `created_at`
- `updated_at`

### Invariantes nuevas propuestas

- `Item Comercial` siempre referencia un único origen técnico.
- La ofertabilidad mira contenido base + componentes obligatorios de `Item Envase` y `Item Etiqueta`.
- `Item Paquetería` no bloquea la oferta.
- El stock real sigue anclado al origen técnico; `Item Comercial` no guarda stock propio.
- Los movimientos no comerciales siguen operando sobre `MANUAL`, `PROVEEDOR` o `FORMULADO`.
