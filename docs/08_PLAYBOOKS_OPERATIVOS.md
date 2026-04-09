# 08_PLAYBOOKS_OPERATIVOS.md
## Flujos End-to-End Oficiales – mgq-admin

Este documento describe cómo funciona el sistema de forma secuencial,
conectando DB + API + UI + Jobs.

---

# 0. Acceso UI por tipo de Item (v2)

- **Items (agregado):** `/items`  
  Vista consolidada (PROVEEDOR / MANUAL / FORMULADO) para seguimiento e histórico (gráficos).
- **Items Proveedores (operación):** `/items-proveedores`  
  Alta por URLs visible siempre + consultas de `Corrida diaria` e `Items Proveedor` bajo demanda.
- **Items Manuales (operación):** `/items-manuales`  
  Alta, edición y borrado de `cost_option` tipo `MANUAL_PRESENTACION`.
- **Items Formulados:** `/productos`  
  Editor de Producto / fórmula v2 (la navegación lo muestra como “Items Formulados”; el dominio sigue siendo Producto). Incluye `Notas` persistidas en `producto.descripcion`.

Regla operativa:
La hoja **Items** no debe contener acciones de alta/edición por tipo; esas acciones viven en sus hojas específicas.

---

# 1. Crear Producto (Formulado)

### Paso 1 – Crear producto
- Se crea registro en `producto`.
- Automáticamente se crea `item_formulado` tipo `BULK` asociado.

Invariante:
Producto formulado → siempre tiene su representación técnica BULK.

---

# 2. Editar Fórmula

### Paso 1 – Crear header
- Registro en `producto_formula_v2`.
- Si el usuario agrega líneas sin haber persistido explícitamente el header, el backend debe autocrearlo con `lote_ref_g = 1000`.

### Paso 2 – Agregar líneas
- Registros en `producto_formula_linea_v2`.
- Al crear/editar líneas, el backend garantiza `producto_formula_v2` si faltaba (default `lote_ref_g = 1000`).
- Tipos posibles:
  - INSUMO
  - BULK_PRODUCTO
  - MANUAL

Resultado esperado:
- El producto puede calcular costo por kg.
- Puede actuar como bulk reutilizable.

---

# 3. Generación de Bulk

El BULK no es un objeto separado dinámico.

Es la representación técnica del producto:
- Se calcula vía endpoint `/api/productos/:id/costo-bulk`.
- No depende de presentación ni packaging.

---

# 4. Crear Oferta Comercial

### Paso 1 – Crear oferta
- Registro en `offers`.
- Se define:
  - item_id
  - presentacion
  - motor_id
  - url
  - estado

Regla crítica:
`presentacion` debe existir en el proveedor.

---

# 5. Pricing Diario

### Paso 1 – Crear/usar run
- Registro en `pricing_daily_runs`.

### Paso 2 – Insertar run_items
- Registros en `pricing_daily_run_items` (PENDING).

### Paso 3 – Scrape por grupos (motor_id + url)

### Paso 4 – Insert en `item_price_daily_pres`.

### Paso 5 – Actualizar estados
- OK
- FAIL
- PENDING

Estado final esperado:
- `pending_count = 0`.
- `fail_count = 0` para que el run quede `DONE`.
- Si `pending_count = 0` pero existe algún `FAIL`, el run queda `PARTIAL` (según implementación del cron).
## Diagnóstico rápido (formulados en PEND con componentes proveedor ya actualizados)

1. Ejecutar `POST /api/cron/formulado-costs-daily?dry_run=1`.
2. Revisar `diagnostics.missing_header_count`:
   - Si es `> 0`, hay formulados que `Items` considera v2 pero este cron excluye por faltar header en `producto_formula_v2`.
3. Revisar `diagnostics.pending_snapshot_today_count`:
   - Si es alto y `errors` está vacío, sospechar que `/api/cron/pricing-daily` no llegó a disparar formulados.
4. Si `missing_header_count > 0` y querés recuperar sólo esos formulados, ejecutar `POST /api/cron/formulado-costs-daily?backfill_missing_headers=1&producto_ids=<csv>` para autocrear headers faltantes y snapshotearlos en el mismo run.
5. Ejecutar `POST /api/cron/pricing-daily` y revisar en la respuesta `cost_triggers`:
   - `eligible=true` + `formulado.attempted=true` indica que el pricing intentó dispararlo.
   - `reason=insufficient_time_left` indica que el pricing terminó sin margen para encadenar formulados.
6. Revisar `pricing_daily_runs.last_error` para líneas `[cost-trigger] ...` del run del día.

## Diagnóstico rápido (pricing PARTIAL / PENDING)

1) Separar pendientes reales vs agotados (debería tender a 0 agotados por normalización):

```sql
select
  sum((status='PENDING' and attempts < PRICING_MAX_ATTEMPTS)::int) as pending_reales,
  sum((status='PENDING' and attempts >= PRICING_MAX_ATTEMPTS)::int) as pending_agotados,
  sum((status='OK')::int) as ok,
  sum((status='FAIL')::int) as fail
from app.pricing_daily_run_items
where run_id = <RUN_ID>;
```

2) Ver si hubo continuidad (actividad posterior en `updated_at`):

```sql
select date_trunc('minute', updated_at) as minuto, count(*) as filas
from app.pricing_daily_run_items
where run_id = <RUN_ID>
group by 1
order by 1 desc
limit 60;
```

3) Confirmar disparo de costos (snapshots del día):

```sql
select count(*) from app.cost_option_snapshot where as_of_date = current_date;
select count(*) from app.item_formulado_snapshot where as_of_date = current_date;
```


---

# 6. Cálculo Costos Manuales

Se ejecuta después de pricing si no hay pendientes.

Actualiza snapshots relacionados a manuales.

---

# 7. Cálculo Costos Formulados

Calcula costos derivados de productos formulados.

Actualiza snapshots comerciales.

---

# 8. Uso de Bulk dentro de otra Fórmula

Un producto A puede incluir como línea:
- BULK_PRODUCTO → referencia a producto B.

Regla:
No se usa oferta, se usa costo técnico del bulk.

---

# 9. Fallos típicos documentados

- Presentación inexistente → FAIL en pricing.
- Cron no encadena → PARTIAL con pendientes.
- Densidad null → costo inválido.
- Offer sin motor/url → FAIL inmediato.


## 9.1 BULK con histórico en 0 o “plano”

Síntoma:
- En **Items → BULK** el gráfico aparece en 0, o con saltos desde 0, o “plano” cuando se esperaban variaciones.

### Diagnóstico mínimo (DB)
1) Ver si existen snapshots del BULK:
```sql
select as_of_date, precio_unitario_ars, fuente
from app.item_formulado_snapshot
where item_formulado_id = <ID>
order by as_of_date desc
limit 60;
```

2) Si hay valores `precio_unitario_ars = 0` (frecuente por ejecuciones previas del cron):
- Corregir eliminando esos snapshots y recalculando con backfill estricto.

### Corrección por SQL (segura, acotada)
1) Eliminar ceros del histórico (solo ese BULK):
```sql
delete from app.item_formulado_snapshot
where item_formulado_id = <ID>
  and precio_unitario_ars = 0;
```

2) Recalcular/backfill:
- Usar cálculo por fórmula v2 y precios históricos (`item_price_daily_pres`) por fecha (tomando el último precio `<= as_of_date`).
- Insertar snapshot **solo si todas las líneas resuelven costo** (sin “missing”).

Nota: `item_formulado_snapshot.fuente` está restringido a `AUTO | USER | CRON`. Para correcciones automáticas usar `AUTO`.

### Aclaración sobre gráficos “planos”
Antes de diagnosticar error, medir variación real:
```sql
select
  min(precio_unitario_ars) as min_ars,
  max(precio_unitario_ars) as max_ars,
  (max(precio_unitario_ars)-min(precio_unitario_ars)) as delta_abs,
  case when min(precio_unitario_ars) > 0
    then (max(precio_unitario_ars)-min(precio_unitario_ars))/min(precio_unitario_ars)*100.0
    else null
  end as delta_pct
from app.item_formulado_snapshot
where item_formulado_id = <ID>
  and as_of_date >= current_date - interval '30 days';
```

Variaciones < 0.5% suelen verse “planas” en escala visual aunque el cálculo sea correcto.


---

Fin de flujos oficiales v1.0


## Eliminar FORMULADO (hard-delete)

Ruta: **Items** → filtrar `Tipo = Formulado` → botón 🗑️.

Efecto:
- Elimina definitivamente el producto formulado y todo lo relacionado (fórmulas, item_formulado y snapshots).
- El producto desaparece también de la hoja **Productos**.

Advertencias:
- Es irreversible.
- Se pierde el historial (`item_formulado_snapshot`).



### FORMULADO: componentes tipo BULK_PRODUCTO (otro producto formulado)

**Síntoma en UI (pantalla de producto):**
- `bulk: fórmula sin líneas (producto_formula_linea_v2 vacío)`
- `línea <n>: bulk: costo no cargado`

**Causa típica:**
- La línea de fórmula referencia otro producto formulado (tipo `BULK_PRODUCTO`), pero el producto referenciado **no tiene fórmula v2 completa** (`app.producto_formula_linea_v2` vacío) o está en transición.
- Aun así, ese producto puede tener costo válido porque el cron (`/api/cron/formulado-costs-daily`) ya generó el snapshot diario (`app.item_formulado_snapshot`).

**Regla operativa (fuente de verdad):**
- Para resolver el costo de un `BULK_PRODUCTO`, el backend debe **preferir el snapshot diario** (si existe `as_of_date=current_date` y `precio_unitario_ars>0`).
- Solo si no existe snapshot válido, se calcula “on the fly” por fórmula v2.

**Por qué:**
- Evita que un producto formulado usado como componente “rompa” el cálculo por no tener líneas v2 cargadas, cuando ya existe un valor diario calculado.
- Mantiene consistencia con los gráficos, que se alimentan exclusivamente de snapshots.

**Cómo verificar rápidamente (Neon SQL):**
```sql
select
  f.producto_id,
  s.as_of_date,
  s.precio_unitario_ars
from app.item_formulado_snapshot s
join app.item_formulado f on f.item_formulado_id = s.item_formulado_id
where f.producto_id = <BULK_PRODUCTO_ID>
  and s.as_of_date = current_date
order by s.created_at desc
limit 1;
```

### Frontend: fallos de parseo TSX (regla obligatoria)

Si `npm run build` falla con errores del tipo:

- `Expected '</', got '{'`
- `Unexpected token. Did you mean `{'}'}` or `&rbrace;`?`
- `Expected '}', got '<eof>'`

aplicar este checklist **antes** de continuar:

1. Buscar en el archivo afectado:
   - ternarios `{cond ? (` sin cierre `) : null}`
   - `&& (` sin cierre `)`
   - firmas/bloques con `{ {` (con o sin espacios), por ejemplo `function X(...) { {`
2. Corregir cierres (JSX y llaves) sin reestructurar lógica.
3. Re-ejecutar `npm run build`.

## Borrado de Item Manual

1. Ejecutar desde `/items-manuales`, `/items-manuales/[cost_option_id]` o `/items` sobre la fila `MANUAL`.
2. El backend intenta `DELETE /api/items/mopt:<cost_option_id>`.
3. Si el manual sigue en uso por una fórmula v2, responde `409 manual_item_in_use` y la UI no borra nada.
4. Si no está en uso, el backend borra:
   - `app.cost_option_snapshot`
   - `app.cost_option` (`tipo='MANUAL_PRESENTACION'`)

Chequeo SQL rápido para un manual puntual:

```sql
select count(*) as lineas_v2
from app.producto_formula_linea_v2
where cost_option_id = <cost_option_id>;
```

Regla:
- Si `lineas_v2 > 0`, retirar primero el item manual de la fórmula antes de intentar eliminarlo.


# Playbook — Eliminar Item Manual

- La acción UI elimina vía `DELETE /api/cost-options/[cost_option_id]`.
- Si el manual sigue referenciado en `producto_formula_linea_v2`, responde `409 manual_item_in_use`.
- Si el registro no existe o no es `MANUAL_PRESENTACION`, responde `404 manual_item_not_found`.
