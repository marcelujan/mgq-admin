# 02_MODELO_DE_DOMINIO.md

## Modelo de Dominio – mgq-admin

---

## 1. Producto

### Definición formal

Un **Producto** es un contenedor de fórmula que genera automáticamente un “bulk” y puede convertirse en entidad comercial vendible cuando se le asigna presentación/packaging y se crea una oferta con su item formulado.

Roles simultáneos:

1. **Técnico**: contenedor de fórmula.
2. **Comercial**: vendible cuando se materializa como oferta.

---

## 2. Item formulado

Entidad que representa una formulación reutilizable.

### 2.1 Bulk

**Bulk** = representación formulada reutilizable (técnica) de un producto.

Identificación:

- `item_formulado.tipo = 'BULK'`
- `item_formulado.activo = true`

### Regla crítica

Un producto puede considerarse técnicamente reutilizable únicamente si existe un `item_formulado` tipo BULK activo asociado.

### Regla operativa (auto-healing)

Si existe `producto_formula_v2` (cabecera) para un producto activo, el sistema debe garantizar que exista un `item_formulado` tipo **BULK** activo asociado.

- La ausencia de `item_formulado` se considera un estado transitorio recuperable (no un estado permanente del dominio).
- Los procesos que guardan fórmula v2 y/o el cron de formulados pueden **crear** el `item_formulado` faltante para evitar que el item quede en `FAIL` por motivos operativos.
- Invariante operacional adicional: si existen líneas en `producto_formula_linea_v2` para un producto, debe existir también cabecera en `producto_formula_v2`. El backend puede autocrear la cabecera con `lote_ref_g=1000` para reparar altas hechas directamente desde el editor de líneas.



---

## 2.2 Fórmula v2 (producto)

El costo técnico del **BULK** se deriva de la **fórmula v2** del producto.

Entidades involucradas:
- `producto_formula_v2` (cabecera)
- `producto_formula_linea_v2` (líneas, con `pct_peso`)
- `cost_option` (resolución del costo por línea)

### Invariantes de unidad y cálculo
1) `cost_option.item_presentacion` está expresado en **kilogramos (kg)**.
   - Para líneas `ITEM_PRESENTACION`, el precio unitario se normaliza a:
     - `ARS/kg = item_price_daily_pres.price_ars / item_price_daily_pres.presentacion`

2) Remainder (CSP) y % p/p:
- Puede existir **0 o 1** línea marcada como `is_csp=true` (remainder).
- El remainder se calcula como:
  - `pct_csp = 100 - sum(pct_peso de líneas con is_csp=false)`
- Invariante: `sum(pct_peso definidos en líneas no-CSP) <= 100`.
- Para líneas no-CSP (`is_csp=false`), `pct_peso` **debe** estar definido (no nulo).

Estas invariantes son requeridas para que el histórico diario (`item_formulado_snapshot`) sea determinista y consistente.


---

## 3. Oferta

Una **Oferta** materializa un ítem comercial en una **presentación** (tamaño).

Campos semánticos clave:

- `item_id`
- `presentacion`
- `motor_id`
- `url_canonica`
- `estado`

### 3.1 Presentación

Regla crítica:

- `offers.presentacion` debe existir en las presentaciones detectadas por el motor para la URL.
- No se aproxima automáticamente (p. ej. 50 → 100).
- La presentación es exacta y forma parte de la identidad comercial de la oferta.

---

## 4. Pricing diario (PROVEEDOR)

Proceso automático que:

1. Scrapea precios por presentación.
2. Actualiza precios diarios (`item_price_daily_pres`).
3. Marca cada oferta como OK / FAIL / PENDING en `pricing_daily_run_items`.
   - Regla operacional: si `attempts >= PRICING_MAX_ATTEMPTS` y sigue `PENDING`, se normaliza a `FAIL` (`last_error='max_attempts_exhausted'`) para que el conteo PEND refleje pendientes reales.

### Propiedades

- Idempotente por fecha (`as_of_date`).
- No modifica estructura de dominio.
- Opera exclusivamente sobre ofertas.

---

## 5. Costos diarios (FORMULADO y MANUAL)

Existen dos procesos independientes del pricing de proveedor:

### 5.1 Formulado – `formulado-costs-daily`

Genera snapshots diarios en:

`app.item_formulado_snapshot`

Campo clave:

- `precio_unitario_ars`
- `as_of_date`

### 5.2 Manual – `manual-costs-daily`

Genera snapshots diarios en:

`app.cost_option_snapshot`

Campo clave:

- `costo_ars`
- `as_of_date`

---

## 6. Estado Operacional Diario (concepto unificado)

La tabla Items muestra un resumen operacional:

Formato:

OK: X | FAIL: Y | PEND: Z

### 6.1 PROVEEDOR

Basado en `pricing_daily_run_items` del día actual.

- OK = status = 'OK'
- FAIL = status = 'FAIL'
- PEND = status = 'PENDING'

Conteo real de ofertas del item.

---

### 6.2 FORMULADO

Entidad evaluada: Producto + BULK reutilizable.

OK: 1  
- Existe `item_formulado` tipo BULK activo.  
- Existe snapshot HOY en `item_formulado_snapshot`.  
- `precio_unitario_ars > 0`.

PEND: 1  
- Existe BULK reutilizable.  
- No existe snapshot HOY.

FAIL: 1  
- No existe BULK reutilizable.  
  o  
- Existe snapshot HOY pero `precio_unitario_ars <= 0`.

Siempre será 0 o 1.

---

### 6.3 MANUAL

Entidad evaluada: `cost_option` tipo `MANUAL_PRESENTACION`.

OK: 1  
- Existe snapshot HOY en `cost_option_snapshot`.  
- `costo_ars > 0`.

PEND: 1  
- No existe snapshot HOY.

FAIL: 1  
- Existe snapshot HOY.  
- `costo_ars <= 0`.

Siempre será 0 o 1.

---

## 7. Invariantes globales

1. Producto cumple doble rol (técnico y comercial).
2. Bulk es la representación técnica reutilizable.
3. Oferta es la entidad comercial concreta.
4. Presentación debe existir en scraping.
5. Pricing es idempotente por fecha.
6. Estado operacional diario refleja ejecución real de los procesos automáticos.
7. FORMULADO solo es “OK” si es técnicamente reutilizable y está costeadо hoy.
8. MANUAL solo es “OK” si tiene snapshot válido hoy.

---

## 8. Separación de responsabilidades

- Tabla Items → estado operacional diario.
- Gráficos → detalle histórico por oferta.
- Pricing → dominio PROVEEDOR.
- Formulado-costs → dominio técnico.
- Manual-costs → dominio manual.

Nunca mezclar responsabilidades entre estos dominios.