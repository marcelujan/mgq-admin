# Decisiones técnicas – Publicaciones

## Decisión
Se crea una capa mínima separada llamada **Publicaciones**.

### Regla
- `Item Comercial` = producto listo para ofrecer operativamente
- `Publicación` = salida concreta a un canal de venta

### Relación
- un `Item Comercial` puede tener **0 o más** publicaciones
- en la primera versión, como máximo **una publicación por canal**

## Estados de publicación acordados

- **Borrador** = gris
- **Lista** = amarillo
- **Publicada** = verde
- **Pausada** = rojo

## Alcance de esta primera versión

Sí incluye:
- canal
- título
- descripción
- precio
- estado
- activación manual

No incluye todavía:
- sincronización real con Mercado Libre
- imágenes
- separación de contenido base vs contenido por canal
- métricas de performance de publicación

## Regla importante
La publicación no gobierna stock.  
La disponibilidad operativa sigue viniendo del `Item Comercial`.
