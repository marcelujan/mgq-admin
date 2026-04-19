# 04_API_BACKEND

## Items Comerciales

### POST `/api/items-comerciales`
- crea borrador o registro inicial de `Item Comercial`
- mínimo requerido:
  - `nombre`
- opcionales en esta etapa:
  - `descripcion`
  - `cantidad`
  - `unidad`
  - una FK de origen técnico
- validaciones:
  - si se informa `unidad`, debe ser `GR | ML | UN`
  - si se informa `cantidad`, debe ser positiva
  - si `unidad = UN`, `cantidad` debe ser entera
  - no se admite más de un origen técnico simultáneo
  - si hay `unidad` y origen técnico, se valida compatibilidad con el bulk

### PATCH `/api/items-comerciales/[item_comercial_id]`
- actualización parcial
- mismo criterio de borrador:
  - solo `nombre` es estrictamente requerido
  - el resto puede completarse más adelante

## Relaciones de Envases / Etiquetas

- la UI ya no expone la casilla `obligatorio`
- por regla de sistema, toda relación agregada desde estas dos secciones se considera obligatoria
- el usuario solo define:
  - ítem relacionado
  - cantidad
