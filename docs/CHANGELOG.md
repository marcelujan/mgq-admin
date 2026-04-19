# CHANGELOG

## 2026-04-17

- `Items Comerciales` pasa a modo borrador/autoguardado:
  - se puede crear con solo `nombre`
  - `cantidad`, `unidad` y origen técnico pueden completarse después
  - la hoja crea el borrador automáticamente y luego sigue editando sobre el mismo registro
- Se elimina el uso visible de la casilla `Obligatorio` en asociaciones de `Envases` y `Etiquetas`.
  - En esta etapa, toda asociación de `Envase` o `Etiqueta` se trata como obligatoria por regla del sistema.
- `Item Comercial` deja de depender del botón `Guardar`.
  - La pantalla muestra estado `Guardando...` / `Guardado`.
- Las relaciones de `Envases` y `Etiquetas` pasan a actualizar cantidad con edición directa y guardado al salir del campo.
- Se agrega migración para permitir borradores en `app.item_comercial` sin exigir todavía `cantidad`, `unidad` ni origen técnico único completo.
