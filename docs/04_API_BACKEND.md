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


## vNext — Asociaciones de `Items Comerciales`

Primer corte implementable para relaciones bloqueantes del comercial:

- `GET /api/origenes-tecnicos?tipo=MANUAL|PROVEEDOR|FORMULADO&search=`
- `GET /api/items-comerciales/[item_comercial_id]/envases`
- `POST /api/items-comerciales/[item_comercial_id]/envases`
- `PATCH /api/items-comerciales/[item_comercial_id]/envases/[item_comercial_envase_id]`
- `DELETE /api/items-comerciales/[item_comercial_id]/envases/[item_comercial_envase_id]`
- `GET /api/items-comerciales/[item_comercial_id]/etiquetas`
- `POST /api/items-comerciales/[item_comercial_id]/etiquetas`
- `PATCH /api/items-comerciales/[item_comercial_id]/etiquetas/[item_comercial_etiqueta_id]`
- `DELETE /api/items-comerciales/[item_comercial_id]/etiquetas/[item_comercial_etiqueta_id]`

### Reglas de payload

Para agregar una asociación:

- Envase: `{ item_envase_id, cantidad, obligatorio }`
- Etiqueta: `{ item_etiqueta_id, cantidad, obligatorio }`

Para editar una asociación:

- `PATCH` parcial con `cantidad` y/o `obligatorio`

### Reglas operativas

- `Items Comerciales` se crean primero y luego se editan para asociar envases y etiquetas.
- `Items Paquetería` sigue fuera de la lógica de bloqueo y no entra todavía en estas relaciones.
- La selección de origen técnico del comercial no debe pedir IDs crudos; debe resolverse mediante lista buscable desde `/api/origenes-tecnicos`.

### `/api/origenes-tecnicos`

- Si `search` viene vacío, la API debe devolver el universo disponible del tipo solicitado (con límite alto), sin recorte corto por default.
- Cada origen técnico puede devolver además datos de referencia de costeo:
  - `ref_uom`
  - `ref_cantidad`
  - `costo_ref_ars`
  - `densidad_g_ml`
- Para `FORMULADO`, puede devolver `producto_id` cuando haga falta persistir densidad.
- Para `PROVEEDOR`, puede devolver `ref_presentacion` cuando haga falta persistir densidad.

### `POST /api/origenes-tecnicos/densidad`

Endpoint auxiliar para persistir densidad desde la hoja de `Items Comerciales` cuando el cambio de unidad exige conversión `GR ↔ ML`.

Payload mínimo:

- `tipo`: `MANUAL` | `PROVEEDOR` | `FORMULADO`
- `id`
- `densidad_g_ml`

Campos extra según origen:

- `FORMULADO`: `producto_id`
- `PROVEEDOR`: `ref_presentacion`


---

## Próximo corte backend — stock real y ofertabilidad

Antes de exponer filtros por estado real, lista de faltantes y compras sugeridas, el backend necesita una fuente única de stock real.

### Tabla mínima propuesta

- `app.stock_movimiento`

### Endpoints mínimos sugeridos

- `GET /api/stock-movimientos`
- `POST /api/stock-movimientos`
- `GET /api/stock-saldos`
- `GET /api/items-comerciales/disponibilidad`
- `GET /api/items-comerciales/faltantes`

### Regla operativa

- `Borrador`: falta estructura mínima del `Item Comercial`.
- `Ofertable`: estructura mínima completa y saldo suficiente del bulk para al menos 1 unidad.
- `Bloqueado`: estructura mínima completa pero saldo insuficiente del bulk.
- Faltantes de `Envases` y `Etiquetas`: se exponen como advertencia y lista de compras, no como bloqueo duro en esta primera etapa.
