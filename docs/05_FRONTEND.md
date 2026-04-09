# 05_FRONTEND.md

(pendiente)

## Shell de navegación

- Header global: `src/app/_components/app-header.tsx`
- Montaje: `src/app/layout.tsx`

Rutas principales enlazadas (v2):

- `/items` (Items — vista agregada)
- `/items-manuales` (Items Manuales — catálogo y edición)
- `/productos` (Items Formulados — UI de Producto / fórmula v2; ver nota de naming)
- `/items-proveedores` (Items Proveedores — alta por URLs + Jobs diario)
- `/jobs` (Jobs manual)

Notas:

- Salud DB: se muestra un **indicador DB** (verde/rojo) en el header. Es **clickeable** y abre `/api/db-health` (JSON) en una pestaña nueva.
- No se expone una hoja dedicada de DB health en el menú para evitar ruido en la zona de trabajo.

- Se eliminó el botón **"Cargar items"** desde `/items`. Las altas se hacen por tipo:
  - Proveedor: `/items-proveedores`
  - Manual: `/items-manuales`
- `/jobs-diario` queda como ruta técnica legacy (no enlazada en el header) y su panel se embebe en `/items-proveedores`.
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

## Items PROVEEDOR — naming visible

- La lista `/items` y el detalle `/items/[item_id]` priorizan `item_seguimiento.descripcion_fuente` como nombre visible del item proveedor.
- Si no existe todavía una descripción persistida, se usa fallback `Proveedor · SKU` con `item_seguimiento.articulo_prov`.
- La URL queda como último recurso; no debe mostrarse `products_id`, `osCsid` ni IDs desnudos como nombre principal del item.

## Alta por URL — persistencia explícita de identidad

- El alta por `/api/ofertas/bulk` y la carga puntual por `/api/ofertas` siembran `descripcion_fuente` y `articulo_prov` en `app.item_seguimiento`.
- Esto aplica a ambos proveedores aceptados (`PuraQuimica`, `EUMA`) y evita depender del cron o de `oferta_proveedor` para mostrar un nombre útil inmediatamente después del alta.
