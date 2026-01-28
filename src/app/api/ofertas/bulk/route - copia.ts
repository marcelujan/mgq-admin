// mgq-admin/src/app/api/ofertas/bulk/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED!,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

type BulkBody = {
  proveedor_id?: number;
  motor_id?: number; // opcional: si no viene, usamos proveedor.motor_id_default
  urls?: string[] | string;
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function toInt(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeUrl(u: string): string {
  const s = u.trim();
  if (!s) return s;
  // si el usuario pega sin esquema
  if (!/^https?:\/\//i.test(s)) return `https://${s}`;
  return s;
}

function splitAndCleanUrls(urls: BulkBody["urls"]): string[] {
  if (Array.isArray(urls)) {
    return urls
      .map((u) => (isNonEmptyString(u) ? u.trim() : ""))
      .filter(Boolean)
      .map(normalizeUrl);
  }

  if (isNonEmptyString(urls)) {
    return urls
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean)
      .map(normalizeUrl);
  }

  return [];
}

async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function dbDebugInfo(client: PoolClient) {
  // ayuda a detectar “estoy pegándole a otra DB/branch”
  const r = await client.query<{
    db: string;
    schema: string;
    now: string;
    proveedores: number;
  }>(
    `
    select
      current_database()::text as db,
      current_schema()::text as schema,
      now()::text as now,
      (select count(*)::int from app.proveedor) as proveedores;
    `
  );
  return r.rows?.[0] ?? null;
}

/**
 * Crea:
 *  - 1 fila en app.item_seguimiento por URL (si no existe)
 *  - N filas en app.offers (una por presentación encontrada por el motor)
 *
 * Importante:
 *  - app.offers NO TIENE proveedor_id: se deriva del item (item_seguimiento)
 *  - No se elige presentación a mano: se guardan todas las que devuelve el motor
 */
export async function POST(req: NextRequest) {
  let client: PoolClient | null = null;

  try {
    const body = (await req.json()) as BulkBody;

    const proveedor_id = toInt(body?.proveedor_id);
    const motor_id_input = toInt(body?.motor_id);
    const urls = splitAndCleanUrls(body?.urls);

    if (!proveedor_id) {
      return NextResponse.json({ ok: false, error: "proveedor_id requerido" }, { status: 400 });
    }
    if (urls.length === 0) {
      return NextResponse.json({ ok: false, error: "Pegá al menos 1 URL válida" }, { status: 400 });
    }

    client = await pool.connect();

    // 0) Debug de DB para detectar desalineación de branch/env
    const dbg = await dbDebugInfo(client);

    // 1) Validar proveedor (existe + activo) y obtener motor default
    const provR = await client.query<{
      proveedor_id: number;
      nombre: string;
      activo: boolean;
      motor_id_default: number | null;
    }>(
      `
      select proveedor_id, nombre, activo, motor_id_default
      from app.proveedor
      where proveedor_id = $1
      limit 1;
      `,
      [proveedor_id]
    );

    const prov = provR.rows?.[0] ?? null;
    if (!prov) {
      return NextResponse.json(
        {
          ok: false,
          error: `proveedor_id inexistente: ${proveedor_id}`,
          debug: dbg,
        },
        { status: 400 }
      );
    }
    if (prov.activo === false) {
      return NextResponse.json(
        {
          ok: false,
          error: `proveedor_id inactivo: ${proveedor_id}`,
          debug: dbg,
        },
        { status: 400 }
      );
    }

    const motor_id = motor_id_input ?? (prov.motor_id_default ? Number(prov.motor_id_default) : null);
    if (!motor_id) {
      return NextResponse.json(
        {
          ok: false,
          error: `motor_id requerido (y proveedor ${proveedor_id} no tiene motor_id_default)`,
          debug: dbg,
        },
        { status: 400 }
      );
    }

    // 2) Transacción: o entra todo lo que pueda, o se revierte (si preferís “parcial”, lo cambiamos)
    await client.query("begin;");

    let items_created = 0;
    let offers_created = 0;

    const results: Array<{
      url: string;
      status: "OK" | "ERROR";
      item_id?: number;
      offers_inserted?: number;
      presentaciones?: Array<{ presentacion: number; priceArs: number }>;
      error?: string;
    }> = [];

    for (const url of urls) {
      // A) Motor: extraer presentaciones reales
      let motor;
      try {
        motor = await runMotorForPricesByPresentacion(BigInt(motor_id), url);
      } catch (e: any) {
        results.push({
          url,
          status: "ERROR",
          error: String(e?.message ?? e ?? "motor_error"),
        });
        continue;
      }

      const sourceUrl = normalizeUrl(String(motor?.sourceUrl ?? url));
      const prices = Array.isArray(motor?.prices) ? motor.prices : [];

      if (prices.length === 0) {
        results.push({ url, status: "ERROR", error: "no_prices_returned_by_motor" });
        continue;
      }

      // B) Crear/obtener item por url_canonica
      //    (si tu esquema no tiene unicidad por url_canonica, esto igual funciona por SELECT+INSERT)
      const existing = await client.query<{ item_id: number }>(
        `
        select item_id
        from app.item_seguimiento
        where url_canonica = $1
        limit 1;
        `,
        [sourceUrl]
      );

      let item_id: number;

      if ((existing.rows?.length ?? 0) > 0) {
        item_id = Number(existing.rows[0].item_id);

        // opcional: mantener proveedor/motor coherentes si ya existía
        await client.query(
          `
          update app.item_seguimiento
          set
            proveedor_id = $2,
            motor_id = $3,
            url_original = $4,
            updated_at = now()
          where item_id = $1;
          `,
          [item_id, proveedor_id, motor_id, url, sourceUrl]
        );
      } else {
        const insItem = await client.query<{ item_id: number }>(
          `
          insert into app.item_seguimiento
            (proveedor_id, motor_id, url_original, url_canonica, seleccionado, estado, created_at, updated_at)
          values
            ($1, $2, $3, $4, true, 'OK', now(), now())
          returning item_id;
          `,
          [proveedor_id, motor_id, url, sourceUrl]
        );

        item_id = Number(insItem.rows?.[0]?.item_id);
        if (!Number.isFinite(item_id) || item_id <= 0) {
          results.push({ url, status: "ERROR", error: "item_insert_failed_no_item_id" });
          continue;
        }
        items_created += 1;
      }

      // C) Insertar offers: 1 por presentación encontrada
      let insertedForThisUrl = 0;

      for (const p of prices) {
        const presentacion = Number((p as any)?.presentacion);
        const priceArs = Number((p as any)?.priceArs);

        if (!Number.isFinite(presentacion)) continue;
        if (!Number.isFinite(priceArs) || priceArs <= 0) continue;

        // app.offers NO tiene proveedor_id.
        // Guardamos motor_id + urls + presentacion.
        const insOffer = await client.query(
          `
          insert into app.offers
            (item_id, motor_id, url_original, url_canonica, presentacion, estado, created_at, updated_at)
          values
            ($1, $2, $3, $4, $5, 'OK', now(), now())
          on conflict do nothing;
          `,
          [item_id, motor_id, url, sourceUrl, presentacion]
        );

        insertedForThisUrl += insOffer.rowCount ?? 0;
      }

      offers_created += insertedForThisUrl;

      results.push({
        url,
        status: "OK",
        item_id,
        offers_inserted: insertedForThisUrl,
        presentaciones: prices.map((x) => ({
          presentacion: Number((x as any).presentacion),
          priceArs: Number((x as any).priceArs),
        })),
      });
    }

    await client.query("commit;");

    return NextResponse.json({
      ok: true,
      proveedor_id,
      proveedor_nombre: prov.nombre,
      motor_id,
      items_created,
      offers_created,
      results,
      debug: dbg,
    });
  } catch (e: any) {
    try {
      if (client) await client.query("rollback;");
    } catch {
      // ignore
    }

    return NextResponse.json(
      {
        ok: false,
        error: String(e?.message ?? e ?? "unknown_error"),
        pg: e?.code
          ? {
              code: String(e.code),
              detail: e?.detail ?? null,
              hint: e?.hint ?? null,
              where: e?.where ?? null,
            }
          : null,
      },
      { status: 500 }
    );
  } finally {
    try {
      client?.release();
    } catch {
      // ignore
    }
  }
}
