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


## 2026-04-14 — Capa comercial futura (dirección aceptada, no implementada aún)

Se fija la siguiente dirección funcional para la evolución comercial de la app, sin declararla como implementada todavía:

### Capas

- **Orígenes técnicos**: `PROVEEDOR`, `MANUAL`, `FORMULADO`.
- **Items Formulados**: deben tender a representar **bulks técnicos**.
- **Catálogos operativos futuros**: `Items Envases`, `Items Etiqueta`, `Items Paquetería`.
- **Capa comercial futura**: `Items Comerciales`, creada manualmente solo para los casos que efectivamente se van a vender.

### Reglas aceptadas

- Cada `Item Comercial` referencia **un único origen técnico**.
- Si para vender algo hay que consolidar varios orígenes, esa consolidación debe ocurrir primero en `Items Formulados`, y luego el `Item Comercial` nace de ese formulado consolidado.
- `Item Comercial` no crea envases/etiquetas/paquetería desde cero: selecciona ítems existentes de los catálogos operativos.
- Los campos del `Item Comercial` deben permanecer **editables** luego del alta, incluido el nombre.

### Campos mínimos aceptados para `Item Comercial`

**Obligatorios**
- nombre
- origen técnico único
- cantidad
- unidad

**Condicionales**
- densidad, solo si la conversión `GR ↔ ML` es necesaria para controlar stock

**Opcionales**
- descripción
- asociaciones a `Items Envases`
- asociaciones a `Items Etiqueta`
- paquetería usada al preparar la venta

### Unidades operativas

La app continúa trabajando exclusivamente con las unidades internas ya existentes:

- `GR`
- `ML`
- `UN`

Reglas:

- El origen técnico define la unidad operativa de stock.
- `Item Comercial` puede venderse en otra cantidad/unidad, pero siempre consume del origen técnico normalizando contra esa unidad.
- En `UN`, el `Item Comercial` puede representar packs o agrupaciones (por ejemplo, `1000 UN`) siempre que el consumo por venta sea una cantidad entera positiva de `UN`.
- Si la conversión entre masa y volumen es necesaria, se exige densidad única del origen técnico.

### Densidad

- Existe una sola densidad por cada origen técnico (`MANUAL`, `FORMULADO`, `PROVEEDOR`).
- No es obligatoria al crear el origen técnico.
- Al crear o editar un `Item Comercial`, la densidad del origen técnico debe mostrarse allí mismo y poder editarse, sin crear una segunda densidad comercial.
- Si no es necesaria para la unidad elegida, el flujo puede continuar sin densidad.
- Si es necesaria para la conversión `GR ↔ ML`, el ingreso numérico de densidad es obligatorio.

### Stock y ofertabilidad

- La app no modela stock de producto terminado para `Items Comerciales`; modela **capacidad armable** a partir del stock real de los orígenes técnicos y de los componentes operativos obligatorios.
- Un `Item Comercial` es ofertable si tiene stock suficiente de su origen técnico y de todos sus componentes **bloqueantes** para al menos una unidad.
- Los componentes bloqueantes aceptados son:
  - contenido base / origen técnico
  - `Item Envase`
  - `Item Etiqueta`
  - accesorio/extra obligatorio si aplica
- `Item Paquetería` **no bloquea** la oferta: se informa manualmente al preparar el pedido y solo descuenta stock para control operativo.

### Etiquetas

- `Item Etiqueta` funciona como consumible bloqueante y, además, aporta el dato operativo mínimo para la futura impresión con BarTender.
- El dato útil adicional aceptado es un único campo de medidas en formato `ancho x largo` (milímetros), por ejemplo `100 x 50`.
- La futura integración con BarTender deberá usar a `mgq-admin` como fuente de verdad y tomar desde `Item Etiqueta` el tamaño necesario para asociar el modelo adecuado de impresión.

### Movimientos no comerciales

- Las salidas no comerciales (`consumo interno`, `regalo/muestra`, `merma/pérdida`, `ajuste`) deben operar sobre el stock de los **orígenes técnicos**, no sobre `Items Comerciales`.
- Esto evita duplicar lógica de stock en la capa comercial y preserva una única fuente real de inventario.

## 2026-04-14 — Corte limpio para la nueva capa comercial (dirección aceptada, no implementada aún)

Se adopta **Opción 2** para la futura capa comercial:

- `Items Comerciales` deberán poder nacer desde **los tres orígenes técnicos** ya existentes: `PROVEEDOR`, `MANUAL` y `FORMULADO`.
- No se hará una migración masiva de los ítems existentes a una capa comercial.
- Solo se crearán manualmente `Items Comerciales` para los casos que efectivamente se quieran vender.

### Consecuencia sobre la capa comercial actual

La estructura comercial hoy presente en código y schema (`producto_oferta`, `producto_oferta_packaging`, `producto_oferta_costo_snapshot`, `packaging_item`, etc.) se considera **draft legacy / no activa operacionalmente** para el nuevo diseño comercial.

Regla aceptada:

- esa estructura existente **no condiciona** el rediseño de `Items Comerciales`;
- puede descartarse conceptualmente como base de la nueva capa comercial;
- pero no debe eliminarse físicamente del código o de la base **antes** de contar con reemplazo explícito, porque sigue siendo referenciada por rutas y borrados actuales de `FORMULADO`.

### Principio de implementación

- La base viva y operativa actual sigue siendo: `MANUAL`, `PROVEEDOR`, `FORMULADO` y sus snapshots existentes.
- La nueva capa comercial debe montarse **encima** de esos tres dominios, sin reutilizar por obligación la semántica actual de `producto_oferta`.
- Si algo de la capa comercial previa resulta reutilizable, será por conveniencia técnica puntual y no por dependencia de dominio.


## 2026-04-14 — Matriz de transición mínima para la nueva capa comercial (diagnóstico, no implementado aún)

Tomando el snapshot actual del código y del schema, se fija el siguiente criterio de transición para implementar la nueva capa comercial sin romper la base viva actual.

### 1) Se conserva como base operativa vigente

Se mantiene sin rediseño inmediato:

- `item_seguimiento` + `offers` + `pricing_daily_run_items` para `PROVEEDOR`
- `cost_option` + `cost_option_snapshot` para `MANUAL`
- `producto` + `producto_formula_v2` + `producto_formula_linea_v2` + `item_formulado` + `item_formulado_snapshot` para `FORMULADO`
- `/api/items` como tabla agregada principal de estado operacional diario

Principio:
- la nueva capa comercial no reemplaza estos dominios; se monta encima.

### 2) Se reemplaza conceptualmente

La capa comercial legacy existente deja de ser el modelo de referencia para el nuevo diseño:

- `producto_oferta`
- `producto_oferta_packaging`
- `producto_oferta_costo_snapshot`
- `producto_oferta_costo_snapshot_packaging`
- `producto_oferta_extra`
- `packaging_item`

Regla:
- estas piezas pueden seguir existiendo transitoriamente en código/base mientras no haya reemplazo completo;
- pero no deben gobernar el diseño de `Items Comerciales`, `Items Envases`, `Items Etiqueta` e `Items Paquetería`.

### 3) Se crea nuevo (mínimo inevitable)

Para soportar `Items Comerciales` nacidos desde `PROVEEDOR`, `MANUAL` o `FORMULADO`, el corte mínimo nuevo deberá cubrir cuatro bloques:

#### A. Catálogos operativos separados
- `Items Envases`
- `Items Etiqueta`
- `Items Paquetería`

#### B. Capa comercial unificada
- `Items Comerciales` con origen técnico único
- cantidad + unidad
- nombre obligatorio
- descripción opcional
- campos editables

#### C. Asociaciones bloqueantes de ofertabilidad
- asociaciones opcionales a `Items Envases`
- asociaciones opcionales a `Items Etiqueta`
- si una asociación se marca como obligatoria para una variante, su faltante bloquea la oferta

#### D. Consumo operativo no bloqueante
- `Items Paquetería` queda fuera de la lógica de bloqueo
- su consumo se informa manualmente al preparar la venta, solo para control de stock

### 4) Regla de implementación mínima

Antes de eliminar físicamente cualquier parte de la capa legacy, debe existir reemplazo explícito de:

- rutas API que hoy referencian `producto_oferta*`
- borrados/limpieza asociados al flujo de `FORMULADO`
- catálogo de packaging hoy unificado

### 5) Principio rector

El nuevo diseño comercial debe introducir la menor cantidad posible de entidades nuevas, pero no debe forzar la reutilización de una semántica legacy que hoy solo sirve a formulados y que nunca estuvo en uso operativo real para comercialización.
