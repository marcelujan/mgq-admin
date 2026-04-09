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

## Inicio (`/`)

- La hoja de inicio mantiene enlaces simples a las rutas principales.
- Se agrega un reloj internacional pequeño de una sola línea en la misma fila del subtítulo.
- El reloj muestra `UTC · DD/MM/AAAA HH:MM:SS` con estilo sutil y solo informativo; no altera la fecha operacional local de la app.

Notas:

- Salud DB: se muestra un **indicador DB** (verde/rojo) en el header. Es **clickeable** y abre `/api/db-health` (JSON) en una pestaña nueva.
- No se expone una hoja dedicada de DB health en el menú para evitar ruido en la zona de trabajo.

- Se eliminó el botón **"Cargar items"** desde `/items`. Las altas se hacen por tipo:
  - Proveedor: `/items-proveedores`
  - Manual: `/items-manuales`
- `/jobs-diario` queda como ruta técnica legacy (no enlazada en el header) y su panel se embebe en `/items-proveedores`.
- Naming: la ruta `/productos` continúa administrando la entidad **Producto** (fórmula v2). En la navegación se muestra como **"Items Formulados"** para alinear el menú con el uso operativo, sin cambiar el modelo de dominio.
