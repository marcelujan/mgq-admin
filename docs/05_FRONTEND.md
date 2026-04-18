# 05_FRONTEND

## Navegación

La banda superior y la hoja `Inicio` deben mostrar el mismo orden de hojas operativas:

1. Items
2. Items Manuales
3. Items Formulados
4. Items Proveedores
5. Items Comerciales
6. Items Envases
7. Items Etiqueta
8. Items Paquetería
9. Dólar Histórico
10. Jobs manual

Reglas visuales:

- no usar scroll horizontal en el header;
- priorizar enlaces de texto compactos por sobre botones anchos;
- permitir envoltura en dos filas si hace falta;
- mantener `DB health` a la derecha.

## Hojas `Items Envases`, `Items Etiqueta` e `Items Paquetería`

Estas hojas no son catálogos livianos sin costo.

Son hojas de alta y edición de ítems propios con formato operativo similar a `Items Manuales`.

### Campos visibles correctos

#### Items Envases
- `nombre`
- `uom`
- `cantidad_referencia`
- `costo_ars`

#### Items Etiqueta
- `nombre`
- `uom`
- `cantidad_referencia`
- `costo_ars`
- `medidas`

#### Items Paquetería
- `nombre`
- `uom`
- `cantidad_referencia`
- `costo_ars`

### Campos que no deben verse

- `descripcion`
- `material`
- FKs crudas de origen

## Items Comerciales

`Items Comerciales` mantiene su rol como capa comercial que luego selecciona:

- `Items Envases`
- `Items Etiqueta`

`Items Paquetería` sigue quedando fuera de la lógica de bloqueo de oferta y se informa manualmente al preparar el pedido.
