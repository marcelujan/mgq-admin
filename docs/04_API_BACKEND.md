# 04_API_BACKEND

## Ajuste vNext — catálogos operativos autónomos

`Items Envases`, `Items Etiqueta` e `Items Paquetería` dejaron de tratarse como wrappers de un origen técnico existente.

En esta versión se crean y editan como catálogos autónomos:

- `POST /api/items-envases` recibe: `nombre`, `descripcion?`
- `POST /api/items-etiqueta` recibe: `nombre`, `material?`, `medidas`, `descripcion?`
- `POST /api/items-paqueteria` recibe: `nombre`, `descripcion?`

No se pide más:

- `manual_cost_option_id`
- `proveedor_item_id`

Esos campos siguen únicamente en `Items Comerciales` como parte de su origen técnico único.
