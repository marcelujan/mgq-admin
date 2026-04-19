## 2026-04-21 — Ajustes de Stock (producción e ingresos)
- Producción: fecha obligatoria y tamaño de lote pasan a la primera fila, justo debajo del título.
- Producción: el selector redundante de componentes se elimina de la cabecera y se integra dentro de `Componentes utilizados`.
- Producción: la tabla de componentes ahora muestra `% p/p`, cantidad necesaria para el lote, densidad, volumen equivalente y cantidad real editable.
- Ingreso / Ajuste: fecha y cantidad pasan a la primera fila, antes del selector del ítem.
- StockTargetPicker: se corrige el uso del tipo `StockTargetItem` en la carga de resultados.

# CHANGELOG

## 2026-04-19
- Items Comerciales: `Cantidad` y `Unidad` se movieron debajo del selector de bulk.
- Relaciones de Envases y Etiquetas: el alta ya no pide cantidad previa; agrega con cantidad inicial `1`, editable luego en la fila.
- Relaciones de Envases y Etiquetas: el botón `Agregar` se reemplazó por `+`.


## 2026-04-20
- Stock real v2: se agrega primer lote de API y UI para saldos, ingreso, ajuste y producción.
- Nueva hoja `Stock` con tabla de saldos y operaciones recientes.
- Nuevos endpoints: `stock-objetivos`, `stock-saldos`, `stock-operaciones`, `stock-operaciones/ingreso`, `stock-operaciones/ajuste`, `stock-operaciones/produccion`.


## 2026-04-21
- Stock: tabla de saldos con orden por encabezado (orden inicial por nombre).
- Stock: accesos y botones compactados para seguir el lenguaje visual de `Items`.
- Ingreso / Ajuste: se elimina la nota del formulario y se muestra la UOM esperada junto a la cantidad.
- Producción: se sugieren componentes desde la fórmula del formulado seleccionado, manteniendo edición libre de cantidades reales.
- Producción: se muestra densidad en selectores y filas cuando existe.
- Stock: se agrega edición de operaciones recientes mediante `/stock/operaciones/[stock_operacion_id]`.

## 2026-04-19 — Ajustes finos en Stock (UI y formularios)

- `Producción`: la fecha pasa a ser `date` (sin hora), obligatoria y sugerida por defecto con el día actual.
- `Ajuste` e `Ingreso`: la fecha también pasa a `date` (sin hora), obligatoria y con día actual por defecto.
- `Producción`: se elimina la columna UOM separada y se deja la unidad solo junto al campo editable de cantidad.
- `Producción`: se reordena la pantalla para dejar fecha antes de las tablas de cantidades reales.
- `Stock`: tablas de saldos y operaciones recientes limitadas visualmente a 6 filas con scroll vertical.
- `StockTargetPicker`: el label pasa a ser opcional para permitir pickers más compactos en Producción.
