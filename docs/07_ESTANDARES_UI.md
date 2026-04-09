# 07_ESTANDARES_UI.md

## Estándares de UI

## Estándar de Tablas v1.1 (modo compacto, unificado)

### Objetivo
Consistencia estricta: mismas reglas de columnas, nombres, unidades y estados en toda la app.

---

## Reglas generales

1. La celda principal muestra **nombre** (no ID).
2. El ID, cuando sea necesario, va en **columna separada** o como metadato discreto.
3. Filas de **una sola línea**. Sin celdas multilinea.
4. Unidades obligatorias cuando aplique (%, g/ml, $/kg, L, kg).
5. Estados deben mostrarse como texto explícito. Nunca solo color.
6. Dentro de una misma tabla: mismo set de columnas y mismas reglas de renderizado.

### Excepciones permitidas

- `last_error` puede ser expandible o multilinea (solo en vistas técnicas).
- Tooltips permitidos para textos truncados.

---

# Items – Tabla oficial v2.0 (solo visual, sin tocar gráficos)

## Unidad de fila

1 fila = 1 item (PROVEEDOR, MANUAL o FORMULADO).

Nunca múltiples renglones por celda.

---

## Columnas (orden obligatorio)

1. Item #  
2. Nombre  
3. Fuente  
4. Estado  
5. Actualizado  
6. Acciones  

La columna “Presentaciones” no forma parte de esta vista.  
El detalle vive exclusivamente en los gráficos.

---

## Columna "Nombre"

### PROVEEDOR
- Usar nombre real del producto si existe.
- Si no existe, derivarlo del último segmento de la URL (slug).
- Nunca mostrar solo el dominio (ej. puraquimica.com.ar).
- Si todo falla: fallback a `Item {id}`.

### FORMULADO
- Usar `producto.nombre`.

### MANUAL
- Usar `manual_nombre`.

---

## Estado agregado (regla unificada para los 3 tipos)

Formato obligatorio:

OK: X | FAIL: Y | PEND: Z

- Orden fijo: OK, FAIL, PEND.
- Siempre mostrar las tres categorías.
- No usar solo color como señal.
- Es un resumen operacional.

---

## Semántica por tipo

### PROVEEDOR

Basado en `pricing_daily_run_items` del día actual.

- OK = status = 'OK'
- FAIL = status = 'FAIL'
- PEND = status = 'PENDING'

Conteo real de ofertas del item.

---

### FORMULADO

Entidad evaluada: producto con `item_formulado` tipo `BULK` activo.

OK: 1  
- Existe `item_formulado` tipo BULK activo (reutilizable).  
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

### MANUAL

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

## Restricción explícita

No modificar:

- Gráfico comparativo superior.
- Gráficos individuales por oferta.
- Interacciones del gráfico.
- Layout del bloque de gráficos.

La tabla Items es únicamente un resumen operacional.

---

## Principio rector

La tabla responde a una única pregunta:

“¿Está operativamente sano hoy?”

Los gráficos responden:

“¿Cuál es el detalle histórico por oferta?”

Separación estricta de responsabilidades.

## Navegación global (AppHeader)

### Objetivo
- Proveer navegación consistente dentro de la app (evitar depender del botón “Atrás” del navegador).
- Mantener cambios mínimos: sin reestructurar páginas ni modificar gráficos.

### Comportamiento
- Se renderiza un header global en `src/app/layout.tsx` mediante `AppHeader`.
- Botón **← Volver**:
  - Ejecuta `router.back()`.
  - Fallback a `/` si no existe historial de sesión (deep link).
- Links persistentes (v1): Inicio, Productos, Items, Jobs manual, Jobs diario.
- Breadcrumbs simples derivados del `pathname` (máx. 2 niveles).

### Nota de alcance
- La sección **Insumos** existe en la app, pero **no** se considera parte del flujo de creación de “items manuales”.
  - Los “items manuales” se gestionan desde `Items → Cargar items` (`/items/new`).
  - `Insumos` se usa para el catálogo interno de componentes y fuentes de costo (`insumo`, `insumo_fuente`).


## Regla adicional — tablas de Items Formulados

- CTA principal estandarizado: `Nuevo`.
- La columna descriptiva debe llamarse `Nombre`.
- La edición no se dispara desde el nombre; vive en la columna `Acciones`.
- Cuando aplique a formulados, exponer `ARS/kg` y `Lote ref (g)` como columnas separadas.
- `ARS/kg` refiere al valor total operativo del formulado (incluye costo fijo/variable si existe snapshot actualizado).


## Regla adicional — Dólar Histórico

- La hoja principal se nombra `Dólar Histórico`.
- Columnas base: `Fecha`, `USD venta`, `Acciones`.
- Orden por defecto: `Fecha` descendente.
- Tipografía, paddings y acciones deben seguir el mismo patrón de tablas compactas del resto de la app.
- Los gráficos históricos simples deben exponer selector de intervalo cuando sigan el patrón de publicaciones/productos (`30`, `60`, `100`, `180`, `365`, `Todo`) y arrancar en `30 días`.
