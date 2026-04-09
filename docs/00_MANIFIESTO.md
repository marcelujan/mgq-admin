# 00_MANIFIESTO.md
## Libro de la App – mgq-admin

## 1. Propósito del Libro

Este documento es el **contrato operativo y técnico del proyecto**.

Su objetivo es:

- Reducir ambigüedad.
- Evitar rediseños accidentales.
- Evitar suposiciones.
- Minimizar retrabajo.
- Acelerar decisiones futuras.

El libro es la referencia oficial del estado del sistema.

Si algo no está documentado aquí, no se asume como regla del sistema.

## 2. Principios de Trabajo

### 2.1 No Rediseño Implícito

Ninguna tabla, modelo, endpoint o flujo se modifica sin:

1. Documentar la razón.
2. Explicar el impacto.
3. Registrar la decisión en `/docs/09_DECISIONES_TECNICAS.md`.

Cambios estructurales sin registro son considerados inválidos.

### 2.2 No Suposiciones

Si una regla de negocio no está documentada:

- Se consulta.
- O se marca como hipótesis explícita.
- Nunca se implementa como hecho asumido.

### 2.3 Cambios Incrementales

Se priorizan:

- Ajustes mínimos.
- Correcciones localizadas.
- Evolución controlada.

No se rehace arquitectura sin análisis previo documentado.

### 2.4 Verificación Obligatoria

Todo cambio debe incluir:

- Cómo se verifica.
- Qué tabla mirar.
- Qué endpoint probar.
- Qué estado esperar.

Sin verificación, el cambio no se considera completo.

## 3. Definición de “Hecho” vs “Hipótesis”

**Hecho**: confirmado por código actual, base de datos o comportamiento observado.

**Hipótesis**: interpretación no validada. Debe indicarse explícitamente como “HIPÓTESIS:” hasta validar.

## 4. Regla de Consistencia

Una regla solo se considera válida si es consistente en las 3 capas:

1. Base de datos
2. Backend (API + Jobs)
3. Frontend

## 5. Política de Cambios en Base de Datos

No se cambian tipos, no se eliminan columnas y no se redefinen relaciones sin:

- Decisión documentada
- Impacto analizado
- Plan de reversión

## 6. Política de Estándares

Los estándares definidos en `/docs/07_ESTANDARES_UI.md` son obligatorios hasta que se versionen.

## 7. Flujo Diario de Trabajo

Al finalizar cada jornada:

1. Actualizar el/los archivos relevantes.
2. Agregar entrada en `CHANGELOG.md`.
3. Mantener trazabilidad de decisiones.

