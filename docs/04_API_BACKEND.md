# 04_API_BACKEND.md
## API Backend – Inventario y contratos (v2)

Fuente: rutas Next.js App Router en `src/app/api/**/route.ts` (rama v2).

Notas:
- `Tablas (referencias)` se infiere por ocurrencias de `app.<tabla>` y `app_meta.<tabla>` dentro del archivo. Puede incluir falsos positivos/negativos si el SQL se arma dinámicamente.
- `Query params` se infiere por `searchParams.get(...)`.
- `Response keys` es una heurística basada en `NextResponse.json({ ... })` (solo claves top-level visibles en el literal).

---

## /api/componentes

### `/api/componentes`
- **Archivo:** `src/app/api/componentes/route.ts`
- **Métodos:** GET
- **Query params:** `search`
- **Tablas (referencias):** `insumo`, `producto`, `producto_oferta`
- **Response keys (heurístico):** `error`, `ok`

---

## /api/cost-options

### `/api/cost-options`
- **Archivo:** `src/app/api/cost-options/route.ts`
- **Métodos:** GET, POST
- **Query params:** `limit`, `search`, `solo_seleccionados`
- **Tablas (referencias):** `cost_option`, `cost_option_snapshot`, `item_price_daily_pres`, `item_seguimiento`, `proveedor`
- **Response keys (heurístico):** `cost_option_id`, `cost_options_extra`, `error`, `ok`

**Docstring / comentario:**

```
GET:
- ITEM_PRESENTACION: desde app.item_price_daily_pres (última fecha por item/presentación) + app.item_seguimiento + app.proveedor
- MANUAL/BULK: desde app.cost_option
```

### `/api/cost-options/[cost_option_id]`
- **Archivo:** `src/app/api/cost-options/[cost_option_id]/route.ts`
- **Métodos:** PATCH
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `cost_option`, `cost_option_snapshot`, `formula_linea_v2`
- **Response keys (heurístico):** `cost_option_id`, `error`, `ok`

---

## /api/cron

### `/api/cron/formulado-costs-daily`
- **Archivo:** `src/app/api/cron/formulado-costs-daily/route.ts`
- **Métodos:** GET, POST
- **Query params:**
  - `dry_run` (0/1): si es 1, no persiste snapshots (solo calcula y reporta).
  - `producto_ids` (csv): limita el cálculo a un conjunto de `producto_id` (ej: `4,5`).
- **Tablas (referencias):** `item_formulado`, `item_formulado_snapshot`, `producto_costos_produccion`, `producto_formula_v2`, `producto_formula_linea_v2`, `cost_option`, `item_price_daily_pres`
- **Notas operacionales:**
  - `cost_option.item_presentacion` está en **kg** (no gramos). Para `ITEM_PRESENTACION`: `ARS/kg = price_ars / presentacion_kg`.
  - Inserción estricta: si faltan costos/precios para alguna línea, no se escribe snapshot del día (evita `precio_unitario_ars=0`).
  - `item_formulado_snapshot.fuente` está restringido a `AUTO | USER | CRON`.
  - El job detecta formulados por `producto_formula_v2` **o** por `producto_formula_linea_v2`, para no excluir altas nuevas con líneas ya cargadas.
- **Response keys (heurístico):** `error`, `ok`, `results`


### `/api/cron/manual-costs-daily`
- **Archivo:** `src/app/api/cron/manual-costs-daily/route.ts`
- **Métodos:** GET, POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `cost_option`, `cost_option_snapshot`
- **Response keys (heurístico):** `error`, `ok`

### `/api/cron/pricing-daily`
- **Archivo:** `src/app/api/cron/pricing-daily/route.ts`
- **Métodos:** GET, POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `item_price_daily_pres`, `offers`, `pricing_daily_run_items`, `pricing_daily_runs`
- **Response keys (heurístico):** `batch_size`, `chain_max`, `concurrency`, `date`, `error`, `fail`, `groups`, `handler_version`, `max_attempts`, `ok`, `pending_remaining`, `pg`, `run_id`, `scrape`, `time_budget_ms`, `time_margin_ms`

### `/api/cron/recalc-snapshots`
- **Archivo:** `src/app/api/cron/recalc-snapshots/route.ts`
- **Métodos:** GET
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_formula_v2`
- **Response keys (heurístico):** `error`, `ok`, `processed_error`, `processed_ok`, `total`

---

## /api/db-health

### `/api/db-health`
- **Archivo:** `src/app/api/db-health/route.ts`
- **Métodos:** GET
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** (ninguna detectada)
- **Response keys (heurístico):** `db`, `error`, `ok`

---

## /api/insumos

### `/api/insumos`
- **Archivo:** `src/app/api/insumos/route.ts`
- **Métodos:** GET, POST
- **Query params:** `activo`, `limit`, `offset`, `search`, `tipo_uom`
- **Tablas (referencias):** `insumo`
- **Response keys (heurístico):** `count`, `error`, `ok`

### `/api/insumos/[insumo_id]`
- **Archivo:** `src/app/api/insumos/[insumo_id]/route.ts`
- **Métodos:** GET, PATCH, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `insumo`, `insumo_fuente`
- **Response keys (heurístico):** `error`, `ok`

### `/api/insumos/[insumo_id]/fuentes`
- **Archivo:** `src/app/api/insumos/[insumo_id]/fuentes/route.ts`
- **Métodos:** POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `insumo`, `insumo_fuente`, `producto_oferta`
- **Response keys (heurístico):** `error`, `ok`

### `/api/insumos/[insumo_id]/fuentes/[fuente_id]`
- **Archivo:** `src/app/api/insumos/[insumo_id]/fuentes/[fuente_id]/route.ts`
- **Métodos:** PATCH, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `insumo_fuente`
- **Response keys (heurístico):** `error`, `ok`

---

## /api/items

### `/api/items`
- **Archivo:** `src/app/api/items/route.ts`
- **Métodos:** GET
- **Query params:** `estado`, `limit`, `offset`, `search`, `seleccionado`, `tipo`
- **Tablas (referencias):** `cost_option`, `cost_option_snapshot`, `item_formulado`, `item_formulado_snapshot`, `item_price_daily_pres`, `item_seguimiento`, `producto`, `producto_formula_linea_v2`, `producto_formula_v2`, `proveedor`
- **Response keys (heurístico):** `count`, `error`, `ok`

**Docstring / comentario:**

```
Unificación de Items:
- PROVEEDOR: app.item_seguimiento
- FORMULADO (virtual): producto con fórmula v2 (por header o por líneas)
- MANUAL (catálogo): app.cost_option tipo='MANUAL_PRESENTACION'
item_key:
- p:<item_id>
- fprod:<producto_id>
- mopt:<cost_option_id>
```

### `/api/items/[item_id]/price-history`
- **Archivo:** `src/app/api/items/[item_id]/price-history/route.ts`
- **Métodos:** GET
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `cost_option_snapshot`, `item_formulado`, `item_formulado_snapshot`, `item_price_daily_pres`
- **Response keys (heurístico):** `error`, `id`, `item_key`, `kind`, `label`, `note`, `ok`, `raw`, `series`, `unit`

### `/api/items/bulk`
- **Archivo:** `src/app/api/items/bulk/route.ts`
- **Métodos:** POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `item_seguimiento`, `offers`
- **Response keys (heurístico):** `error`, `ok`, `time_ms`

---

## /api/jobs

### `/api/jobs`
- **Archivo:** `src/app/api/jobs/route.ts`
- **Métodos:** GET, POST
- **Query params:** `estado`, `limit`
- **Tablas (referencias):** `item_seguimiento`, `job`, `job_estado`, `job_tipo`, `oferta_proveedor`
- **Response keys (heurístico):** `error`, `job_ids`, `jobs`, `ok`

**Docstring / comentario:**

```
Normaliza el resultado del cliente SQL (Neon/pg)
a un array de filas (objetos).
```

### `/api/jobs/[job_id]`
- **Archivo:** `src/app/api/jobs/[job_id]/route.ts`
- **Métodos:** GET
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `item_seguimiento`, `job`, `job_result`
- **Response keys (heurístico):** `corrida_id`, `error`, `item_id`, `job`, `job_id`, `motor_id`, `ok`, `proveedor_id`

### `/api/jobs/[job_id]/approve`
- **Archivo:** `src/app/api/jobs/[job_id]/approve/route.ts`
- **Métodos:** POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `item_estado`, `item_seguimiento`, `job`, `job_estado`, `job_result`, `oferta_proveedor`, `uom`
- **Response keys (heurístico):** `actual`, `already_succeeded`, `aprobar`, `error`, `errors`, `inserted_count`, `oferta_id`, `oferta_ids`, `ok`, `skipped_existing`

### `/api/jobs/run-next`
- **Archivo:** `src/app/api/jobs/run-next/route.ts`
- **Métodos:** POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `fx`, `item_seguimiento`, `job`, `job_estado`, `job_result`, `job_result_status`
- **Response keys (heurístico):** `claimed`, `error`, `item_id`, `job`, `job_id`, `motor_id`, `ok`, `tipo`

**Docstring / comentario:**

```
Opción B (configurable por proveedor) sin tocar DB:
configuración por hostname de la URL.
```

---

## /api/jobs-diario

### `/api/jobs-diario`
- **Archivo:** `src/app/api/jobs-diario/route.ts`
- **Métodos:** GET
- **Query params:** `run_id`
- **Tablas (referencias):** `item_seguimiento`, `offer_prices_daily`, `offers`, `pricing_daily_run_items`, `pricing_daily_runs`, `proveedor`
- **Response keys (heurístico):** `error`, `ok`, `rows`, `run`

---

## /api/ofertas

### `/api/ofertas`
- **Archivo:** `src/app/api/ofertas/route.ts`
- **Métodos:** GET, POST
- **Query params:** `item_id`
- **Tablas (referencias):** `motor_proveedor`, `offers`, `proveedor`
- **Response keys (heurístico):** `count`, `error`, `inserted_created`, `inserted_updated`, `lido`, `motor_id`, `offers`, `ok`, `prices_len`, `proveedor_codigo`, `proveedor_id`, `url_canonica`

### `/api/ofertas/bulk`
- **Archivo:** `src/app/api/ofertas/bulk/route.ts`
- **Métodos:** POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `item_seguimiento`, `offers`, `proveedor`
- **Response keys (heurístico):** `code`, `debug`, `detail`, `error`, `hint`, `inactivo`, `inexistente`, `ok`, `pg`, `proveedor_nombre`, `where`

**Docstring / comentario:**

```
Crea:
 - 1 fila en app.item_seguimiento por URL (si no existe)
 - N filas en app.offers (una por presentación encontrada por el motor)
```

### `/api/ofertas/bulk/preview`
- **Archivo:** `src/app/api/ofertas/bulk/preview/route.ts`
- **Métodos:** POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `proveedor`
- **Response keys (heurístico):** `error`, `motor_id`, `ok`

---

## /api/packaging-items

### `/api/packaging-items`
- **Archivo:** `src/app/api/packaging-items/route.ts`
- **Métodos:** GET, POST
- **Query params:** `include_inactivos`
- **Tablas (referencias):** `packaging_item`
- **Response keys (heurístico):** `error`, `items`, `ok`

### `/api/packaging-items/[packaging_item_id]`
- **Archivo:** `src/app/api/packaging-items/[packaging_item_id]/route.ts`
- **Métodos:** PATCH, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `packaging_item`
- **Response keys (heurístico):** `borrar`, `error`, `ok`

---

## /api/ping

### `/api/ping`
- **Archivo:** `src/app/api/ping/route.ts`
- **Métodos:** GET
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** (ninguna detectada)
- **Response keys (heurístico):** `has_neon`

---

## /api/productos

### `/api/productos`
- **Archivo:** `src/app/api/productos/route.ts`
- **Métodos:** GET, POST
- **Query params:** `activo`, `limit`, `offset`, `search`
- **Tablas (referencias):** `producto`, `producto_base`, `producto_formula`
- **Response keys (heurístico):** `count`, `error`, `ok`

### `/api/productos/[producto_id]`
- **Archivo:** `src/app/api/productos/[producto_id]/route.ts`
- **Métodos:** GET, PATCH
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto`, `producto_base`, `producto_formula`, `producto_formula_linea`
- **Response keys (heurístico):** `base`, `error`, `formula`, `lineas`, `ok`, `producto`

**Docstring / comentario:**

```
PATCH /api/productos/:producto_id
Body permitido (por ahora):
- densidad_producto_g_ml: number | null
```

### `/api/productos/[producto_id]/base`
- **Archivo:** `src/app/api/productos/[producto_id]/base/route.ts`
- **Métodos:** GET, PUT, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_base`
- **Response keys (heurístico):** `error`, `ok`

### `/api/productos/[producto_id]/costo-bulk`
- **Archivo:** `src/app/api/productos/[producto_id]/costo-bulk/route.ts`
- **Métodos:** GET
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `cost_option`, `item_price_daily_pres`, `producto_costos_produccion`, `producto_formula_linea_v2`, `producto_formula_v2`
- **Response keys (heurístico):** `ars_por_g`, `ars_por_kg`, `error`, `lote_ref_g`, `material_ars_por_kg`, `ok`, `prod_ars_por_kg`

- **Notas operacionales:**
  - `cost_option.item_presentacion` y `item_price_daily_pres.presentacion` están en **kg**.
  - Para `ITEM_PRESENTACION`: `ARS/kg = price_ars / presentacion_kg`.

### `/api/productos/[producto_id]/formula`
- **Archivo:** `src/app/api/productos/[producto_id]/formula/route.ts`
- **Métodos:** GET, PUT, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_formula`, `producto_formula_linea`
- **Response keys (heurístico):** `error`, `ok`

### `/api/productos/[producto_id]/formula-v2`
- **Archivo:** `src/app/api/productos/[producto_id]/formula-v2/route.ts`
- **Métodos:** GET, POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_costos_produccion`, `producto_formula_v2`
- **Response keys (heurístico):** `error`, `ok`

### `/api/productos/[producto_id]/formula-v2/lineas`
- **Archivo:** `src/app/api/productos/[producto_id]/formula-v2/lineas/route.ts`
- **Métodos:** GET, POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `cost_option`, `item_price_daily_pres`, `producto_formula_linea_v2`
- **Response keys (heurístico):** `error`, `lineas`, `ok`

### `/api/productos/[producto_id]/formula-v2/lineas/[linea_id]`
- **Archivo:** `src/app/api/productos/[producto_id]/formula-v2/lineas/[linea_id]/route.ts`
- **Métodos:** PATCH, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_formula_linea_v2`
- **Response keys (heurístico):** `error`, `ok`

### `/api/productos/[producto_id]/formula/lineas`
- **Archivo:** `src/app/api/productos/[producto_id]/formula/lineas/route.ts`
- **Métodos:** GET, POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `insumo`, `producto_formula_linea`
- **Response keys (heurístico):** `error`, `ok`

### `/api/productos/[producto_id]/formula/lineas/[linea_id]`
- **Archivo:** `src/app/api/productos/[producto_id]/formula/lineas/[linea_id]/route.ts`
- **Métodos:** PATCH, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `insumo`, `producto_formula_linea`
- **Response keys (heurístico):** `error`, `ok`

### `/api/productos/[producto_id]/ofertas`
- **Archivo:** `src/app/api/productos/[producto_id]/ofertas/route.ts`
- **Métodos:** GET, POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_oferta`
- **Response keys (heurístico):** `error`, `ok`

### `/api/productos/bulks`
- **Archivo:** `src/app/api/productos/bulks/route.ts`
- **Métodos:** GET
- **Query params:** `search`
- **Tablas (referencias):** `item_formulado`, `producto`
- **Response keys (heurístico):** `error`, `ok`

**Docstring / comentario:**

```
GET /api/productos/bulks?search=&limit=&offset=&exclude_producto_id=
"Bulk disponible" = item_formulado tipo BULK activo.
Devuelve productos + densidad + ars_por_kg.
```

### `/api/productos/ofertas/[oferta_id]`
- **Archivo:** `src/app/api/productos/ofertas/[oferta_id]/route.ts`
- **Métodos:** GET, PATCH
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_oferta`
- **Response keys (heurístico):** `error`, `ok`, `skipped`

### `/api/productos/ofertas/[oferta_id]/costeo`
- **Archivo:** `src/app/api/productos/ofertas/[oferta_id]/costeo/route.ts`
- **Métodos:** GET
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `insumo`, `insumo_fuente`, `item_price_daily_pres`, `producto`, `producto_base`, `producto_formula`, `producto_formula_linea`, `producto_oferta`, `producto_oferta_extra`
- **Response keys (heurístico):** `error`, `ok`

### `/api/productos/ofertas/[oferta_id]/costo-snapshots`
- **Archivo:** `src/app/api/productos/ofertas/[oferta_id]/costo-snapshots/route.ts`
- **Métodos:** GET, POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_oferta_costo_snapshot`, `producto_oferta_costo_snapshot_packaging`
- **Response keys (heurístico):** `error`, `ok`

### `/api/productos/ofertas/[oferta_id]/costo-snapshots/[snapshot_id]`
- **Archivo:** `src/app/api/productos/ofertas/[oferta_id]/costo-snapshots/[snapshot_id]/route.ts`
- **Métodos:** GET
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_oferta_costo_snapshot`, `producto_oferta_costo_snapshot_packaging`
- **Response keys (heurístico):** `error`, `ok`, `packaging`, `snapshot`

### `/api/productos/ofertas/[oferta_id]/duplicate`
- **Archivo:** `src/app/api/productos/ofertas/[oferta_id]/duplicate/route.ts`
- **Métodos:** POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_oferta`, `producto_oferta_extra`
- **Response keys (heurístico):** `error`, `oferta_id`, `ok`

### `/api/productos/ofertas/[oferta_id]/extras`
- **Archivo:** `src/app/api/productos/ofertas/[oferta_id]/extras/route.ts`
- **Métodos:** POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `insumo`, `producto_oferta_extra`
- **Response keys (heurístico):** `error`, `ok`

### `/api/productos/ofertas/[oferta_id]/extras/[extra_id]`
- **Archivo:** `src/app/api/productos/ofertas/[oferta_id]/extras/[extra_id]/route.ts`
- **Métodos:** PATCH, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_oferta_extra`
- **Response keys (heurístico):** `error`, `ok`

### `/api/productos/ofertas/[oferta_id]/packaging`
- **Archivo:** `src/app/api/productos/ofertas/[oferta_id]/packaging/route.ts`
- **Métodos:** GET, POST
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `oferta_packaging`, `packaging_item`
- **Response keys (heurístico):** `error`, `ok`, `rows`

### `/api/productos/ofertas/[oferta_id]/packaging/[oferta_packaging_id]`
- **Archivo:** `src/app/api/productos/ofertas/[oferta_id]/packaging/[oferta_packaging_id]/route.ts`
- **Métodos:** PATCH, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `producto_oferta_packaging`
- **Response keys (heurístico):** `error`, `ok`

---

## /api/proveedores

### `/api/proveedores`
- **Archivo:** `src/app/api/proveedores/route.ts`
- **Métodos:** GET
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `motor_proveedor`, `oferta_proveedor`, `proveedor`
- **Response keys (heurístico):** `motor_id`, `null`, `ok`, `proveedor_id`, `proveedor_nombre`, `proveedores`

---


## DELETE /api/items/[item_id]

Elimina definitivamente el entity subyacente al `item_key` unificado.

- `item_id`: `item_key` (URL-encoded), por ejemplo: `fprod:123`.

### FORMULADO (fprod:<producto_id>)

Hard-delete destructivo. Borra, en orden:

- referencias externas donde ese formulado se usa como componente `BULK_PRODUCTO` en otras fórmulas:
  - `app.producto_formula_linea_v2`
  - `app.cost_option_snapshot`
  - `app.cost_option` (`tipo='BULK_PRODUCTO'` y `bulk_producto_id=<producto_id>`)
- `app.item_formulado_snapshot` (por `item_formulado_id`)
- `app.item_formulado`
- `app.producto_formula_linea_v2`, `app.producto_formula_v2` propias del producto
- `app.producto_formula_linea`, `app.producto_formula` (si existieran)
- `app.producto_costos_produccion`
- tablas hijas de `app.producto_oferta`:
  - `app.producto_oferta_costo_snapshot_packaging`
  - `app.producto_oferta_costo_snapshot`
  - `app.producto_oferta_extra`
  - `app.producto_oferta_packaging`
- `app.producto_oferta`
- `app.producto_base` (si existiera)
- `app.producto`

Respuesta: `{ ok: true, deleted: { ... } }`

Notas:
- Operación irreversible.
- Si el formulado estaba siendo usado como componente `BULK_PRODUCTO` en otras fórmulas, esas líneas también se eliminan.
- Al borrar el producto, desaparece de **Productos** y del listado virtual de **Items**.

## GET /api/productos/:producto_id/formula-v2/lineas — campos adicionales

- Se agregan `item_url_original` y `item_url_canonica` (desde `app.item_seguimiento`) para renderizar nombres derivados de URL en `ITEM_PRESENTACION`.
- Se agrega `bulk_producto_nombre` (desde `app.producto`) para renderizar nombre real en `BULK_PRODUCTO`.

### Regla: SQL en consola Neon (v2)
- Usar nombres reales del esquema v2: `app.producto.producto_id` (PK), `app.item_formulado`, `app.item_formulado_snapshot`.
- No usar `app.item` (no existe en v2). Para “Items” ver `/api/items`.

## Nota operativa — FX y EUMA

- `app.fx` se considera por fecha de aplicación local `America/Argentina/Cordoba`, no por `current_date` UTC puro.
- Los flujos USD (`motor 2 / EUMA` y `jobs/run-next`) resuelven FX con fallback a la última cotización disponible con `fecha <= fecha local de aplicación`.
- El proveedor `EUMA` se asegura por código, pero no escribe `proveedor.motor_id_default=2` mientras la FK a `app.motor` no garantice la existencia del motor 2. El flujo bulk/preview infiere `motor_id=2` por URL.

---

## vNext — Primer lote de endpoints propuesto

Objetivo: abrir una primera iteración funcional sin tocar cron, snapshots ni la hoja agregada `Items`.

### Lote 1 (mínimo)

Se propone implementar primero **8 handlers**:

#### Catálogos operativos

### `/api/items-envases`
- **Archivo propuesto:** `src/app/api/items-envases/route.ts`
- **Métodos:** `GET`, `POST`
- **Campos base:** `nombre`, `descripcion`, `activo`, `proveedor_item_id`, `manual_cost_option_id`
- **Regla:** exactamente un origen técnico (`PROVEEDOR` o `MANUAL`)

**GET — query params sugeridos**
- `search`
- `activo`
- `limit`
- `offset`

**POST — body mínimo**
```json
{
  "nombre": "Botella 500 ml",
  "descripcion": "PET transparente",
  "activo": true,
  "proveedor_item_id": 123
}
```

o

```json
{
  "nombre": "Tapa rosca 28 mm",
  "manual_cost_option_id": 456
}
```

### `/api/items-envases/[item_envase_id]`
- **Archivo propuesto:** `src/app/api/items-envases/[item_envase_id]/route.ts`
- **Métodos:** `GET`, `PATCH`, `DELETE`
- **PATCH:** parcial por campos presentes

---

### `/api/items-etiqueta`
- **Archivo propuesto:** `src/app/api/items-etiqueta/route.ts`
- **Métodos:** `GET`, `POST`
- **Campos base:** `nombre`, `material`, `medidas`, `descripcion`, `activo`, `proveedor_item_id`, `manual_cost_option_id`
- **Regla:** exactamente un origen técnico (`PROVEEDOR` o `MANUAL`)

**POST — body mínimo**
```json
{
  "nombre": "Etiqueta lavandina 100 x 50",
  "material": "Autoadhesiva",
  "medidas": "100 x 50",
  "proveedor_item_id": 123
}
```

### `/api/items-etiqueta/[item_etiqueta_id]`
- **Archivo propuesto:** `src/app/api/items-etiqueta/[item_etiqueta_id]/route.ts`
- **Métodos:** `GET`, `PATCH`, `DELETE`

---

### `/api/items-paqueteria`
- **Archivo propuesto:** `src/app/api/items-paqueteria/route.ts`
- **Métodos:** `GET`, `POST`
- **Campos base:** `nombre`, `descripcion`, `activo`, `proveedor_item_id`, `manual_cost_option_id`
- **Regla:** exactamente un origen técnico (`PROVEEDOR` o `MANUAL`)

### `/api/items-paqueteria/[item_paqueteria_id]`
- **Archivo propuesto:** `src/app/api/items-paqueteria/[item_paqueteria_id]/route.ts`
- **Métodos:** `GET`, `PATCH`, `DELETE`

---

#### Comerciales base

### `/api/items-comerciales`
- **Archivo propuesto:** `src/app/api/items-comerciales/route.ts`
- **Métodos:** `GET`, `POST`
- **Campos base:** `nombre`, `descripcion`, `cantidad`, `unidad`, `densidad_g_ml`, `activo`, y exactamente un origen técnico (`proveedor_item_id`, `manual_cost_option_id`, `formulado_item_formulado_id`)

**GET — query params sugeridos**
- `search`
- `activo`
- `origen_tipo` (`PROVEEDOR | MANUAL | FORMULADO`)
- `limit`
- `offset`

**POST — body mínimo**
```json
{
  "nombre": "Lavandina x 500 mL",
  "descripcion": "Uso doméstico",
  "cantidad": 500,
  "unidad": "ML",
  "formulado_item_formulado_id": 12
}
```

**POST — ejemplo UN**
```json
{
  "nombre": "Sahumerios x 1000 unidades",
  "cantidad": 1000,
  "unidad": "UN",
  "manual_cost_option_id": 345
}
```

**POST — ejemplo con densidad requerida**
```json
{
  "nombre": "Producto x 1 L",
  "cantidad": 1000,
  "unidad": "ML",
  "manual_cost_option_id": 345,
  "densidad_g_ml": 1.03
}
```

### `/api/items-comerciales/[item_comercial_id]`
- **Archivo propuesto:** `src/app/api/items-comerciales/[item_comercial_id]/route.ts`
- **Métodos:** `GET`, `PATCH`, `DELETE`
- **PATCH:** parcial por campos presentes; todos los campos del `Item Comercial` permanecen editables

---

## Fuera de este lote 1

No entran todavía:

- `/api/items-comerciales/[item_comercial_id]/envases`
- `/api/items-comerciales/[item_comercial_id]/etiquetas`
- `/api/items-comerciales/[item_comercial_id]/duplicate`
- integración de `COMERCIAL / ENVASE / ETIQUETA / PAQUETERIA` dentro de `/api/items`

Motivo: mantener el primer corte corto, validable y sin abrir demasiados frentes a la vez.


## /api/items-comerciales

### `/api/items-comerciales`
- **Archivo:** `src/app/api/items-comerciales/route.ts`
- **Métodos:** GET, POST
- **Query params:** `include_inactivos`, `search`
- **Tablas (referencias):** `item_comercial`, `item_seguimiento`, `proveedor`, `cost_option`, `item_formulado`, `producto`
- **Response keys (heurístico):** `error`, `items`, `item_comercial_id`, `ok`
- **Notas operacionales:**
  - lote 1: solo alta/listado base;
  - origen técnico único obligatorio (`PROVEEDOR | MANUAL | FORMULADO`);
  - no maneja stock propio ni asociaciones a envases/etiquetas.

### `/api/items-comerciales/[item_comercial_id]`
- **Archivo:** `src/app/api/items-comerciales/[item_comercial_id]/route.ts`
- **Métodos:** GET, PATCH, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `item_comercial`
- **Response keys (heurístico):** `error`, `item`, `ok`

## /api/items-envases

### `/api/items-envases`
- **Archivo:** `src/app/api/items-envases/route.ts`
- **Métodos:** GET, POST
- **Query params:** `include_inactivos`, `search`
- **Tablas (referencias):** `item_envase`, `item_seguimiento`, `proveedor`, `cost_option`
- **Response keys (heurístico):** `error`, `items`, `item_envase_id`, `ok`
- **Notas operacionales:**
  - origen técnico único obligatorio (`PROVEEDOR | MANUAL`).

### `/api/items-envases/[item_envase_id]`
- **Archivo:** `src/app/api/items-envases/[item_envase_id]/route.ts`
- **Métodos:** GET, PATCH, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `item_envase`
- **Response keys (heurístico):** `error`, `item`, `ok`

## /api/items-etiqueta

### `/api/items-etiqueta`
- **Archivo:** `src/app/api/items-etiqueta/route.ts`
- **Métodos:** GET, POST
- **Query params:** `include_inactivos`, `search`
- **Tablas (referencias):** `item_etiqueta`, `item_seguimiento`, `proveedor`, `cost_option`
- **Response keys (heurístico):** `error`, `items`, `item_etiqueta_id`, `ok`
- **Notas operacionales:**
  - `medidas` requerida en formato libre `ancho x largo`;
  - origen técnico único obligatorio (`PROVEEDOR | MANUAL`).

### `/api/items-etiqueta/[item_etiqueta_id]`
- **Archivo:** `src/app/api/items-etiqueta/[item_etiqueta_id]/route.ts`
- **Métodos:** GET, PATCH, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `item_etiqueta`
- **Response keys (heurístico):** `error`, `item`, `ok`

## /api/items-paqueteria

### `/api/items-paqueteria`
- **Archivo:** `src/app/api/items-paqueteria/route.ts`
- **Métodos:** GET, POST
- **Query params:** `include_inactivos`, `search`
- **Tablas (referencias):** `item_paqueteria`, `item_seguimiento`, `proveedor`, `cost_option`
- **Response keys (heurístico):** `error`, `items`, `item_paqueteria_id`, `ok`
- **Notas operacionales:**
  - lote 1: catálogo separado; no hay relación fija todavía con `item_comercial`.

### `/api/items-paqueteria/[item_paqueteria_id]`
- **Archivo:** `src/app/api/items-paqueteria/[item_paqueteria_id]/route.ts`
- **Métodos:** GET, PATCH, DELETE
- **Query params:** (ninguno detectado)
- **Tablas (referencias):** `item_paqueteria`
- **Response keys (heurístico):** `error`, `item`, `ok`


## vNext — Selector de orígenes técnicos

Endpoint nuevo de apoyo a formularios:

- `GET /api/origenes-tecnicos?kind=MANUAL|PROVEEDOR|FORMULADO&q=<texto>&selected_id=<id>`

Respuesta esperada:

```json
{
  "ok": true,
  "items": [
    { "id": 123, "label": "..." }
  ]
}
```

Uso:

- `MANUAL`: devuelve `cost_option` activos tipo `MANUAL_PRESENTACION`.
- `PROVEEDOR`: devuelve `item_seguimiento` existentes.
- `FORMULADO`: devuelve `item_formulado` activos tipo `BULK`.

Objetivo: evitar el ingreso manual de FK en formularios vNext y reducir errores por constraints.
