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


## 2026-04-14 — Modelo comercial futuro (aprobado, no implementado)

### Alcance

Estas reglas ordenan la futura capa comercial. No describen una implementación ya activa.

### Base viva que se conserva

- `PROVEEDOR`
- `MANUAL`
- `FORMULADO`

Sus snapshots y su lógica operacional diaria actual se conservan como base del sistema.

### Capa comercial legacy

La capa actual basada en `producto_oferta*` / `packaging_item` se considera **legacy conceptual** para este rediseño. No está en uso operativo para comercialización y no debe tomarse como molde obligatorio del nuevo modelo.

### Opción adoptada

Se adopta una capa comercial nueva que podrá nacer directamente desde cualquiera de los tres orígenes técnicos:

- `PROVEEDOR`
- `MANUAL`
- `FORMULADO`

### Regla de origen técnico único

Cada `Item Comercial` referencia un **único origen técnico**.

- Si el producto a vender depende de varios orígenes, esa consolidación debe resolverse primero en `Items Formulados`.
- `Item Comercial` no mezcla varios orígenes en paralelo.

### Catálogos operativos separados

Se adoptan tres listas separadas:

- `Items Envases`
- `Items Etiqueta`
- `Items Paquetería`

Su contenido concreto puede cargarse manualmente o venir desde motores de proveedor. No se preestablece un catálogo rígido.

### Reglas de Item Comercial

Campos mínimos operativos/comerciales aprobados:

- `nombre` — obligatorio
- `descripción` — opcional
- `cantidad` — obligatoria
- `unidad` — obligatoria
- origen técnico único — obligatorio

Todos los campos deben quedar **editables** luego del alta. Esto incluye explícitamente el nombre.

### Unidades internas de la app

La app trabaja únicamente con:

- `GR`
- `ML`
- `UN`

No se introducen otras unidades operativas internas.

### Conversión y densidad

- Existe una sola densidad por cada origen técnico (`MANUAL`, `FORMULADO`, `PROVEEDOR`).
- Esa densidad no es obligatoria al crear el origen técnico.
- En el flujo de `Item Comercial`, la densidad debe mostrarse y poder editarse para no frenar el alta.
- Si la conversión entre `GR` y `ML` la necesita, el ingreso de densidad pasa a ser obligatorio.
- No se crean nuevas tablas o listas de densidad.

### Origen técnico en UN

Cuando el origen técnico está en `UN`, el `Item Comercial` puede venderse como pack o agrupación fija de unidades.

Ejemplo:
- stock origen = `20000 UN`
- item comercial = `1000 UN`
- ofertabilidad = `floor(20000 / 1000)`

### Envases, etiquetas y paquetería

- `Item Envase` y `Item Etiqueta` se seleccionan desde sus listas y se asocian al `Item Comercial`.
- Esas asociaciones son opcionales por variante comercial.
- Si una variante exige ciertos envases o etiquetas, la falta de stock de esos componentes bloquea la ofertabilidad de esa variante.
- `Item Paquetería` no bloquea la oferta. Se informa manualmente al preparar el pedido y solo afecta control de stock.

### Item Etiqueta

`Item Etiqueta` cumple dos funciones:

1. consumible físico exigido por la variante, cuando aplique;
2. parámetro operativo futuro para impresión.

Campos útiles mínimos aprobados para `Item Etiqueta`:

- `material`
- `medidas` con formato `ancho x largo` en milímetros

El campo `medidas` será la referencia para asociar luego el modelo correcto de BarTender.

### Stock y movimientos

- El stock real vive en los orígenes técnicos, no en `Items Comerciales`.
- Los movimientos no comerciales operan solo sobre `MANUAL`, `PROVEEDOR` o `FORMULADO`.
- No se requiere una capa separada de stock reservado en esta etapa.
- Sí debe existir trazabilidad mediante movimientos de inventario.

Tipos mínimos esperados para salidas no comerciales:

- `CONSUMO_INTERNO`
- `REGALO_MUESTRA`
- `MERMA_PERDIDA`
- `AJUSTE`

### BarTender

`mgq-admin` debe seguir siendo la fuente de verdad. BarTender se considera consumidor de lectura para impresión estandarizada futura.
