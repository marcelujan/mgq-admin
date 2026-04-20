# API backend – Publicaciones

## Endpoints implementados

### Colección
- `GET /api/publicaciones`
- `POST /api/publicaciones`

### Por id
- `GET /api/publicaciones/[publicacion_id]`
- `PATCH /api/publicaciones/[publicacion_id]`
- `DELETE /api/publicaciones/[publicacion_id]`

## Filtros soportados en GET

- `q`
- `canal`
- `estado`

## Payload mínimo

```json
{
  "item_comercial_id": 123,
  "canal": "WEB",
  "titulo": "Lavandina 1 L",
  "descripcion": "Opcional",
  "precio_venta_ars": 2500,
  "activa_manual": false,
  "canal_external_id": "",
  "estado_publicacion": "BORRADOR"
}
```
