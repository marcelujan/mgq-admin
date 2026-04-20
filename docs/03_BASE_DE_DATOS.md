# Capa mínima de Publicaciones

## Objetivo
Separar claramente:

- **Item Comercial** = objeto listo para ofrecer operativamente
- **Publicación** = salida concreta a un canal de venta

Relación propuesta:

- `item_comercial` **1:N** `publicacion`

## Tabla mínima propuesta: `app.publicacion`

Campos mínimos:

- `publicacion_id` BIGSERIAL PK
- `item_comercial_id` BIGINT NOT NULL FK -> `app.item_comercial(item_comercial_id)`
- `canal` TEXT NOT NULL CHECK (`canal in ('WEB','MERCADO_LIBRE')`)
- `titulo` TEXT NOT NULL
- `descripcion` TEXT NULL
- `precio_venta_ars` NUMERIC(18,2) NULL
- `activa_manual` BOOLEAN NOT NULL DEFAULT false
- `canal_external_id` TEXT NULL
- `estado_publicacion` TEXT NOT NULL DEFAULT 'BORRADOR'
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

Checks mínimos:

- `estado_publicacion in ('BORRADOR','LISTA','PUBLICADA','PAUSADA')`
- `precio_venta_ars is null or precio_venta_ars >= 0`

Índices mínimos:

- `(item_comercial_id)`
- `(canal)`
- `(estado_publicacion)`
- `UNIQUE(item_comercial_id, canal)` para la primera versión

## Regla de dependencia operativa

`publicacion` **no** porta stock propio.  
La posibilidad real de oferta sigue viniendo desde `item_comercial`.

Regla de publicación mínima:

- `gris` en comercial → no publicable
- `rojo` en comercial → no publicable
- `amarillo` en comercial → publicable con advertencias
- `verde` en comercial → publicable

## Contenido base vs contenido por publicación

Esto queda **postergado** para una etapa posterior.

Dirección futura aceptada:

- más adelante separar:
  - **contenido base** (texto e imágenes comunes del producto)
  - **contenido específico de publicación** (texto/imágenes de un canal concreto)

En esta primera versión mínima, `publicacion` guarda solo:
- `titulo`
- `descripcion`

sin introducir todavía una capa de imágenes ni de contenido base.
