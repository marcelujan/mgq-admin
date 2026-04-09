# Schema `app` — Tablas y columnas

Snapshot generado desde `schema_v2.sql` (pg_dump schema-only).

## `corrida`

**PK:** `corrida_id`

**Columnas:**

- `corrida_id` — bigint NOT NULL
- `corrida_tipo` — text NOT NULL
- `estado` — text DEFAULT 'ACTIVE'::text NOT NULL
- `cupo_max` — integer
- `creada_por` — text
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `cost_option`

**PK:** `cost_option_id`

**Columnas:**

- `cost_option_id` — bigint NOT NULL
- `tipo` — text NOT NULL
- `item_id` — bigint
- `item_presentacion` — numeric
- `manual_nombre` — text
- `manual_uom` — text
- `manual_cantidad` — numeric
- `manual_costo_ars` — numeric
- `bulk_producto_id` — bigint
- `densidad_g_ml` — numeric
- `activo` — boolean DEFAULT true NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `cost_option_snapshot`

**PK:** `snapshot_id`

**Columnas:**

- `snapshot_id` — bigint NOT NULL
- `cost_option_id` — bigint NOT NULL
- `costo_ars` — numeric NOT NULL
- `fuente` — text NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `as_of_date` — date NOT NULL

**Restricciones relevantes:**

- UNIQUE (`item_formulado_id`, `as_of_date`)  (1 snapshot por día por item_formulado)


## `formula`

**PK:** `formula_id`

**Columnas:**

- `formula_id` — bigint NOT NULL
- `nombre` — text NOT NULL
- `rendimiento_total_g` — numeric(18,6) DEFAULT 1000 NOT NULL
- `densidad_formula_g_ml` — numeric(12,6)
- `notas` — text
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `formula_linea`

**PK:** `linea_id`

**FKs:**

- (`formula_id`) → `app.formula`(`formula_id`)
- (`insumo_id`) → `app.insumo`(`insumo_id`)

**Columnas:**

- `linea_id` — bigint NOT NULL
- `formula_id` — bigint NOT NULL
- `tipo_linea` — text NOT NULL
- `insumo_id` — bigint
- `pct_peso` — numeric(9,6)
- `concepto` — text
- `costo_ars_por_batch` — numeric(18,6)
- `cantidad_un_por_batch` — numeric(18,6)
- `orden` — integer DEFAULT 0 NOT NULL

## `formula_variante`

**PK:** `variante_id`

**FKs:**

- (`formula_id`) → `app.formula`(`formula_id`)

**Columnas:**

- `variante_id` — bigint NOT NULL
- `formula_id` — bigint NOT NULL
- `nombre` — text NOT NULL
- `peso_neto_g` — numeric(18,6)
- `volumen_neto_ml` — numeric(18,6)
- `unidades_pack` — numeric(18,6)
- `masa_por_unidad_g` — numeric(18,6)
- `volumen_por_unidad_ml` — numeric(18,6)
- `densidad_formula_override_g_ml` — numeric(12,6)
- `merma_pct` — numeric(9,6)
- `activo` — boolean DEFAULT true NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `formula_variante_extra`

**PK:** `extra_id`

**FKs:**

- (`insumo_id`) → `app.insumo`(`insumo_id`)
- (`variante_id`) → `app.formula_variante`(`variante_id`)

**Columnas:**

- `extra_id` — bigint NOT NULL
- `variante_id` — bigint NOT NULL
- `tipo` — text NOT NULL
- `insumo_id` — bigint
- `cantidad` — numeric(18,6)
- `concepto` — text
- `costo_ars` — numeric(18,6)
- `orden` — integer DEFAULT 0 NOT NULL

## `fx`

**PK:** `fecha`

**Columnas:**

- `fecha` — date NOT NULL
- `valor` — numeric(12,4) NOT NULL
- `fuente` — text NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL

## `insumo`

**PK:** `insumo_id`

**Columnas:**

- `insumo_id` — bigint NOT NULL
- `nombre` — text NOT NULL
- `tipo_uom` — text NOT NULL
- `densidad_g_ml` — numeric(12,6)
- `activo` — boolean DEFAULT true NOT NULL
- `notas` — text
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `insumo_fuente`

**PK:** `fuente_id`

**FKs:**

- (`insumo_id`) → `app.insumo`(`insumo_id`)
- (`item_id`) → `app.item_seguimiento`(`item_id`)
- (`oferta_id`) → `app.producto_oferta`(`oferta_id`)
- (`oferta_id`) → `app.producto_oferta`(`oferta_id`)

**Columnas:**

- `fuente_id` — bigint NOT NULL
- `insumo_id` — bigint NOT NULL
- `tipo` — text NOT NULL
- `costo_por_uom_ars` — numeric(18,6)
- `vigente_desde` — date
- `item_id` — bigint
- `presentacion_preferida` — numeric(18,6)
- `habilitada` — boolean DEFAULT true NOT NULL
- `prioridad` — integer DEFAULT 100 NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `oferta_id` — bigint

## `item_formulado`

**PK:** `item_formulado_id`

**FKs:**

- (`oferta_id`) → `app.producto_oferta`(`oferta_id`)
- (`producto_id`) → `app.producto`(`producto_id`)

**Columnas:**

- `item_formulado_id` — integer NOT NULL
- `tipo` — text NOT NULL
- `producto_id` — integer NOT NULL
- `oferta_id` — integer
- `nombre` — text NOT NULL
- `activo` — boolean DEFAULT true NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `item_formulado_snapshot`

**PK:** `snapshot_id`

**FKs:**

- (`item_formulado_id`) → `app.item_formulado`(`item_formulado_id`)

**Columnas:**

- `snapshot_id` — bigint NOT NULL
- `item_formulado_id` — integer NOT NULL
- `precio_unitario_ars` — numeric(14,6) NOT NULL
- `fuente` — text NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `as_of_date` — date NOT NULL

**Restricciones relevantes:**

- UNIQUE (`item_formulado_id`, `as_of_date`)  (1 snapshot por día por item_formulado)


## `item_price_daily`

**PK:** `id`

**FKs:**

- (`item_id`) → `app.item_seguimiento`(`item_id`)

**Columnas:**

- `id` — bigint NOT NULL
- `item_id` — bigint NOT NULL
- `price_ars` — numeric(18,2) NOT NULL
- `source_url` — text NOT NULL
- `as_of_date` — date NOT NULL

**Restricciones relevantes:**

- UNIQUE (`item_formulado_id`, `as_of_date`)  (1 snapshot por día por item_formulado)

- `scrape_run_id` — bigint
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL

## `item_price_daily_pres`

**PK:** `id`

**FKs:**

- (`item_id`) → `app.item_seguimiento`(`item_id`)

**Columnas:**

- `id` — bigint NOT NULL
- `item_id` — bigint NOT NULL
- `as_of_date` — date NOT NULL

**Restricciones relevantes:**

- UNIQUE (`item_formulado_id`, `as_of_date`)  (1 snapshot por día por item_formulado)

- `presentacion` — numeric NOT NULL
  - **Unidad:** KG (kilogramos) para presentaciones de `ITEM_PRESENTACION` (ver `cost_option.item_presentacion`).
- `price_ars` — numeric(18,2) NOT NULL
- `source_url` — text NOT NULL
- `scrape_run_id` — bigint
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL

## `item_seguimiento`

**PK:** `item_id`

**FKs:**

- (`motor_id`) → `app.motor_proveedor`(`motor_id`)
- (`proveedor_id`) → `app.proveedor`(`proveedor_id`)

**Columnas:**

- `item_id` — bigint NOT NULL
- `proveedor_id` — bigint NOT NULL
- `motor_id` — bigint NOT NULL
- `url_original` — text NOT NULL
- `url_canonica` — text NOT NULL
- `seleccionado` — boolean DEFAULT false NOT NULL
- `estado` — app.item_estado DEFAULT 'PENDING_SCRAPE'::app.item_estado NOT NULL
- `ultimo_intento_scrape` — timestamp with time zone
- `ultimo_scrape_ok` — timestamp with time zone
- `ultimo_error_scrape` — timestamp with time zone
- `mensaje_error` — text
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `job`

**PK:** `job_id`

**FKs:**

- (`corrida_id`) → `app.corrida`(`corrida_id`)
- (`item_id`) → `app.item_seguimiento`(`item_id`)
- (`proveedor_id`) → `app.proveedor`(`proveedor_id`)

**Columnas:**

- `job_id` — bigint NOT NULL
- `tipo` — app.job_tipo NOT NULL
- `estado` — app.job_estado DEFAULT 'PENDING'::app.job_estado NOT NULL
- `prioridad` — integer DEFAULT 100 NOT NULL
- `proveedor_id` — bigint
- `item_id` — bigint
- `corrida_id` — bigint
- `payload` — jsonb DEFAULT '{}'::jsonb NOT NULL
- `attempts` — integer DEFAULT 0 NOT NULL
- `max_attempts` — integer DEFAULT 3 NOT NULL
- `next_run_at` — timestamp with time zone DEFAULT now() NOT NULL
- `locked_by` — text
- `locked_until` — timestamp with time zone
- `last_error` — text
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `started_at` — timestamp with time zone
- `finished_at` — timestamp with time zone
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `job_result`

**PK:** `result_id`

**FKs:**

- (`job_id`) → `app.job`(`job_id`)
- (`motor_id`) → `app.motor_proveedor`(`motor_id`)

**Columnas:**

- `result_id` — bigint NOT NULL
- `job_id` — bigint NOT NULL
- `motor_id` — bigint NOT NULL
- `motor_version` — text NOT NULL
- `status` — app.job_result_status DEFAULT 'OK'::app.job_result_status NOT NULL
- `candidatos` — jsonb DEFAULT '[]'::jsonb NOT NULL
- `warnings` — jsonb DEFAULT '[]'::jsonb NOT NULL
- `errors` — jsonb DEFAULT '[]'::jsonb NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL

## `motor_proveedor`

**PK:** `motor_id`

**Columnas:**

- `motor_id` — bigint NOT NULL
- `motor_nombre` — text NOT NULL
- `motor_version` — text DEFAULT '1'::text NOT NULL
- `activo` — boolean DEFAULT true NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `oferta_proveedor`

**PK:** `oferta_id`

**FKs:**

- (`item_id`) → `app.item_seguimiento`(`item_id`)

**Columnas:**

- `oferta_id` — bigint NOT NULL
- `item_id` — bigint NOT NULL
- `articulo_prov` — text
- `presentacion` — numeric
- `uom` — app.uom
- `costo_base_usd` — numeric
- `fx_usado_en_alta` — numeric
- `fecha_scrape_base` — date
- `densidad` — numeric
- `descripcion` — text
- `habilitada` — boolean DEFAULT true NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `offer_prices_daily`

**PK:** `id`

**Columnas:**

- `id` — bigint NOT NULL
- `offer_id` — bigint NOT NULL
- `price_ars` — numeric(18,2) NOT NULL
- `source_url` — text NOT NULL
- `as_of_date` — date NOT NULL

**Restricciones relevantes:**

- UNIQUE (`item_formulado_id`, `as_of_date`)  (1 snapshot por día por item_formulado)

- `scrape_job_id` — bigint
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL

## `offers`

**PK:** `offer_id`

**Columnas:**

- `offer_id` — bigint NOT NULL
- `item_id` — bigint NOT NULL
- `motor_id` — bigint NOT NULL
- `url_original` — text NOT NULL
- `url_canonica` — text
- `presentacion` — numeric
- `estado` — text DEFAULT 'OK'::text NOT NULL
- `created_at` — timestamp with time zone DEFAULT now()
- `updated_at` — timestamp with time zone DEFAULT now()

## `packaging_item`

**PK:** `packaging_item_id`

**Columnas:**

- `packaging_item_id` — bigint NOT NULL
- `nombre` — text NOT NULL
- `descripcion` — text
- `unidad` — text DEFAULT 'UN'::text NOT NULL
- `costo_unitario_ars` — numeric(14,4) NOT NULL
- `activo` — boolean DEFAULT true NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `pricing_daily_run_items`

**PK:** `id`

**FKs:**

- (`run_id`) → `app.pricing_daily_run_items`(`id`)

**Columnas:**

- `id` — bigint NOT NULL
- `run_id` — bigint NOT NULL
- `offer_id` — bigint NOT NULL
- `status` — app.pricing_run_item_status DEFAULT 'PENDING'::app.pricing_run_item_status NOT NULL
- `attempts` — integer DEFAULT 0 NOT NULL
- `last_error` — text
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL

## `pricing_daily_runs`

**PK:** `id`

**Columnas:**

- `id` — bigint NOT NULL
- `as_of_date` — date NOT NULL

**Restricciones relevantes:**

- UNIQUE (`item_formulado_id`, `as_of_date`)  (1 snapshot por día por item_formulado)

- `status` — app.pricing_run_status DEFAULT 'RUNNING'::app.pricing_run_status NOT NULL
- `started_at` — timestamp with time zone DEFAULT now() NOT NULL
- `finished_at` — timestamp with time zone
- `total_approved` — integer DEFAULT 0 NOT NULL
- `ok_count` — integer DEFAULT 0 NOT NULL
- `fail_count` — integer DEFAULT 0 NOT NULL
- `skipped_count` — integer DEFAULT 0 NOT NULL
- `last_error` — text
- `total_items` — integer DEFAULT 0 NOT NULL
- `pending_count` — integer DEFAULT 0 NOT NULL

## `producto`

**PK:** `producto_id`

**Columnas:**

- `producto_id` — bigint NOT NULL
- `nombre` — text NOT NULL
- `descripcion` — text
- `categoria` — text
- `densidad_producto_g_ml` — numeric
- `activo` — boolean DEFAULT true NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `producto_base`

**PK:** `producto_id`

**FKs:**

- (`insumo_id`) → `app.insumo`(`insumo_id`)
- (`producto_id`) → `app.producto`(`producto_id`)

**Columnas:**

- `producto_id` — bigint NOT NULL
- `tipo_base` — text NOT NULL
- `insumo_id` — bigint
- `item_id` — bigint
- `presentacion_preferida` — numeric

## `producto_costos_produccion`

**PK:** `producto_id`

**FKs:**

- (`producto_id`) → `app.producto`(`producto_id`)

**Columnas:**

- `producto_id` — bigint NOT NULL
- `lote_ref_kg` — numeric
- `costo_fijo_por_lote_ars` — numeric
- `costo_variable_por_kg_ars` — numeric
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `producto_formula`

**PK:** `producto_id`

**FKs:**

- (`producto_id`) → `app.producto`(`producto_id`)

**Columnas:**

- `producto_id` — bigint NOT NULL
- `rendimiento_total_g` — numeric DEFAULT 1000 NOT NULL
- `densidad_formula_g_ml` — numeric
- `notas` — text
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `producto_formula_linea`

**PK:** `linea_id`

**FKs:**

- (`insumo_id`) → `app.insumo`(`insumo_id`)
- (`producto_id`) → `app.producto`(`producto_id`)

**Columnas:**

- `linea_id` — bigint NOT NULL
- `producto_id` — bigint NOT NULL
- `insumo_id` — bigint NOT NULL
- `pct_peso` — numeric NOT NULL
- `orden` — integer DEFAULT 0 NOT NULL

## `producto_formula_linea_v2`

**PK:** `linea_id`

**FKs:**

- (`cost_option_id`) → `app.cost_option`(`cost_option_id`)
- (`producto_id`) → `app.producto`(`producto_id`)

**Columnas:**

- `linea_id` — bigint NOT NULL
- `producto_id` — bigint NOT NULL
- `cost_option_id` — bigint NOT NULL
- `pct_peso` — numeric
- `is_csp` — boolean DEFAULT false NOT NULL
- `orden` — integer DEFAULT 1 NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `producto_formula_v2`

**PK:** `producto_id`

**Columnas:**

- `producto_id` — bigint NOT NULL
- `lote_ref_g` — numeric DEFAULT 1000 NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `producto_oferta`

**PK:** `oferta_id`

**FKs:**

- (`producto_id`) → `app.producto`(`producto_id`)

**Columnas:**

- `oferta_id` — bigint NOT NULL
- `producto_id` — bigint NOT NULL
- `nombre` — text NOT NULL
- `peso_neto_g` — numeric
- `volumen_neto_ml` — numeric
- `unidades_pack` — numeric
- `masa_por_unidad_g` — numeric
- `volumen_por_unidad_ml` — numeric
- `densidad_override_g_ml` — numeric
- `merma_pct` — numeric
- `activo` — boolean DEFAULT true NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL
- `is_bulk` — boolean DEFAULT false NOT NULL

## `producto_oferta_costo_snapshot`

**PK:** `snapshot_id`

**FKs:**

- (`oferta_id`) → `app.producto_oferta`(`oferta_id`)

**Columnas:**

- `snapshot_id` — bigint NOT NULL
- `oferta_id` — bigint NOT NULL
- `bulk_ars_kg_con_prod` — numeric(14,4) NOT NULL
- `masa_total_g` — numeric(14,4) NOT NULL
- `base_costo_ars` — numeric(14,4) NOT NULL
- `packaging_costo_ars` — numeric(14,4) NOT NULL
- `total_costo_ars` — numeric(14,4) NOT NULL
- `densidad_usada_g_ml` — numeric(14,6)
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL

## `producto_oferta_costo_snapshot_packaging`

**PK:** `snapshot_packaging_id`

**FKs:**

- (`snapshot_id`) → `app.producto_oferta_costo_snapshot`(`snapshot_id`)

**Columnas:**

- `snapshot_packaging_id` — bigint NOT NULL
- `snapshot_id` — bigint NOT NULL
- `packaging_item_id` — bigint
- `nombre` — text NOT NULL
- `cantidad` — numeric(14,4) NOT NULL
- `costo_unitario_ars` — numeric(14,4) NOT NULL
- `subtotal_ars` — numeric(14,4) NOT NULL

## `producto_oferta_extra`

**PK:** `extra_id`

**FKs:**

- (`insumo_id`) → `app.insumo`(`insumo_id`)
- (`oferta_id`) → `app.producto_oferta`(`oferta_id`)

**Columnas:**

- `extra_id` — bigint NOT NULL
- `oferta_id` — bigint NOT NULL
- `tipo` — text NOT NULL
- `insumo_id` — bigint
- `cantidad` — numeric
- `concepto` — text
- `costo_ars` — numeric
- `orden` — integer DEFAULT 0 NOT NULL

## `producto_oferta_packaging`

**PK:** `oferta_packaging_id`

**FKs:**

- (`oferta_id`) → `app.producto_oferta`(`oferta_id`)
- (`packaging_item_id`) → `app.packaging_item`(`packaging_item_id`)

**Columnas:**

- `oferta_packaging_id` — bigint NOT NULL
- `oferta_id` — bigint NOT NULL
- `packaging_item_id` — bigint NOT NULL
- `cantidad` — numeric(14,4) NOT NULL
- `costo_unitario_override_ars` — numeric(14,4)
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL

## `proveedor`

**PK:** `proveedor_id`

**FKs:**

- (`motor_id_default`) → `app.motor_proveedor`(`motor_id`)

**Columnas:**

- `proveedor_id` — bigint NOT NULL
- `codigo` — text NOT NULL
- `nombre` — text NOT NULL
- `motor_id_default` — bigint
- `periodo_rescrape_dias` — integer DEFAULT 30 NOT NULL
- `activo` — boolean DEFAULT true NOT NULL
- `created_at` — timestamp with time zone DEFAULT now() NOT NULL
- `updated_at` — timestamp with time zone DEFAULT now() NOT NULL
