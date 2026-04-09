-- Persistencia explícita de identidad visible del item proveedor en la etapa de alta.
-- Objetivo: evitar que la UI derive nombres desde la URL cuando el item recién fue creado.
-- Backfill seguro: si ya existen ofertas aprobadas, sembrar descripcion/articulo desde la última oferta_proveedor.

alter table app.item_seguimiento
  add column if not exists descripcion_fuente text,
  add column if not exists articulo_prov text;

with latest_oferta as (
  select distinct on (op.item_id)
    op.item_id,
    nullif(trim(op.descripcion), '') as descripcion,
    nullif(trim(op.articulo_prov), '') as articulo_prov
  from app.oferta_proveedor op
  where coalesce(trim(op.descripcion), '') <> ''
     or coalesce(trim(op.articulo_prov), '') <> ''
  order by op.item_id, op.updated_at desc nulls last, op.oferta_id desc
)
update app.item_seguimiento i
set
  descripcion_fuente = coalesce(i.descripcion_fuente, lo.descripcion),
  articulo_prov = coalesce(i.articulo_prov, lo.articulo_prov),
  updated_at = now()
from latest_oferta lo
where lo.item_id = i.item_id
  and (
    (i.descripcion_fuente is null and lo.descripcion is not null)
    or (i.articulo_prov is null and lo.articulo_prov is not null)
  );
