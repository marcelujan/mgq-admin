# CHANGELOG

- Fix: `Items Etiqueta` vuelve a persistir el campo legacy `medidas` junto con `ancho_mm` y `largo_mm` para no violar el `NOT NULL` todavía presente en la base.

- vNext: `Items Comerciales` pasa a seleccionar origen técnico desde lista buscable y suma edición de asociaciones `Envases` / `Etiquetas` con CRUD inline.
