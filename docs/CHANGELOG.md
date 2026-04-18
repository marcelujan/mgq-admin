# CHANGELOG

## v33

- se corrige nuevamente el modelo de `Items Envases`, `Items Etiqueta` e `Items Paquetería`;
- se descarta tanto el enfoque wrapper con FKs visibles como el enfoque de catálogos autónomos sin costo;
- estas tres hojas pasan a definirse como ítems propios con `uom`, `cantidad_referencia` y `costo_ars`;
- `Items Etiqueta` conserva únicamente `medidas` como dato extra;
- se fija que `descripcion` y `material` no deben formar parte visible de estas hojas;
- se corrige la navegación para mantener mismo orden entre header e inicio, sin scroll horizontal y con `DB health` a la derecha.
