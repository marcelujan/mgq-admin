import { db } from "@/lib/db";

export type CatalogKind = "envases" | "etiqueta" | "paqueteria";

type Config = {
  table: string;
  idCol: string;
  hasMedidas: boolean;
};

const CONFIG: Record<CatalogKind, Config> = {
  envases: { table: "app.item_envase", idCol: "item_envase_id", hasMedidas: false },
  etiqueta: { table: "app.item_etiqueta", idCol: "item_etiqueta_id", hasMedidas: true },
  paqueteria: { table: "app.item_paqueteria", idCol: "item_paqueteria_id", hasMedidas: false },
};

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(v: any): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

export function parseCatalogBody(kind: CatalogKind, body: any) {
  const nombre = textOrNull(body?.nombre);
  const uom = String(body?.uom ?? "").trim().toUpperCase();
  const cantidad_referencia = numOrNull(body?.cantidad_referencia);
  const costo_ars = numOrNull(body?.costo_ars);
  const ancho_mm = kind === "etiqueta" ? numOrNull(body?.ancho_mm) : null;
  const largo_mm = kind === "etiqueta" ? numOrNull(body?.largo_mm) : null;

  if (!nombre) return { ok: false as const, error: "nombre requerido" };
  if (!["GR", "ML", "UN"].includes(uom)) return { ok: false as const, error: "uom inválida" };
  if (cantidad_referencia === null || !Number.isFinite(cantidad_referencia) || cantidad_referencia <= 0) {
    return { ok: false as const, error: "cantidad_referencia inválida" };
  }
  if (uom === "UN" && cantidad_referencia !== Math.trunc(cantidad_referencia)) {
    return { ok: false as const, error: "cantidad_referencia debe ser entera para UN" };
  }
  if (costo_ars === null || !Number.isFinite(costo_ars) || costo_ars < 0) {
    return { ok: false as const, error: "costo_ars inválido" };
  }
  if (kind === "etiqueta") {
    if (ancho_mm === null || !Number.isFinite(ancho_mm) || ancho_mm <= 0 || ancho_mm !== Math.trunc(ancho_mm)) return { ok: false as const, error: "ancho_mm inválido" };
    if (largo_mm === null || !Number.isFinite(largo_mm) || largo_mm <= 0 || largo_mm !== Math.trunc(largo_mm)) return { ok: false as const, error: "largo_mm inválido" };
  }

  return {
    ok: true as const,
    value: { nombre, uom, cantidad_referencia, costo_ars, ancho_mm, largo_mm },
  };
}

export async function listCatalog(kind: CatalogKind, search: string) {
  const { table, idCol, hasMedidas } = CONFIG[kind];
  const sql = db();
  const r: any = await sql.query(
    `
    SELECT
      c.${idCol},
      c.nombre,
      c.uom,
      c.cantidad_referencia::float8 as cantidad_referencia,
      c.costo_ars::float8 as costo_ars,
      ${hasMedidas ? "c.ancho_mm, c.largo_mm" : "null::integer as ancho_mm, null::integer as largo_mm"},
      c.activo,
      c.updated_at
    FROM ${table} c
    WHERE (
      $1::text = '' OR
      coalesce(c.nombre,'') ILIKE '%' || $1::text || '%' OR
      ${hasMedidas ? "concat_ws(' x ', c.ancho_mm::text, c.largo_mm::text) ILIKE '%' || $1::text || '%' OR" : ""}
      coalesce(c.uom,'') ILIKE '%' || $1::text || '%'
    )
    ORDER BY c.nombre ASC, c.${idCol} ASC
    `,
    [search]
  );
  return rowsOf(r);
}

export async function getCatalog(kind: CatalogKind, id: number) {
  const { table, idCol, hasMedidas } = CONFIG[kind];
  const sql = db();
  const r: any = await sql.query(
    `
    SELECT
      c.${idCol},
      c.nombre,
      c.uom,
      c.cantidad_referencia::float8 as cantidad_referencia,
      c.costo_ars::float8 as costo_ars,
      ${hasMedidas ? "c.ancho_mm, c.largo_mm" : "null::integer as ancho_mm, null::integer as largo_mm"},
      c.activo,
      c.updated_at
    FROM ${table} c
    WHERE c.${idCol} = $1
    LIMIT 1
    `,
    [id]
  );
  return rowsOf(r)[0] ?? null;
}

export async function createCatalog(kind: CatalogKind, body: any) {
  const parsed = parseCatalogBody(kind, body);
  if (!parsed.ok) return parsed;
  const { table, idCol, hasMedidas } = CONFIG[kind];
  const { nombre, uom, cantidad_referencia, costo_ars, ancho_mm, largo_mm } = parsed.value;
  const sql = db();
  const r: any = await sql.query(
    `
    INSERT INTO ${table} (nombre, uom, cantidad_referencia, costo_ars${hasMedidas ? ", ancho_mm, largo_mm" : ""})
    VALUES ($1, $2, $3, $4${hasMedidas ? ", $5, $6" : ""})
    RETURNING ${idCol}
    `,
    hasMedidas ? [nombre, uom, cantidad_referencia, costo_ars, ancho_mm, largo_mm] : [nombre, uom, cantidad_referencia, costo_ars]
  );
  return { ok: true as const, id: Number(rowsOf(r)[0]?.[idCol]) };
}

export async function patchCatalog(kind: CatalogKind, id: number, body: any) {
  const { table, idCol, hasMedidas } = CONFIG[kind];
  const nombre = body?.nombre === undefined ? undefined : textOrNull(body?.nombre);
  const uom = body?.uom === undefined ? undefined : String(body?.uom ?? "").trim().toUpperCase();
  const cantidad_referencia = body?.cantidad_referencia === undefined ? undefined : numOrNull(body?.cantidad_referencia);
  const costo_ars = body?.costo_ars === undefined ? undefined : numOrNull(body?.costo_ars);
  const ancho_mm = hasMedidas && body?.ancho_mm !== undefined ? numOrNull(body?.ancho_mm) : undefined;
  const largo_mm = hasMedidas && body?.largo_mm !== undefined ? numOrNull(body?.largo_mm) : undefined;
  const activo = body?.activo === undefined ? undefined : Boolean(body?.activo);

  if (nombre !== undefined && !nombre) return { ok: false as const, error: "nombre requerido" };
  if (uom !== undefined && !["GR", "ML", "UN"].includes(uom)) return { ok: false as const, error: "uom inválida" };
  if (cantidad_referencia !== undefined) {
    if (cantidad_referencia === null || !Number.isFinite(cantidad_referencia) || cantidad_referencia <= 0) {
      return { ok: false as const, error: "cantidad_referencia inválida" };
    }
    const effectiveUom = uom ?? null;
    if (effectiveUom === "UN" && cantidad_referencia !== Math.trunc(cantidad_referencia)) {
      return { ok: false as const, error: "cantidad_referencia debe ser entera para UN" };
    }
  }
  if (costo_ars !== undefined && (costo_ars === null || !Number.isFinite(costo_ars) || costo_ars < 0)) {
    return { ok: false as const, error: "costo_ars inválido" };
  }
  if (hasMedidas && ancho_mm !== undefined) {
    if (ancho_mm === null || !Number.isFinite(ancho_mm) || ancho_mm <= 0 || ancho_mm !== Math.trunc(ancho_mm)) return { ok: false as const, error: "ancho_mm inválido" };
  }
  if (hasMedidas && largo_mm !== undefined) {
    if (largo_mm === null || !Number.isFinite(largo_mm) || largo_mm <= 0 || largo_mm !== Math.trunc(largo_mm)) return { ok: false as const, error: "largo_mm inválido" };
  }
  if (hasMedidas) {
    const widthProvided = ancho_mm !== undefined;
    const lengthProvided = largo_mm !== undefined;
    if (widthProvided !== lengthProvided) return { ok: false as const, error: "ancho_mm y largo_mm deben informarse juntos" };
  }

  const sets: string[] = [];
  const values: any[] = [];
  let p = 1;

  if (nombre !== undefined) { sets.push(`nombre=$${p++}`); values.push(nombre); }
  if (uom !== undefined) { sets.push(`uom=$${p++}`); values.push(uom); }
  if (cantidad_referencia !== undefined) { sets.push(`cantidad_referencia=$${p++}`); values.push(cantidad_referencia); }
  if (costo_ars !== undefined) { sets.push(`costo_ars=$${p++}`); values.push(costo_ars); }
  if (hasMedidas && ancho_mm !== undefined) { sets.push(`ancho_mm=$${p++}`); values.push(ancho_mm); }
  if (hasMedidas && largo_mm !== undefined) { sets.push(`largo_mm=$${p++}`); values.push(largo_mm); }
  if (activo !== undefined) { sets.push(`activo=$${p++}`); values.push(activo); }

  if (!sets.length) return { ok: true as const };

  values.push(id);
  const sql = db();
  const r: any = await sql.query(
    `
    UPDATE ${table}
    SET ${sets.join(", ")}, updated_at = now()
    WHERE ${idCol} = $${p}
    RETURNING ${idCol}
    `,
    values
  );
  const row = rowsOf(r)[0] ?? null;
  if (!row) return { ok: false as const, error: "No encontrado", status: 404 };
  return { ok: true as const, id: Number(row[idCol]) };
}

export async function removeCatalog(kind: CatalogKind, id: number) {
  const { table, idCol } = CONFIG[kind];
  const sql = db();
  const r: any = await sql.query(
    `DELETE FROM ${table} WHERE ${idCol} = $1 RETURNING ${idCol}`,
    [id]
  );
  const row = rowsOf(r)[0] ?? null;
  if (!row) return { ok: false as const, error: "No encontrado", status: 404 };
  return { ok: true as const };
}
