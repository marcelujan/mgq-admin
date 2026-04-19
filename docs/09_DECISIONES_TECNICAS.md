# 09_DECISIONES_TECNICAS

## Item Comercial en modo borrador

Se acepta que `Item Comercial` exista como borrador con solo `nombre`.

Consecuencias:
- `cantidad` y `unidad` dejan de ser obligatorias para persistir el borrador
- el origen técnico puede completarse después
- la falta de esos datos no impide guardar el avance
- la ofertabilidad se resuelve después, no en la etapa de creación del borrador

## Obligatorio en Envases / Etiquetas

La decisión de obligatoriedad deja de estar en manos del usuario final mediante checkbox.

Regla actual:
- toda asociación de `Item Envase` o `Item Etiqueta` a `Item Comercial` se trata como obligatoria por definición del sistema
- `Item Paquetería` sigue fuera de la lógica de bloqueo
