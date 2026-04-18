# 09_DECISIONES_TECNICAS

## Corrección de modelo para `Items Envases`, `Items Etiqueta` e `Items Paquetería`

Queda descartada la interpretación donde estas hojas eran wrappers con FKs visibles a `MANUAL` o `PROVEEDOR`.

También queda descartada la interpretación donde eran catálogos autónomos sin costo.

### Regla vigente

`Items Envases`, `Items Etiqueta` e `Items Paquetería` son **ítems propios con costo**.

Cada uno debe guardar directamente:

- `nombre`
- `uom`
- `cantidad_referencia`
- `costo_ars`

Y solo `Items Etiqueta` agrega:

- `medidas`

### Qué se conserva

- `Items Comerciales` sigue naciendo de un único origen técnico
- `Items Comerciales` después selecciona `Items Envases` y `Items Etiqueta`
- `Items Paquetería` sigue fuera de la lógica de bloqueo de oferta
- la app sigue usando `GR`, `ML` y `UN`

### Qué se descarta

- `descripcion` en estas tres hojas
- `material` en `Items Etiqueta`
- inputs libres de `manual_cost_option_id`
- inputs libres de `proveedor_item_id`

### Estado de implementación

La migración anterior que dejó estos catálogos sin costo queda superada.

El nuevo corte correcto agrega costo y lote/cantidad de referencia directamente en las tablas propias de:

- `app.item_envase`
- `app.item_etiqueta`
- `app.item_paqueteria`
