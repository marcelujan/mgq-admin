-- Propuesta mínima de Publicaciones
-- No ejecutar sin revisión previa

create table if not exists app.publicacion (
  publicacion_id bigserial primary key,
  item_comercial_id bigint not null references app.item_comercial(item_comercial_id) on delete cascade,
  canal text not null check (canal in ('WEB','MERCADO_LIBRE')),
  titulo text not null,
  descripcion text null,
  precio_venta_ars numeric(18,2) null check (precio_venta_ars is null or precio_venta_ars >= 0),
  activa_manual boolean not null default false,
  canal_external_id text null,
  estado_publicacion text not null default 'BORRADOR'
    check (estado_publicacion in ('BORRADOR','LISTA','PUBLICADA','PAUSADA')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_comercial_id, canal)
);

create index if not exists publicacion_item_comercial_idx
  on app.publicacion(item_comercial_id);

create index if not exists publicacion_canal_idx
  on app.publicacion(canal);

create index if not exists publicacion_estado_idx
  on app.publicacion(estado_publicacion);
