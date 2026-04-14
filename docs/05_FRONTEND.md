# 05_FRONTEND.md

(pendiente)

## Shell de navegación

- Header global: `src/app/_components/app-header.tsx`
- Montaje: `src/app/layout.tsx`

Rutas principales enlazadas (v2):

- `/items` (Items — vista agregada)
- `/items-manuales` (Items Manuales — catálogo y edición)
- `/productos` (Items Formulados — UI de Producto / fórmula v2; ver nota de naming)
- `/items-proveedores` (Items Proveedores — alta por URLs con acceso a Cron / Items)
- `/dolar-historico` (Dólar Histórico)
- `/jobs` (Jobs manual)

Notas:

- Salud DB: se muestra un **indicador DB** (verde/rojo) en el header. **No es clickeable**.
- Existe la hoja técnica `/db-health`, pero **no** está enlazada en el menú principal.
- Se eliminó el botón **"Cargar items"** desde `/items`. Las altas se hacen por tipo:
  - Proveedor: `/items-proveedores`
  - Manual: `/items-manuales`
- `/jobs-diario` sigue existiendo como ruta técnica separada. No está enlazada en el header.
- Naming: la ruta `/productos` continúa administrando la entidad **Producto** (fórmula v2). En la navegación se muestra como **"Items Formulados"** para alinear el menú con el uso operativo, sin cambiar el modelo de dominio.

## Editor de Producto (Fórmula v2) — ajustes UI

- En `/productos/[producto_id]` el título visible es el nombre del producto (sin prefijo `Producto #...`).
- Los inputs de costos de producción se muestran inline junto a `Lote ref (g)` y `Densidad producto (g/ml)`; se capturan como `Fijo por lote (ARS)` y `Variable por lote (ARS)`.
- `Variable por lote (ARS)` se persiste como `costo_variable_por_kg_ars` dividiendo por `lote_ref_kg` (derivado de `lote_ref_g/1000`).
- En la tabla de componentes, la columna `Componente` muestra una sola línea (sin metadatos de la opción).
- Formato numérico: densidad producto 3 decimales; costos 2 decimales; masa/vol/costo por línea 2 decimales; densidad por componente 3 decimales.

## Error de build: `Expected '}', got '<eof>'` (TSX)

**Síntoma**

- `Expected '}', got '<eof>'` apuntando al último `}` del archivo.

**Causa típica**

- Se introdujo una llave extra en una firma o bloque, por ejemplo: `function X(...) { {` (dos llaves de apertura).
- El parser llega al fin del archivo esperando una `}` adicional.

**Corrección**

- Revisar firmas de componentes y helpers por patrones `{ {` (con o sin espacios), y dejar una única llave:
  - Correcto: `function X(...) {`
  - Incorrecto: `function X(...) { {`

**Prevención**

- Preferir render condicional con `&& (...)` y evitar ternarios largos con cierres lejanos.
- Ejecutar `npm run build` antes de commitear cambios de UI.

## Nota operativa — Alta por URL de proveedores aceptados

- La pantalla de alta por URL no crea proveedores desde UI.
- `PuraQuimica` y `EUMA` se muestran como proveedores aceptados y el backend infiere proveedor/motor por dominio de la URL.


- La hoja **Items formulados** reutiliza el hard-delete de `FORMULADO` vía `/api/items/fprod:<producto_id>`, igual que la hoja general `Items`.
