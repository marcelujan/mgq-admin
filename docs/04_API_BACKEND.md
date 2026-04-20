# API backend – Canales de venta

## Endpoints
- `GET /api/publicaciones`
- `POST /api/publicaciones`
- `GET /api/publicaciones/[publicacion_id]`
- `PATCH /api/publicaciones/[publicacion_id]`
- `DELETE /api/publicaciones/[publicacion_id]`

## Canales admitidos
- `DIRECTO`
- `WEB`
- `MERCADO_LIBRE`

## Pricing
En esta etapa el precio final por canal se guarda en:
- `precio_venta_ars`

No se usa todavía automatización fina por canal.
