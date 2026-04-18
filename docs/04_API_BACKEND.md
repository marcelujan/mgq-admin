# 04_API_BACKEND

## vNext — `Items Envases`, `Items Etiqueta` e `Items Paquetería`

Se descarta la línea anterior que intentaba modelar estas hojas como wrappers con FKs a `MANUAL` o `PROVEEDOR`, y también la línea posterior que las dejaba como catálogos autónomos sin costo.

### Contrato correcto esperado

Estas tres hojas se comportan como **ítems propios con costo**.

Cada registro debe guardar directamente:

- `nombre`
- `uom` (`GR`, `ML`, `UN`)
- `cantidad_referencia`
- `costo_ars`

Y además, solo en `Items Etiqueta`:

- `ancho_mm`
- `largo_mm`

Se descarta el campo libre `medidas` porque no garantiza un formato estable para integración futura con BarTender.

### Campos descartados para estas tres hojas

- `descripcion`
- `material`
- `manual_cost_option_id` como input libre
- `proveedor_item_id` como input libre

### Endpoints esperados

- `GET /api/items-envases`
- `POST /api/items-envases`
- `GET /api/items-envases/[item_envase_id]`
- `PATCH /api/items-envases/[item_envase_id]`
- `DELETE /api/items-envases/[item_envase_id]`

- `GET /api/items-etiqueta`
- `POST /api/items-etiqueta`
- `GET /api/items-etiqueta/[item_etiqueta_id]`
- `PATCH /api/items-etiqueta/[item_etiqueta_id]`
- `DELETE /api/items-etiqueta/[item_etiqueta_id]`

- `GET /api/items-paqueteria`
- `POST /api/items-paqueteria`
- `GET /api/items-paqueteria/[item_paqueteria_id]`
- `PATCH /api/items-paqueteria/[item_paqueteria_id]`
- `DELETE /api/items-paqueteria/[item_paqueteria_id]`

### Validaciones mínimas

- `uom in ('GR','ML','UN')`
- `cantidad_referencia > 0`
- `costo_ars >= 0`
- si `uom = 'UN'`, entonces `cantidad_referencia` debe ser entera
- en `Items Etiqueta`, `ancho_mm` y `largo_mm` son obligatorios y enteros positivos

### Nota sobre proveedor motor

La posibilidad de crear estos ítems desde un motor de proveedor sigue abierta, pero no se implementa todavía en este corte.

En esta iteración se consolida primero el flujo manual con costo y lote de referencia.
