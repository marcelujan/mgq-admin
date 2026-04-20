# Frontend – Hoja mínima de Publicaciones

## Hoja propuesta
- `/publicaciones`

## Hoja de alta
- `/publicaciones/new`

## Hoja de edición
- `/publicaciones/[publicacion_id]`

## Tabla principal

Columnas mínimas:

- Publicación #
- Canal
- Item Comercial
- Título
- Precio
- Estado
- Acciones

## Estilo visual

Seguir el mismo patrón compacto ya validado en:
- `Items`
- `Items Comerciales`
- `Stock`

Criterios:
- tipografía chica
- una línea por fila
- acciones inline
- filtros simples
- estado por color, sin iconografía extra innecesaria

## Filtros mínimos

- Buscar
- Canal
- Estado

## Estado por color

- Gris = Borrador
- Amarillo = Lista
- Verde = Publicada
- Rojo = Pausada

## Nota sobre imágenes y texto base

Queda explicitado que **todavía no** se implementa la separación entre:
- texto / imágenes base del producto
- texto / imágenes particulares de cada publicación

Esa separación se abordará después de validar la capa mínima de publicaciones.
