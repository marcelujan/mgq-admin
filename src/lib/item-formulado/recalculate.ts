import { db } from "@/lib/db";

type Fuente = "AUTO" | "USER" | "CRON";

/**
 * Recalcula el precio unitario de un item_formulado
 * e inserta snapshot si cambió respecto al último.
 */
export async function recalculateItemFormulado(
  item_formulado_id: number,
  fuente: Fuente = "AUTO"
): Promise<{ updated: boolean; precio_unitario_ars: number }> {
  const sql = db();

  // 1) obtener item_formulado
  const itemRes: any = await sql.query(
    `
    select
      item_formulado_id,
      tipo,
      producto_id,
      oferta_id
    from app.item_formulado
    where item_formulado_id = $1
      and activo = true
    `,
    [item_formulado_id]
  );

  const item = itemRes.rows?.[0];
  if (!item) {
    throw new Error(`item_formulado ${item_formulado_id} no encontrado`);
  }

  let precio_unitario_ars: number | null = null;

  // 2) calcular precio actual según tipo
  if (item.tipo === "BULK") {
    const r: any = await sql.query(
      `
      select
        bulk_ars_kg_con_prod::float8 as ars_kg
      from app.producto_oferta_costo_snapshot
      where oferta_id is null
        and producto_id = $1
      order by snapshot_id desc
      limit 1
      `,
      [item.producto_id]
    );

    precio_unitario_ars = r.rows?.[0]?.ars_kg ?? null;
  }

  if (item.tipo === "PRESENTACION") {
    const r: any = await sql.query(
      `
      select
        total_costo_ars::float8 as ars
      from app.producto_oferta_costo_snapshot
      where oferta_id = $1
      order by snapshot_id desc
      limit 1
      `,
      [item.oferta_id]
    );

    precio_unitario_ars = r.rows?.[0]?.ars ?? null;
  }

  if (precio_unitario_ars === null || !Number.isFinite(precio_unitario_ars)) {
    throw new Error(`no se pudo calcular precio para item_formulado ${item_formulado_id}`);
  }

  // 3) obtener último snapshot
  const lastRes: any = await sql.query(
    `
    select precio_unitario_ars::float8 as ars
    from app.item_formulado_snapshot
    where item_formulado_id = $1
    order by snapshot_id desc
    limit 1
    `,
    [item_formulado_id]
  );

  const last = lastRes.rows?.[0]?.ars ?? null;

  // 4) si no cambió, no hacer nada
  if (last !== null && Math.abs(last - precio_unitario_ars) < 1e-9) {
    return { updated: false, precio_unitario_ars };
  }

  // 5) insertar snapshot
  await sql.query(
    `
    insert into app.item_formulado_snapshot
      (item_formulado_id, precio_unitario_ars, fuente)
    values ($1,$2,$3)
    `,
    [item_formulado_id, precio_unitario_ars, fuente]
  );

  return { updated: true, precio_unitario_ars };
}