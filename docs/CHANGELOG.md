# CHANGELOG

## v33

- se corrige nuevamente el modelo de `Items Envases`, `Items Etiqueta` e `Items Paquetería`;
- se descarta tanto el enfoque wrapper con FKs visibles como el enfoque de catálogos autónomos sin costo;
- estas tres hojas pasan a definirse como ítems propios con `uom`, `cantidad_referencia` y `costo_ars`;
- `Items Etiqueta` conserva únicamente `ancho_mm` y `largo_mm` como datos extra;
- se fija que `descripcion` y `material` no deben formar parte visible de estas hojas;
- se corrige la navegación para mantener mismo orden entre header e inicio, sin scroll horizontal y con `DB health` a la derecha.


## v34

- se corrige el modelado de medidas en `Items Etiqueta`;
- se reemplaza el campo textual libre `medidas` por dos campos numéricos separados: `ancho_mm` y `largo_mm`;
- la UI sigue mostrando la medida compactada como `ancho x largo`, pero la persistencia queda separada para futura integración con BarTender;
- se agrega migración para backfill desde valores previos de `medidas` cuando el formato existente sea parseable.
