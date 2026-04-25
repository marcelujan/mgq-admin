# API backend – pricing-context

## Ajuste
`GET /api/publicaciones/pricing-context` ahora:
- calcula `costo_referencia_ars` desde el costeo actual del `Item Comercial`
  - bulk
  - envases
  - etiquetas
- sigue devolviendo los precios ya guardados en DIRECTO / WEB / MERCADO_LIBRE
