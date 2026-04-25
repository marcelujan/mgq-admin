create table if not exists app.meli_auth (
  meli_auth_id bigserial primary key,
  site_id text not null default 'MLA',
  user_id bigint not null unique,
  nickname text null,
  access_token text not null,
  refresh_token text not null,
  token_type text null default 'bearer',
  scope text null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists meli_auth_active_idx
  on app.meli_auth(is_active, updated_at desc);\n