# Frontend – Canales de venta

## Renombre visible
La sección antes llamada `Publicaciones` se muestra en la UI como **Canales de venta**.

Por ahora se conserva:
- la ruta `/publicaciones`
- la tabla `publicacion`

para evitar un refactor más riesgoso.

## Pricing
El precio final queda en la hoja de **Canales de venta**, no en `Item Comercial`.

Campo operativo principal:
- `precio_venta_ars` (visible como **Precio final ARS**)

## Canales habilitados en esta etapa
- `DIRECTO`
- `WEB`
- `MERCADO_LIBRE`
