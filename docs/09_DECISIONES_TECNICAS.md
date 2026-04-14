# 09_DECISIONES_TECNICAS.md
## Decisiones técnicas

(Registrar aquí decisiones que cambian reglas, dominios, endpoints o esquemas.)


## 2026-04-09 — Estándar de fechas operacionales

Se adopta la siguiente convención:

- `created_at` / `updated_at`: timestamps absolutos del sistema (Postgres / UTC).
- `as_of_date` / `fecha` de snapshots diarios: fecha operacional local de la app en `America/Argentina/Cordoba`.

Alcance del cambio implementado en esta iteración:
- alta por URL (`/api/ofertas`, `/api/ofertas/bulk`) deja de sembrar `item_price_daily_pres` con `current_date` implícito y usa una fecha calculada explícitamente en zona local de la app;
- la UI recibe `as_of_date` para reflejar la misma fecha usada por backend.

Fuera de alcance por ahora:
- migrar en una sola iteración todos los cron y snapshots existentes que hoy dependen de `current_date`.

## 2026-04-09 — SKU opcional en PuraQuimica

- `articulo_prov` sigue existiendo como campo opcional en `item_seguimiento`.
- En PuraQuimica la ausencia de SKU no bloquea ni degrada el preview/create.
- La identidad mínima aceptada del item proveedor PuraQuimica es `url_canonica` + `descripcion_fuente` cuando existe.


## 2026-04-14 — Línea futura de comercialización (propuesta aceptada, no implementada)

Estado: **definición de diseño aceptada, todavía no implementada en código ni schema**.

### Corte de dominio

Se preserva como base viva actual:

- `item_seguimiento` / `offers` / `pricing_daily_run_items` para PROVEEDOR
- `cost_option` / `cost_option_snapshot` para MANUAL
- `producto` / `producto_formula_v2` / `producto_formula_linea_v2` / `item_formulado` / `item_formulado_snapshot` para FORMULADO

La capa comercial legacy actual (`producto_oferta`, `producto_oferta_packaging`, `producto_oferta_costo_snapshot`, `producto_oferta_extra`, `packaging_item`) se considera **legacy no activa** para el nuevo diseño comercial. No debe tomarse como base conceptual obligatoria del rediseño.

### Nuevas listas operativas deseadas

Se define como dirección futura la separación en listas independientes:

- `Items Comerciales`
- `Items Envase`
- `Items Etiqueta`
- `Items Paquetería`

### Reglas de `Item Comercial`

`Item Comercial` representa una **variante vendible concreta** y debe nacer de un **único origen técnico**.

Origen técnico permitido:

- `PROVEEDOR`
- `MANUAL`
- `FORMULADO`

Si una variante vendible requiere consolidar múltiples orígenes, esa consolidación debe resolverse **antes** en `Items Formulados`. `Item Comercial` no mezcla múltiples orígenes técnicos.

Campos mínimos aceptados para `Item Comercial`:

Obligatorios:
- `nombre`
- `origen técnico único`
- `cantidad`
- `unidad` (`GR`, `ML` o `UN`)

Opcionales:
- `descripcion`
- asociaciones a `Items Envase`
- asociaciones a `Items Etiqueta`

Todos los campos del `Item Comercial` deben permanecer **editables** luego del alta, incluido el nombre.

### Reglas de stock y ofertabilidad

La app opera internamente solo con las unidades:

- `GR`
- `ML`
- `UN`

El stock real vive en los **orígenes técnicos**. `Item Comercial` no mantiene stock propio de producto terminado.

Para un `Item Comercial`, el mínimo operativo para cálculo de stock/ofertabilidad es:

- `cantidad`
- `unidad`

Reglas:

- Si la unidad es `UN`, no se exige nada más. El item comercial consume una cantidad entera positiva de unidades base por venta.
- Si la unidad es `GR` o `ML` y no hay conversión masa↔volumen, no se exige nada más.
- Si existe conversión `GR ↔ ML`, la densidad se vuelve obligatoria.

### Densidad

Existe una sola densidad por origen técnico (`MANUAL`, `PROVEEDOR`, `FORMULADO`).

- No es obligatoria al crear el origen técnico.
- Debe mostrarse y poder editarse durante el alta/edición del `Item Comercial`.
- Solo debe exigirse cuando la conversión `GR ↔ ML` realmente la necesita.
- No se crean nuevas tablas, listas ni campos paralelos de densidad.

### Reglas de componentes operativos

`Item Comercial` puede asociar componentes de tres listas distintas:

- `Items Envase`
- `Items Etiqueta`
- `Items Paquetería`

#### `Items Envase`

Lista operativa separada. Su contenido concreto puede cargarse manualmente o venir desde proveedor. No se predefine rígidamente.

#### `Items Etiqueta`

Lista operativa separada. `Item Etiqueta` se define como componente consumible que puede exigirse para vender la variante.

Dato adicional aceptado por ahora:

- `medidas` con formato `ancho x largo` en milímetros

Ese dato servirá más adelante para asociar la variante al modelo correcto de BarTender.

#### `Items Paquetería`

Lista operativa separada. La paquetería **no bloquea** la posibilidad de ofertar.

- Se selecciona manualmente al preparar la venta.
- Se informa cantidad usada de cada item de paquetería.
- Se descuenta del stock real solo para control operativo.
- Si falta stock, debe advertirse, pero no debe apagar la oferta comercial automáticamente.

### Bloqueantes de ofertabilidad

Un `Item Comercial` es ofertable si tiene stock suficiente de:

- su contenido base (origen técnico)
- sus `Items Envase` obligatorios
- sus `Items Etiqueta` obligatorios

`Items Paquetería` queda explícitamente fuera del bloqueo de ofertabilidad.

### Movimientos no comerciales

Las salidas no comerciales deben operar solo sobre los orígenes técnicos, no sobre `Items Comerciales`.

Motivos típicos esperables:

- consumo interno
- regalo / muestra
- merma / pérdida
- ajuste

Cuando aplique, también podrán descontarse componentes operativos usados (envase, etiqueta, paquetería), pero el evento nace desde el stock del origen técnico.

### BarTender (línea futura)

La línea futura aceptada es:

- `mgq-admin` como fuente de verdad
- BarTender como consumidor de lectura para impresión estandarizada

No se documenta ninguna integración implementada por ahora.

### Propuesta de esquema mínimo v1 (todavía no implementada)

El corte mínimo futuro aceptado por diseño requiere una capa nueva separada de la legacy comercial actual:

- entidad de `Item Comercial` con origen técnico único
- lista de `Item Envase`
- lista de `Item Etiqueta`
- lista de `Item Paquetería`
- asociaciones opcionales de `Item Comercial` a `Item Envase` e `Item Etiqueta`

La tabla agregada de `/items` deberá incorporar después estos nuevos tipos con criterio propio de `OK | FAIL | PEND`, pero esa lógica todavía no se considera implementada.
