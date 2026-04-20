# Decisiones técnicas – pricing por canal

## Decisión 1
Se acepta el siguiente bloque mínimo de pricing:

- `costo_referencia_ars`
- `margen_referencia_pct`
- `precio_sin_impuestos`
- `precio_directo`
- `precio_web`
- `precio_ml`

## Decisión 2
En la primera versión, los precios por canal serán **editables**, no estrictamente calculados.

## Decisión 3
`costo_referencia_ars` se tratará como dato sugerido desde el costeo del `Item Comercial`, no como una segunda fuente de verdad.

## Decisión 4
Mercado Libre queda inicialmente como precio manual:
- sin recargo fijo rígido
- sin automatización obligatoria
- con posibilidad futura de simulación por API

## Decisión 5
El pricing debe separarse del estado operativo:
- `Item Comercial` dice si se puede ofertar
- `Pricing` dice a qué precio conviene hacerlo por canal
