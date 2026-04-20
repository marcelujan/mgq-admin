# 09_DECISIONES_TECNICAS

## Capa de Publicaciones / Comercialización (propuesta v1)

### Separación de responsabilidades
- `Item Comercial` sigue siendo el objeto preparado para ofrecer.
- `Publicación` representa la salida a un canal de venta concreto.
- No se mezclan datos de canal dentro del dominio técnico ni dentro del stock.

### Regla principal
Un mismo `Item Comercial` puede tener cero o más publicaciones.

Ejemplos:
- una publicación en Web
- una publicación en Mercado Libre
- futuras publicaciones en otros canales

### Relación sugerida
- `Item Comercial` 1:N `Publicación`

### Campos mínimos recomendados para `Publicación`
- `publicacion_id`
- `item_comercial_id`
- `canal`
- `titulo`
- `descripcion`
- `precio_venta_ars`
- `activa_manual`
- `canal_external_id` (opcional, para Mercado Libre u otro canal)
- `canal_status` (opcional)
- `created_at`
- `updated_at`

### Qué NO debería duplicar `Publicación`
- stock real
- densidad
- bulk
- envases
- etiquetas
- costo técnico
- costo de componentes

Todo eso sigue viviendo en:
- origen técnico
- `Item Comercial`
- stock real y movimientos

### Disponibilidad para publicar
La publicación no debería tener una lógica independiente de stock.

Debe heredar la posibilidad de oferta del `Item Comercial`:
- gris → no publicable
- rojo → no publicable
- amarillo → publicable con advertencias
- verde → publicable

### Estados sugeridos de `Publicación`
Para no complejizar demasiado, la primera versión puede usar solo:
- `BORRADOR`
- `LISTA`
- `PUBLICADA`
- `PAUSADA`

#### BORRADOR
Falta:
- título
- precio
- o el `Item Comercial` todavía no está en estado publicable

#### LISTA
- tiene título
- tiene precio
- el `Item Comercial` está amarillo o verde
- todavía no fue enviada/sincronizada a un canal

#### PUBLICADA
- ya existe en el canal

#### PAUSADA
- se pausó manualmente
- o el `Item Comercial` cayó en rojo o gris

### Orden recomendado de implementación
1. Crear hoja `Publicaciones`
2. Crear entidad mínima `Publicación`
3. Preparar publicaciones sin conexión real a Mercado Libre
4. Recién después abrir sincronización real con canal

### Motivación
Esto mantiene separadas:
- preparación operativa
- ofertabilidad
- publicación por canal
- sincronización externa
