# Decisiones técnicas – Canales de venta y pricing

## Decisión 1
La UI deja de mostrar `Publicaciones` y pasa a mostrar **Canales de venta**.

## Decisión 2
En esta etapa no se renombra la ruta ni la tabla:
- ruta conservada: `/publicaciones`
- tabla conservada: `publicacion`

Eso reduce riesgo de regresión.

## Decisión 3
El pricing final por canal no debe vivir en el formulario principal de `Item Comercial`.

## Decisión 4
La capa correcta para precios finales es **Canales de venta**.

## Decisión 5
Si más adelante se usa un precio de referencia interno, no deberá ocupar el centro del flujo de edición del `Item Comercial`.
