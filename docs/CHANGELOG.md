# CHANGELOG

## 2026-04-19
- Items Comerciales: `Cantidad` y `Unidad` se movieron debajo del selector de bulk.
- Relaciones de Envases y Etiquetas: el alta ya no pide cantidad previa; agrega con cantidad inicial `1`, editable luego en la fila.
- Relaciones de Envases y Etiquetas: el botón `Agregar` se reemplazó por `+`.


## 2026-04-19 — stock real mínimo antes de ofertabilidad automática

- Se documenta que la ofertabilidad automática y la lista de faltantes requieren una capa explícita de stock real; el esquema actual solo contiene costos de referencia, no saldos reales.
- Se propone `app.stock_movimiento` como tabla mínima única de movimientos para `PROVEEDOR`, `MANUAL`, `FORMULADO`, `ENVASE`, `ETIQUETA` y `PAQUETERIA`.
- Se deja SQL de revisión en `docs/db/2026_04_19_stock_real_minimo.sql`.
- Se fija que el bloqueo inicial de `Items Comerciales` dependerá de estructura mínima + bulk; `Envases` y `Etiquetas` faltantes entran primero como advertencia y lista de compras.
