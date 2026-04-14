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

## 2026-04-14 — Criterio para el primer lote de endpoints comerciales vNext

Se adopta un corte mínimo de implementación para evitar abrir demasiados frentes a la vez.

### Entran en el lote 1
- Catálogos operativos:
  - `items-envases`
  - `items-etiqueta`
  - `items-paqueteria`
- Comerciales base:
  - `items-comerciales`

### Queda fuera del lote 1
- asociaciones `item_comercial ↔ envase`
- asociaciones `item_comercial ↔ etiqueta`
- duplicación de `item_comercial`
- integración de los nuevos tipos dentro de `/api/items`
- movimientos de stock nuevos

### Justificación
- Los requisitos `Item Envase` e `Item Etiqueta` son opcionales por variante.
- La paquetería no bloquea oferta.
- El stock real sigue viviendo en los orígenes técnicos.
- Por lo tanto, el corte mínimo funcional puede validarse creando primero los catálogos y el `Item Comercial` base.

## 2026-04-14 — Convención de handlers para vNext

Los handlers nuevos deben copiar el patrón actual de la app:

- colección: `GET`, `POST`
- entidad por id: `GET`, `PATCH`, `DELETE`
- respuestas: `{ ok: boolean, ... }`
- `snake_case` en payloads
- `PATCH` parcial por campos presentes
- validaciones numéricas simples y mensajes cortos
