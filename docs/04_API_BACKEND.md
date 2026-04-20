# API backend – Publicaciones (propuesta mínima)

## Endpoints mínimos

### Colección
- `GET /api/publicaciones`
- `POST /api/publicaciones`

### Por id
- `GET /api/publicaciones/[publicacion_id]`
- `PATCH /api/publicaciones/[publicacion_id]`
- `DELETE /api/publicaciones/[publicacion_id]`

## Payload mínimo de alta

```json
{
  "item_comercial_id": 123,
  "canal": "WEB",
  "titulo": "Lavandina 1 L",
  "descripcion": "Opcional",
  "precio_venta_ars": 2500,
  "activa_manual": false
}
```

## Reglas mínimas

- `item_comercial_id` obligatorio
- `canal` obligatorio
- `titulo` obligatorio
- `descripcion` opcional
- `precio_venta_ars` opcional al crear, pero si existe debe ser >= 0
- `activa_manual` opcional; default `false`

## Estado de publicación

Estados aceptados:

- `BORRADOR`
- `LISTA`
- `PUBLICADA`
- `PAUSADA`

Mapeo visual acordado:

- **Borrador** = gris
- **Lista** = amarillo
- **Publicada** = verde
- **Pausada** = rojo

## Regla de negocio

`publicacion` no decide stock.  
Solo hereda si el `item_comercial` puede o no puede ofertarse operativamente.
