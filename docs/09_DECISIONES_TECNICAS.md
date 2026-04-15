# 09_DECISIONES_TECNICAS

## Catálogos operativos autónomos

Queda corregida una confusión de modelo detectada en la primera iteración vNext.

### Correcto

- `Items Envases` crea y edita ítems de envase propios.
- `Items Etiqueta` crea y edita ítems de etiqueta propios.
- `Items Paquetería` crea y edita ítems de paquetería propios.

Luego, esos ítems se seleccionan desde `Items Comerciales`.

### Descartado

Se descarta el modelo donde `item_envase`, `item_etiqueta` e `item_paqueteria` funcionaban como wrappers con FK obligatoria a:

- `cost_option`
- `item_seguimiento`

### Consecuencia de base de datos

Las tablas nuevas de catálogos operativos deben quedar autónomas, sin `proveedor_item_id` ni `manual_cost_option_id`.

`item_comercial` conserva su origen técnico único.
