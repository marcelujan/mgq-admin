-- Propuesta futura (no ejecutar aún)
-- Pricing mínimo por canal para Item Comercial

create table if not exists app.item_comercial_pricing (
  item_comercial_pricing_id bigserial primary key,
  item_comercial_id bigint not null unique references app.item_comercial(item_comercial_id) on delete cascade,
  costo_referencia_ars numeric(18,2) null,
  margen_referencia_pct numeric(10,4) null,
  precio_sin_impuestos numeric(18,2) null,
  precio_directo numeric(18,2) null,
  precio_web numeric(18,2) null,
  precio_ml numeric(18,2) null,
  updated_at timestamptz not null default now(),
  check (costo_referencia_ars is null or costo_referencia_ars >= 0),
  check (precio_sin_impuestos is null or precio_sin_impuestos >= 0),
  check (precio_directo is null or precio_directo >= 0),
  check (precio_web is null or precio_web >= 0),
  check (precio_ml is null or precio_ml >= 0)
);
