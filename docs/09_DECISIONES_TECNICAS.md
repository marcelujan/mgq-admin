# 09_DECISIONES_TECNICAS.md
## Decisiones técnicas

(Registrar aquí decisiones que cambian reglas, dominios, endpoints o esquemas.)


## 2026-04-09 — Estándar de fechas operacionales

Se adopta la siguiente convención:

- `created_at` / `updated_at`: timestamps absolutos del sistema (Postgres / UTC).
- `as_of_date` / `fecha` de snapshots diarios: fecha operacional local de la app en `America/Argentina/Cordoba`.

Alcance del cambio implementado en esta iteración:
- alta por URL (`/api/ofertas`, `/api/ofertas/bulk`) deja de sembrar `item_price_daily_pres` con `current_date` implícito y usa una fecha calculada explícitamente en zona local de la app;
- la UI recibe `as_of_date` para reflejar la misma fecha usada por backend.

Fuera de alcance por ahora:
- migrar en una sola iteración todos los cron y snapshots existentes que hoy dependen de `current_date`.

## 2026-04-09 — SKU opcional en PuraQuimica

- `articulo_prov` sigue existiendo como campo opcional en `item_seguimiento`.
- En PuraQuimica la ausencia de SKU no bloquea ni degrada el preview/create.
- La identidad mínima aceptada del item proveedor PuraQuimica es `url_canonica` + `descripcion_fuente` cuando existe.


## 2026-04-14 — Línea comercial v2 (dirección futura aceptada, no implementada aún)

Se adopta la siguiente dirección conceptual para comercialización:

- `Item Comercial` nace desde un único origen técnico: `PROVEEDOR`, `MANUAL` o `FORMULADO`.
- Si una venta requiere consolidar múltiples orígenes, esa consolidación debe resolverse primero en `Items Formulados`.
- `Items Formulados` tiende a representar `BULK` técnico; no la publicación/comercialización final.

### Unidad y stock

- La app sigue trabajando solo con `GR`, `ML` y `UN`.
- La unidad del origen técnico se define en el origen (`MANUAL`, `FORMULADO`) o se hereda desde proveedor.
- `Item Comercial` define cuánto consume del origen técnico mediante `cantidad + unidad`.
- Si el origen está en `UN`, el comercial puede representar packs (por ejemplo `1000 UN`) consumiendo una cantidad entera fija del origen.
- Si hay conversión `GR ↔ ML`, la densidad es obligatoria.
- La densidad sigue siendo única por origen técnico; no se crea una densidad separada para `Item Comercial`.
- La densidad puede mostrarse y editarse desde el flujo de `Item Comercial`, pero el valor persistido sigue siendo uno solo.

### Requisitos de oferta

- `Items Envases`, `Items Etiqueta` y `Items Paquetería` se administrarán como listas separadas.
- `Item Comercial` selecciona ítems de esas listas; no redefine esos componentes desde cero.
- `Items Envases` e `Items Etiqueta` pueden ser opcionales por variante comercial.
- Si una variante los marca como obligatorios, su faltante bloquea la ofertabilidad.
- `Items Paquetería` no bloquea la oferta; su consumo se informa manualmente al preparar el pedido y solo afecta control de stock.

### Item Etiqueta

- `Item Etiqueta` es un consumible exigible por variante.
- Además porta el dato operativo de `medidas` en formato `ancho x largo` para futura asociación con plantillas/modelos de impresión de BarTender.
- No se agregan listas o tablas extra de densidad/etiquetas especiales.

### Movimientos no comerciales

- Los movimientos no comerciales (`consumo interno`, `regalo/muestra`, `merma/pérdida`, `ajuste`) operan sobre el stock de los orígenes técnicos.
- No nacen desde `Items Comerciales`.

### UI aceptada para la nueva capa

- La nueva capa comercial debe respetar el estilo compacto ya usado en la app: tablas densas, tipografía chica, una línea por fila, acciones inline y formularios simples.
- No se adopta un estilo dashboard ni componentes visuales grandes para estas hojas.


## 2026-04-14 — Esquema mínimo propuesto para la línea comercial v2 (no implementado aún)

Se adopta como corte mínimo propuesto el siguiente esquema nuevo, sin reemplazar todavía la base viva de `PROVEEDOR`, `MANUAL` y `FORMULADO`:

- `app.item_comercial`
- `app.item_envase`
- `app.item_etiqueta`
- `app.item_paqueteria`
- `app.item_comercial_envase`
- `app.item_comercial_etiqueta`

### Reglas estructurales

- `app.item_comercial` referencia exactamente un origen técnico mediante una de estas FKs:
  - `proveedor_item_id`
  - `manual_cost_option_id`
  - `formulado_item_formulado_id`
- `app.item_envase`, `app.item_etiqueta` y `app.item_paqueteria` referencian exactamente un origen técnico de tipo `PROVEEDOR` o `MANUAL`.
- `app.item_comercial_envase` y `app.item_comercial_etiqueta` modelan asociaciones N:M con `cantidad` y `obligatorio`.
- No se propone `app.item_comercial_paqueteria` en v1.

### Checks mínimos aceptados

- exactamente una FK de origen técnico por fila en `item_comercial`, `item_envase`, `item_etiqueta` e `item_paqueteria`
- `unidad in ('GR','ML','UN')` en `item_comercial`
- `cantidad > 0` en `item_comercial`, `item_comercial_envase` e `item_comercial_etiqueta`
- `medidas` obligatoria en `item_etiqueta`
- UNIQUE (`item_comercial_id`, `item_envase_id`) en `item_comercial_envase`
- UNIQUE (`item_comercial_id`, `item_etiqueta_id`) en `item_comercial_etiqueta`

### Restricciones de alcance

- No se tocan todavía cron ni snapshots existentes.
- No se reutiliza `producto_oferta` como molde obligatorio del nuevo diseño comercial.
- La capa comercial legacy puede mantenerse transitoriamente en código/base mientras se la reemplaza, pero queda descartada como modelo conceptual para la v2.


## 2026-04-14 — Endpoints y pantallas mínimas para la línea comercial v2 (no implementados aún)

Se acepta como dirección futura el siguiente corte mínimo de implementación:

### Endpoints

- `/api/items-comerciales`
- `/api/items-comerciales/[item_comercial_id]`
- `/api/items-comerciales/[item_comercial_id]/envases`
- `/api/items-comerciales/[item_comercial_id]/envases/[item_comercial_envase_id]`
- `/api/items-comerciales/[item_comercial_id]/etiquetas`
- `/api/items-comerciales/[item_comercial_id]/etiquetas/[item_comercial_etiqueta_id]`
- `/api/items-comerciales/[item_comercial_id]/duplicate`
- `/api/items-envases`
- `/api/items-envases/[item_envase_id]`
- `/api/items-etiqueta`
- `/api/items-etiqueta/[item_etiqueta_id]`
- `/api/items-paqueteria`
- `/api/items-paqueteria/[item_paqueteria_id]`

### Hojas UI

- `/items-comerciales`
- `/items-comerciales/new`
- `/items-comerciales/[item_comercial_id]`
- `/items-envases`
- `/items-envases/new`
- `/items-envases/[item_envase_id]`
- `/items-etiqueta`
- `/items-etiqueta/new`
- `/items-etiqueta/[item_etiqueta_id]`
- `/items-paqueteria`
- `/items-paqueteria/new`
- `/items-paqueteria/[item_paqueteria_id]`

### Criterios de implementación aceptados

- Se reutiliza el patrón actual de Next.js App Router ya usado en la app: `page.tsx` liviana + `*-client.tsx` + handlers REST por colección y por id.
- No se introduce wizard para alta/edición en v1.
- La duplicación rápida se acepta solo para `Items Comerciales`.
- `Items Paquetería` sigue sin asociación fija obligatoria al comercial en v1.
- Antes de integrar estas nuevas hojas a la tabla general `Items`, debe definirse su política propia de `OK | FAIL | PEND`.
