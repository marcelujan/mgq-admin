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

- `ancho_mm`
- `largo_mm`

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


## Decisión adicional sobre medidas de `Items Etiqueta`

Se abandona el campo textual único `medidas` como entrada principal.

La UI y la API de `Items Etiqueta` deben trabajar con dos campos numéricos separados:

- `ancho_mm`
- `largo_mm`

Motivo:

- evita formatos ambiguos con o sin espacios;
- evita depender de validaciones de texto frágiles;
- deja el tamaño listo para mapearlo luego a un formato/modelo de BarTender.

La presentación en tabla puede seguir viéndose como `ancho x largo`, pero el almacenamiento debe quedar separado.
