# Frontend – Pricing por canal

## Hoja de trabajo segura
Para evitar regresiones en el formulario principal de `Item Comercial`, se agrega una hoja específica:

- `/items-comerciales/[item_comercial_id]/pricing`

Esta hoja usa el mismo panel de pricing por canal ya preparado y permite trabajar pricing sin tocar todavía el detalle principal si se quiere avanzar por etapas.

## Regla práctica
Primero validar:
- guardado de pricing
- lectura de pricing
- sugerencia de costo de referencia

Luego, si el flujo queda bien, integrar el mismo bloque dentro de `Editar Item Comercial`.
