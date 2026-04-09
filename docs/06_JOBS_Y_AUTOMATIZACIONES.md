# 06_JOBS_Y_AUTOMATIZACIONES.md
## Jobs y automatizaciones (Vercel cron)

Fuente de cron schedule: `vercel.json`.

## 1. Cron: /api/cron/pricing-daily (03:10)

### Propósito
Scrapear precios desde proveedores (por oferta) y persistir el precio diario por presentación.

### Entradas
- `app.offers` filtrando `estado='OK'`.
- `offers.presentacion` (presentación objetivo).
- `offers.motor_id` y `offers.url_*`.

### Salidas (DB)
- `app.pricing_daily_runs` (por `as_of_date`).
- `app.pricing_daily_run_items` (1 por offer, estado PENDING/OK/FAIL, attempts, last_error).
- `app.item_price_daily_pres` (upsert por `(item_id, as_of_date, presentacion)`).

### Relación con el alta manual de Items Proveedor
- `/api/ofertas/bulk` también puede sembrar `app.item_price_daily_pres` para `current_date` al momento del alta.
- `pricing-daily` conserva la misma clave natural y hace `upsert`, por lo que normaliza/sobrescribe esa fila sin romper idempotencia.

### Estados
- `pricing_daily_run_items.status`: PENDING | OK | FAIL
- `pricing_daily_runs.status`: RUNNING | DONE | PARTIAL

### Errores relevantes
- `missing_motor_or_url(...)` → oferta incompleta.
- `offer_presentacion_missing(...)` → oferta sin presentación.
- `no_or_invalid_price_for_presentacion:<pres>` → el motor no devolvió precio para la presentación guardada.
- `max_attempts_exhausted` → se agotaron `PRICING_MAX_ATTEMPTS` sin poder marcar OK.

### Normalización de intentos (anti PEND infinito)
Para evitar que queden ofertas en `PENDING` de forma indefinida, cualquier fila con `status='PENDING'` y `attempts >= PRICING_MAX_ATTEMPTS` se marca como `FAIL`.

### Continuación del run (sin romper Vercel Hobby)

#### Contexto
En Vercel Hobby, el cron programado corre 1 vez por día y existe una ventana flexible; además, la auto-invocación HTTP (self-fetch) puede ser bloqueada (p.ej. 508 loop detected).

#### Regla
- En **Production (Hobby)** se deshabilita el self-chain con:
  - `PRICING_DISABLE_SELF_CHAIN=1`
- La continuidad se realiza con un **pinger externo** (GitHub Actions) que re-invoca el mismo endpoint mientras haya trabajo.

#### Workflow externo
Archivo:
- `.github/workflows/pricing-daily-pinger.yml`

Secrets requeridos:
- `MGQ_BASE_URL` (sin trailing slash), ej: `https://mgq-admin.vercel.app`
- `MGQ_CRON_SECRET` (mismo valor que `CRON_SECRET`)

El workflow ejecuta `POST $BASE_URL/api/cron/pricing-daily` cada 5 minutos en una ventana que cubre el cron diario.

#### Señales en la respuesta del endpoint
- `chain_disabled: true|false`
- `should_continue: true|false`

Interpretación:
- `should_continue=true` → seguir re-invocando hasta que devuelva `false`.
- `chain_disabled=true` → no habrá auto-continuación interna (esperable en Hobby).

### Verificación rápida
- `select status, count(*) from app.pricing_daily_run_items where run_id=<id> group by status;`
- `select status, pending_count, ok_count, fail_count, last_error from app.pricing_daily_runs where id=<id>;`

## 2. Cron: /api/cron/manual-costs-daily (03:15)

### Propósito
Snapshot diario de costos manuales (cost options manuales por presentación).

### Fuente
- `app.cost_option` (`activo=true` y `tipo='MANUAL_PRESENTACION'`).

### Destino
- `app.cost_option_snapshot` upsert por `(cost_option_id, as_of_date)` con `fuente='CRON'`.

### Verificación rápida
- `select count(*) from app.cost_option_snapshot where as_of_date=current_date;`

## 3. Cron: /api/cron/formulado-costs-daily (03:20)

### Propósito
Generar **snapshot diario** del costo unitario (ARS/kg) de los formulados **BULK**.

Este job es el “source of truth” del **histórico** que se grafica en la hoja **Items** para `item_key=fprod:<producto_id>`.

### Fuente (cálculo)
- Fórmula v2:
  - `app.producto_formula_v2`
  - `app.producto_formula_linea_v2` (`pct_peso`)
  - Universo operativo del job: producto activo detectable por header o por líneas
- Opciones de costo por línea:
  - `app.cost_option` (tipos: `ITEM_PRESENTACION`, `MANUAL_PRESENTACION`, `BULK_PRODUCTO`)
- Precios diarios de proveedor por presentación:
  - `app.item_price_daily_pres` (insumo base para `ITEM_PRESENTACION`)
- Costos de producción:
  - `app.producto_costos_produccion`

### Reglas e invariantes (operacionales)
1) **Unidad**  
   `cost_option.item_presentacion` está en **kg**. Para `ITEM_PRESENTACION`:

   - `ARS/kg = price_ars / presentacion_kg`

2) **Peso (% p/p) y CSP (remainder)**
- Remainder: **0 o 1** línea con `is_csp=true`.
- `pct_csp = 100 - sum(pct_peso de líneas con is_csp=false)`.
- Invariante: `sum(pct_peso en líneas no-CSP) <= 100`.
- Para líneas no-CSP (`is_csp=false`), `pct_peso` debe estar definido.

3) **Inserción estricta (sin “ceros”)** (sin “ceros”)**
- Si alguna línea no puede resolver costo (faltan precios históricos / denominador inválido), el job **no inserta snapshot** para ese `as_of_date`.
- Motivo: evitar contaminar el histórico con `precio_unitario_ars = 0`.

4) **Auto-healing de BULK reutilizable**
- Si el producto tiene fórmula detectable y está activo pero falta `item_formulado` BULK activo, el job puede crearlo automáticamente.
- La resolución del BULK debe priorizar uno `activo=true`; si solo existe uno inactivo, puede reactivarse.
- Esto evita que el item `fprod:<producto_id>` quede en `FAIL` por ausencia operativa.

5) **Idempotencia**
- Upsert en `app.item_formulado_snapshot` por `(item_formulado_id, as_of_date)`.

5) **Fuente del snapshot**
- `item_formulado_snapshot.fuente` está restringido por check a: `AUTO | USER | CRON`.

### Destino
- `app.item_formulado_snapshot` (campo clave: `precio_unitario_ars`, ARS/kg) con upsert por `(item_formulado_id, as_of_date)`.

### Verificación rápida
- `select count(*) from app.item_formulado_snapshot where as_of_date=current_date;`
- `select min(precio_unitario_ars), max(precio_unitario_ars) from app.item_formulado_snapshot where item_formulado_id=<ID> and as_of_date >= current_date - interval '30 days';`



## 4. Endpoint: /api/cron/recalc-snapshots (no programado)

### Propósito
Recalcular snapshots por producto con fórmula v2 (recorre `app.producto_formula_v2`).

### Observación
Este endpoint permite “rebuild” cuando hay cambios en costos o reglas.

## Nota operativa — Cron FX diario

- `fx-bna-daily` guarda la cotización en `app.fx` usando la fecha local de aplicación `America/Argentina/Cordoba`.
- Si un flujo USD corre antes de que exista la fila exacta del día, usa como fallback la última fila de `app.fx` con `fecha <= fecha local de aplicación`.
