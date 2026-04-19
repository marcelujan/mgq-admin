# 05_FRONTEND

## Navegación

La banda superior y la hoja `Inicio` deben mostrar el mismo orden de hojas operativas:

1. Items
2. Items Manuales
3. Items Formulados
4. Items Proveedores
5. Items Comerciales
6. Items Envases
7. Items Etiqueta
8. Items Paquetería
9. Dólar Histórico
10. Jobs manual

Reglas visuales:

- no usar scroll horizontal en el header;
- priorizar enlaces de texto compactos por sobre botones anchos;
- permitir envoltura en dos filas si hace falta;
- mantener `DB health` a la derecha.

## Hojas `Items Envases`, `Items Etiqueta` e `Items Paquetería`

Estas hojas no son catálogos livianos sin costo.

Son hojas de alta y edición de ítems propios con formato operativo similar a `Items Manuales`.

### Campos visibles correctos

#### Items Envases
- `nombre`
- `uom`
- `cantidad_referencia`
- `costo_ars`

#### Items Etiqueta
- `nombre`
- `uom`
- `cantidad_referencia`
- `costo_ars`
- `ancho_mm`
- `largo_mm`

#### Items Paquetería
- `nombre`
- `uom`
- `cantidad_referencia`
- `costo_ars`

### Campos que no deben verse

- `descripcion`
- `material`
- FKs crudas de origen

## Items Comerciales

`Items Comerciales` mantiene su rol como capa comercial que luego selecciona:

- `Items Envases`
- `Items Etiqueta`

`Items Paquetería` sigue quedando fuera de la lógica de bloqueo de oferta y se informa manualmente al preparar el pedido.


## Regla para `Items Etiqueta`

Las medidas de etiqueta no deben cargarse como texto libre.

El formulario debe pedir dos campos numéricos separados:

- `Ancho (mm)`
- `Largo (mm)`

La grilla puede mostrarlo compactado como `ancho x largo`, pero el dato persistido debe quedar separado para evitar ambigüedad al asociar luego el tamaño correcto de BarTender.


## Edición de `Items Comerciales`

El alta de `Item Comercial` debe redirigir al detalle editado para continuar con asociaciones.

La hoja de edición debe mostrar, debajo del bloque base del comercial, dos secciones compactas:

- `Envases asociados`
- `Etiquetas asociadas`

Cada sección debe permitir:

- seleccionar un ítem existente de su lista
- informar `cantidad`
- marcar `obligatorio`
- agregar la relación
- editar `cantidad` y `obligatorio` inline
- eliminar la relación

La selección del origen técnico del comercial debe hacerse desde una lista buscable por tipo:

- `MANUAL`
- `PROVEEDOR`
- `FORMULADO`

No se deben exponer campos de ID libre para estas selecciones.

### Ajustes de UX en `Items Comerciales`

- La lista de resultados del origen técnico debe mostrar hasta 6 filas visibles y luego scroll vertical.
- Si no hay texto en el buscador, deben aparecer todos los resultados disponibles del tipo seleccionado.
- El botón principal de alta/edición debe mostrarse como `Guardar`.
- Si el comercial cambia de familia de unidad respecto del origen (`GR ↔ ML`), se debe mostrar el ingreso de densidad en la misma hoja.
- El costeo consolidado del comercial debe mostrarse al final de la hoja:
  - bulk
  - envases
  - etiquetas
  - total parcial
- El selector de bulk/origen técnico debe seguir el mismo lenguaje visual que las secciones de `Envases asociados` y `Etiquetas asociadas`: lista compacta, hasta 6 filas visibles, y una fila separada para el `Bulk seleccionado` con sus características principales.
- No debe repetirse una tarjeta o bloque aparte de `Costo base estimado` en la cabecera; el costo del bulk debe verse solo en el bloque final de `Costeo`.


## Hoja `Stock`

Se agrega una hoja operativa `Stock` con el mismo lenguaje visual compacto del resto de la app.

Rutas nuevas:

- `/stock`
- `/stock/ingreso`
- `/stock/ajuste`
- `/stock/produccion`

### `/stock`

Muestra:

- filtros simples por tipo y búsqueda
- tabla de saldos actuales
- tabla compacta de operaciones recientes
- accesos a `Ingreso`, `Ajuste` y `Producción`

### `/stock/ingreso`

Formulario compacto para registrar ingreso de stock sobre un ítem stockeable.

### `/stock/ajuste`

Formulario compacto para registrar ajuste positivo o negativo sobre un ítem stockeable.

### `/stock/produccion`

Formulario compacto para registrar una operación de producción con:

- un formulado obtenido
- varios consumos reales

La UI usa el mismo patrón visual que el resto de la app:

- tipografía chica
- tablas compactas
- una sola línea por fila
- selectores buscables con 6 filas visibles y scroll
