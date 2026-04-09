- Items proveedor: el selector dentro de edición de formulados deja de mostrar slugs crudos de URL y pasa a usar `descripcion_fuente` / `articulo_prov` desde `item_seguimiento`.
- `/api/items/[item_id]` habilita hard-delete guardado para `PROVEEDOR`, limpiando historial y rows derivados sólo cuando no hay dependencias activas de fórmula/base.
## Unreleased
- Fix formulados nuevos: al agregar una línea v2, el backend autocrea `producto_formula_v2` si faltaba.
- Fix cron formulados: `/api/cron/formulado-costs-daily` detecta productos por header o por líneas.
- Fix BULK reutilizable: `ensureItemFormuladoBulk()` prioriza BULK activo y reactiva uno inactivo antes de crear otro.
- Fix histórico formulados: `/api/items/[item_id]/price-history` prioriza el BULK activo con más snapshots/continuidad.

- 2026-02-22: DB health: se elimina entrada de menú/hoja; el indicador 'DB' en header es clickeable y abre `/api/db-health`.

## UI v2 — Reordenamiento de navegación y hojas por tipo de Item
- Header: orden fijo: Items → Items Manuales → Items Formulados → Items Proveedores → Jobs manual → DB health.
- `/items`: se elimina acción de alta; queda como vista agregada.
- `/items-manuales`: alta + edición de manuales (cost_option MANUAL_PRESENTACION).
- `/items-proveedores`: alta por URLs + panel embebido de Jobs diario.
- DB health: indicador (verde/rojo) en header + página `/db-health`.

- Fix: costo-bulk ahora resuelve BULK_PRODUCTO preferiendo snapshot diario (evita error "fórmula sin líneas" cuando el componente ya tiene snapshot válido).

## 2026-02-20

- UI: editor de producto muestra título por nombre y elimina header redundante del server component.
- UI: costos inline (fijo/variable por lote), y ajuste de formatos decimales.
- UI: tabla de componentes sin segunda línea; bulk muestra nombre real.
- API: /formula-v2/lineas incluye item_url_* y bulk_producto_nombre.

## 2026-02-17

- Docs: alineada semántica de `pricing_daily_runs.status` (DONE requiere pending_count=0 y fail_count=0).
- Docs: agregado playbook SQL para diagnosticar `PARTIAL/PENDING` y diferenciar pendientes reales vs agotados.

# CHANGELOG

## v1 – Fundación del Libro

- Añadido `/docs/01_STACK_Y_ARQUITECTURA.md` (stack, entornos v2/main, límites operativos y variables críticas a nivel conceptual).
- API: inventario de endpoints generado desde `src/app/api/**/route.ts` (v2) y documentado en `04_API_BACKEND.md`.
- Se formaliza el “Libro de la App” y se adopta `00_MANIFIESTO.md`.
- Se documenta modelo de dominio (Producto/Bulk/Oferta/Presentación).
- Se documentan jobs y playbooks de pricing-daily.
- Añadido flujos End-to-End oficiales en `/docs/08_PLAYBOOKS_OPERATIVOS.md`.

---

## v2 – Estándar Tabla Items + Estado Operacional Unificado

### UI

- Definido estándar oficial de tabla Items (una sola línea por fila).
- Separación de columnas: `Item #` y `Nombre`.
- Eliminado dominio como nombre principal en PROVEEDOR.
- Derivación de nombre desde slug de URL cuando no existe nombre explícito.
- Eliminado contenido multilinea en tabla Items.
- Formalizado formato obligatorio de estado:
  
  OK: X | FAIL: Y | PEND: Z

- Prohibido modificar gráficos (comparativo e individuales).

### Dominio

Se formaliza el concepto de **Estado Operacional Diario** unificado:

#### PROVEEDOR
- Basado en `pricing_daily_run_items`.
- Conteo real de ofertas por status del día.

#### FORMULADO
- OK requiere:
  - `item_formulado` tipo BULK activo (reutilizable).
  - Snapshot HOY en `item_formulado_snapshot`.
  - `precio_unitario_ars > 0`.
- PEND si falta snapshot HOY pero BULK existe.
- FAIL si no hay BULK reutilizable o el costo es inválido.

#### MANUAL
- Basado en `cost_option_snapshot`.
- OK si snapshot HOY con `costo_ars > 0`.
- PEND si no existe snapshot HOY.
- FAIL si snapshot HOY existe pero costo inválido.

---

## Principio consolidado

La tabla Items refleja el estado operacional diario real de cada dominio:

- Pricing → PROVEEDOR  
- Formulado-costs → FORMULADO  
- Manual-costs → MANUAL  

Los gráficos mantienen exclusivamente el detalle histórico.

## 2026-02-22

- Fix (frontend): corregida llave extra `{ {` en `ItemsNewClient` que causaba `Expected '}', got '<eof>'` en build.

- Fix FX/EUMA: `app.fx` pasa a resolverse por fecha local `America/Argentina/Cordoba` en vez de `current_date` UTC puro.
- Fix FX/EUMA: flujos USD usan fallback a la última cotización disponible `<= fecha local`.
- Fix proveedor EUMA: ya no se escribe `proveedor.motor_id_default = 2` en `app.proveedor`; la asociación al motor 2 queda inferida por URL en el flujo bulk/preview.

## 2026-04-09

- Se agrega `/api/cron/provider-identity-backfill` para backfill operacional de `descripcion_fuente` / `articulo_prov` en items proveedor históricos, sin tocar ofertas ni snapshots.

- Se incorpora persistencia explícita de identidad visible del item proveedor en `app.item_seguimiento` (`descripcion_fuente`, `articulo_prov`).
- `/api/ofertas/bulk` y `/api/ofertas` ahora siembran esos campos al crear/actualizar items proveedor y además siembran `item_price_daily_pres` del día.
- `runMotorForPricesByPresentacion` expone `title` y `sku` para `PuraQuimica` y `EUMA`, unificando el contrato de preview/create entre ambos proveedores.
- La UI de `/items` y `/items/[item_id]` deja de derivar nombres proveedor desde URLs opacas cuando existe identidad persistida; usa fallback `Proveedor · SKU` antes que mostrar IDs o `osCsid`.
- Se agrega script SQL idempotente `db/patches/2026-04-09_item_seguimiento_provider_identity.sql` con backfill desde `oferta_proveedor`.
