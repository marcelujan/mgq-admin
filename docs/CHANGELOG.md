# CHANGELOG

- Fix: `Items Etiqueta` vuelve a persistir el campo legacy `medidas` junto con `ancho_mm` y `largo_mm` para no violar el `NOT NULL` todavía presente en la base.

- vNext: `Items Comerciales` pasa a seleccionar origen técnico desde lista buscable y suma edición de asociaciones `Envases` / `Etiquetas` con CRUD inline.

- UX/API: `Items Comerciales` limita la lista visible de origen técnico a 6 filas con scroll, devuelve todos los resultados disponibles cuando no hay filtro y mueve el costeo consolidado al final de la hoja.
- vNext: se agrega `POST /api/origenes-tecnicos/densidad` para persistir densidad desde `Items Comerciales` cuando la conversión `GR ↔ ML` la exige.

- v43: `Items Comerciales` ajusta terminología de `base` a `bulk`, unifica el selector de bulk con el formato compacto de relaciones, muestra una fila separada de `Bulk seleccionado` y elimina la repetición de `Costo base estimado` fuera del bloque final de `Costeo`.
