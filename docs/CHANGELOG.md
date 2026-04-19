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
