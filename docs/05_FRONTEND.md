# Frontend – Canales de venta y pricing

## Renombre de UI
La hoja visible `Publicaciones` pasa a llamarse **Canales de venta** en la interfaz.

Por ahora se conserva:
- la ruta `/publicaciones`
- la tabla / entidad `publicacion`

para evitar un refactor más riesgoso en esta etapa.

## Pricing
Se retira el bloque `Pricing por canal` del detalle principal de `Item Comercial`.

Criterio aceptado:
- `Item Comercial` no debe cargar el precio final por canal
- el precio por canal pertenece a la capa visible de **Canales de venta**

Si más adelante se conserva un precio de referencia interno, deberá quedar fuera del flujo principal de edición del `Item Comercial`.
