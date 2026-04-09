# 01_STACK_Y_ARQUITECTURA.md
## Stack y Arquitectura – mgq-admin (v2 como entorno de referencia)

### Alcance
Este documento describe la arquitectura del sistema tomando **v2** como entorno de trabajo y referencia del esquema.  
`main` se utiliza solo como destino de migración una vez validado en v2.

---

## 1. Stack tecnológico

### Frontend
- Next.js (App Router)
- React
- TypeScript (strict)

### Backend
- Next.js Route Handlers (`src/app/api/**/route.ts`)
- Runtime Node.js en Vercel para endpoints que lo requieren (por ejemplo crons)

### Base de datos
- PostgreSQL en Neon
- Trabajo diario sobre **la branch v2** de Neon (misma DB, distinta branch).

### Deploy
- Vercel (preview/deployments por rama)
- Cron jobs configurados vía `vercel.json`

---

## 2. Separación lógica del sistema

### 2.1 Capas
1) **DB (Neon/Postgres)**  
2) **Backend (API + Jobs/Cron)**  
3) **Frontend (pantallas y componentes)**

Una regla de negocio se considera válida solo si es consistente en las 3 capas (ver Manifiesto).

### 2.2 Componentes funcionales principales
- **Productos y fórmulas** (producto, fórmula v2, líneas v2, cálculo de costos)
- **Ofertas y proveedor** (offers, motores, scraping, presentaciones)
- **Pricing diario** (runs, run_items, price snapshots por presentación)
- **Costos derivados** (manual-costs-daily, formulado-costs-daily)
- **Packaging / comercial** (packaging, snapshots de costos por oferta)

---

## 3. Entornos y branching

### 3.1 Neon branches
- **v2**: branch principal de trabajo (esquema y datos de referencia)
- **main**: branch destino para migración una vez confirmado

Regla operativa: todo cambio relevante debe quedar documentado y verificado en v2 antes de migrar.

### 3.2 Vercel deployments
- Un deployment por rama (ej: `...git-v2-...vercel.app`)
- Cada deployment debe apuntar a la branch de Neon correspondiente (via `DATABASE_URL`/`NEON_DATABASE_URL` según configuración del proyecto)

**Riesgo típico**: ejecutar crons en un deployment apuntando a otra branch de Neon.  
Mitigación: documentar y verificar `DATABASE_URL` por environment y rama.

---

## 4. Jobs y límites operativos

### 4.1 Cron schedule (Vercel)
Ver `/docs/06_JOBS_Y_AUTOMATIZACIONES.md`.

### 4.2 Límites de ejecución
- Endpoints cron corren con límite de duración (ej. 60s en Vercel)
- Se usa un **time budget** interno para cortar antes del hard timeout.
- Continuations encadenadas: el cron puede auto-invocarse para drenar `PENDING`.

Regla (según implementación actual del cron): `pricing_daily_runs.status = 'DONE'` cuando `pending_count=0` **y** `fail_count=0`. Si existe `FAIL`, el run queda `PARTIAL`.

---

## 5. Variables de entorno críticas (conceptual)

- `DATABASE_URL`: conexión a Neon (branch v2 en el entorno de trabajo)
- `CRON_SECRET`: auth para endpoints cron
- Ajustes de pricing:
  - `PRICING_BATCH_SIZE`
  - `PRICING_CONCURRENCY`
  - `PRICING_TIME_BUDGET_MS`
  - `PRICING_TIME_MARGIN_MS`
  - `PRICING_CHAIN_MAX`
  - `PRICING_MAX_ATTEMPTS`
  - `PRICING_TRIGGER_COSTS`

Nota: los valores exactos y dónde se definen deben mantenerse en el repo (Vercel env vars). Este documento fija solo el rol de cada variable.

---

## 6. Convenciones de documentación

- Cambios estructurales y reglas de negocio: `/docs/09_DECISIONES_TECNICAS.md`
- Diagnósticos reproducibles: `/docs/08_PLAYBOOKS_OPERATIVOS.md`
- Esquema DB (snapshot): `/docs/db/schema_snapshot_v2_YYYY-MM-DD.md`

