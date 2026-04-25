# API backend – ayuda de pricing en Canales de venta

## Endpoint nuevo
- `GET /api/publicaciones/pricing-context?item_comercial_id=...`

## Qué devuelve
- `costo_referencia_ars` si existe como referencia
- precios ya cargados para el mismo `Item Comercial` en:
  - `DIRECTO`
  - `WEB`
  - `MERCADO_LIBRE`

## Objetivo
Ayudar a fijar el `precio_venta_ars` del canal actual sin automatizar todavía la lógica fina de Mercado Libre.
