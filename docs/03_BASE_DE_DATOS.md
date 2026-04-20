# Base de datos – pricing mínimo por canal

## Criterio de trabajo

Se propone separar:

- **costo operativo** del `Item Comercial`
- **pricing comercial**
- **precios finales por canal**

## Estructura mínima propuesta

### Tabla orientativa: `app.item_comercial_pricing`
Relación:
- `item_comercial 1:1 item_comercial_pricing`

Campos mínimos:

- `item_comercial_pricing_id`
- `item_comercial_id`
- `costo_referencia_ars`
- `margen_referencia_pct`
- `precio_sin_impuestos`
- `precio_directo`
- `precio_web`
- `precio_ml`
- `updated_at`

## Interpretación de campos

### `costo_referencia_ars`
No reemplaza el costeo operativo.
Es una foto útil para pricing.

### `margen_referencia_pct`
Campo opcional de ayuda.
No debería imponerse como restricción dura.

### `precio_sin_impuestos`
Precio de referencia.
No es estrictamente un canal, pero se conserva porque resulta útil para cálculos y control.

### `precio_directo`
Precio para ventas directas:
- mostrador
- transferencia
- WhatsApp
- conocidos

### `precio_web`
Precio final para la web propia.

### `precio_ml`
Precio final para Mercado Libre.

## Primera decisión práctica

En primera versión:
- todos los precios por canal son **editables**
- `costo_referencia_ars` puede venir sugerido desde el costeo actual
- `margen_referencia_pct` puede ser editable u opcional
- no se automatiza todavía el cálculo fino de Mercado Libre
