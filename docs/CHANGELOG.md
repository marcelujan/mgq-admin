## Unreleased
- Fix formulados nuevos: al agregar una línea v2, el backend autocrea `producto_formula_v2` si faltaba.
- Fix cron formulados: `/api/cron/formulado-costs-daily` detecta productos por header o por líneas.
- Fix BULK reutilizable: `ensureItemFormuladoBulk()` prioriza BULK activo y reactiva uno inactivo antes de crear otro.
- Fix histórico formulados: `/api/items/[item_id]/price-history` prioriza el BULK activo con más snapshots/continuidad.

- 2026-02-22: entrada histórica de DB health en changelog mantenida solo como referencia. El estado vigente de UI está documentado en `05_FRONTEND.md`.

## UI v2 — Reordenamiento de navegación y hojas por tipo de Item
- La navegación vigente debe tomarse de `05_FRONTEND.md`, no de esta sección histórica.
- Estado actual documentado: header con `Items → Items Manuales → Items Formulados → Items Proveedores → Dólar Histórico → Jobs manual`, indicador DB no clickeable y hoja técnica `/db-health` no enlazada en menú.
- `/items`: se elimina acción de alta; queda como vista agregada.
- `/items-manuales`: alta + edición de manuales (cost_option MANUAL_PRESENTACION).
- `/items-proveedores`: alta por URLs + panel embebido de Jobs diario.

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

- Fix UI: el icono eliminar en **Items formulados** dejó de estar deshabilitado y ahora ejecuta el mismo DELETE de formulados que la hoja `Items`.


## 2026-04-14

- Docs: corregido `05_FRONTEND.md` para reflejar el estado real actual del header: incluye `Dólar Histórico`, el indicador DB no es clickeable y `/db-health` existe como hoja técnica no enlazada en el menú principal.
- Docs: registrada en `09_DECISIONES_TECNICAS.md` la dirección futura aceptada para `Items Comerciales`, `Items Envases`, `Items Etiqueta` e `Items Paquetería` (sin declararla como implementada).
- Docs: fijadas reglas de stock y ofertabilidad para `Items Comerciales`: origen técnico único, unidades internas `GR | ML | UN`, densidad única por origen técnico y salidas no comerciales operando sobre orígenes técnicos.
- Docs: adoptada Opción 2 para la futura capa comercial; `Items Comerciales` deberán nacer desde `PROVEEDOR`, `MANUAL` o `FORMULADO`, y la capa actual `producto_oferta`/`packaging_item` queda tratada como draft legacy no activo para el nuevo diseño.
