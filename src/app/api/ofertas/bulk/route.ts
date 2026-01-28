// mgq-admin/src/app/api/ofertas/bulk/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED!, // conexión directa
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

async function dbDebugInfo(client: PoolClient) {
  const r = await (client as any).query({
    text: `
      select
        current_database()::text as db,
        current_schema()::text as schema,
        now()::text as now,
        (select count(*)::int from app.proveedor) as proveedores;
    `,
    queryMode: "simple",
  });
  return r.rows?.[0] ?? null;
}

/**
 * Crea:
 *  - 1 fila en app.item_seguimiento por URL (si no existe)
 *  - N filas en app.offers (una por presentación encontrada por el motor)
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

    // Helper: SIEMPRE simple protocol (evita prepared statements / PgBouncer issues)
    const q = async <T = any>(text: string, values?: any[]) => {
      return (client as any).query({ text, values, queryMode: "simple" }) as Promise<{
        rows: T[];
        rowCount: number;
      }>;
    };

    // Opcional para debug (no imprime password):
    // console.log("DB_UNPOOLED host:", new URL(process.env.DATABASE_URL_UNPOOLED!).host);

    const dbg = await dbDebugInfo(client);

    // 1) Validar proveedor y obtener motor default
    const provR = await q<{
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
        { ok: false, error: `proveedor_id inexistente: ${proveedor_id}`, debug: dbg },
        { status: 400 }
      );
    }
    if (prov.activo === false) {
      return NextResponse.json(
        { ok: false, error: `proveedor_id inactivo: ${proveedor_id}`, debug: dbg },
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

    await q("begin;");

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
        results.push({ url, status: "ERROR", error: String(e?.message ?? e ?? "motor_error") });
        continue;
      }

      const sourceUrl = normalizeUrl(String((motor as any)?.sourceUrl ?? url));
      const prices = Array.isArray((motor as any)?.prices) ? (motor as any).prices : [];

      if (prices.length === 0) {
        results.push({ url, status: "ERROR", error: "no_prices_returned_by_motor" });
        continue;
      }

      // B) Crear/obtener item por url_canonica
      const existing = await q<{ item_id: number }>(
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

        // Mantener coherencia si ya existía
        await q(
          `
          update app.item_seguimiento
          set
            proveedor_id = $2,
            motor_id = $3,
            url_original = $4,
            url_canonica = $5,
            updated_at = now()
          where item_id = $1;
          `,
          [item_id, proveedor_id, motor_id, url, sourceUrl]
        );
      } else {
        const insItem = await q<{ item_id: number }>(
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

      // C) Insertar offers
      let insertedForThisUrl = 0;

      for (const p of prices) {
        const presentacion = Number((p as any)?.presentacion);
        const priceArs = Number((p as any)?.priceArs);

        if (!Number.isFinite(presentacion)) continue;
        if (!Number.isFinite(priceArs) || priceArs <= 0) continue;

        const insOffer = await q(
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
        presentaciones: prices.map((x: any) => ({
          presentacion: Number(x.presentacion),
          priceArs: Number(x.priceArs),
        })),
      });
    }

    await q("commit;");

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
      if (client) await (client as any).query({ text: "rollback;", queryMode: "simple" });
    } catch {
      // ignore
    }

    return NextResponse.json(
      {
        ok: false,
        error: String(e?.message ?? e ?? "unknown_error"),
        pg: e?.code
          ? { code: String(e.code), detail: e?.detail ?? null, hint: e?.hint ?? null, where: e?.where ?? null }
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
