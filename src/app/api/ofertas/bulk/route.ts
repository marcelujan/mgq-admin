import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

type Price = { presentacion: number; priceArs: number };

function isNonEmptyString(x: any): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function normalizeUrl(raw: string): string {
  // mínima normalización: trim + sin fragment (#...)
  const u = raw.trim();
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString();
  } catch {
    return u; // si no parsea, que el validador lo agarre
  }
}

function canonicalize(raw: string): string {
  // canonicalización conservadora (podés sofisticarla después):
  // - trim
  // - quitar hash
  // - quitar trailing slash (excepto root)
  const n = normalizeUrl(raw);
  try {
    const url = new URL(n);
    url.hash = "";
    let s = url.toString();
    if (s.endsWith("/") && url.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    // si no es URL válida, devolver raw (validación lo bloqueará)
    return raw.trim();
  }
}

function errJson(e: any) {
  return {
    message: String(e?.message ?? e ?? "unknown_error"),
    code: e?.code ? String(e.code) : null,
    detail: e?.detail ? String(e.detail) : null,
    hint: e?.hint ? String(e.hint) : null,
    where: e?.where ? String(e.where) : null,
  };
}

async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const proveedor_id = Number(body?.proveedor_id);
    const motor_id = Number(body?.motor_id);
    const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];

    if (!Number.isFinite(proveedor_id) || proveedor_id <= 0) {
      return NextResponse.json({ ok: false, error: "proveedor_id inválido" }, { status: 400 });
    }
    if (!Number.isFinite(motor_id) || motor_id <= 0) {
      return NextResponse.json({ ok: false, error: "motor_id inválido" }, { status: 400 });
    }
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ ok: false, error: "urls requerido (array)" }, { status: 400 });
    }

    const cleanUrls = urls
      .map((u) => (isNonEmptyString(u) ? u.trim() : ""))
      .filter(Boolean)
      .map((u) => normalizeUrl(u));

    if (cleanUrls.length === 0) {
      return NextResponse.json({ ok: false, error: "Pegá al menos 1 URL válida" }, { status: 400 });
    }

    // Validar que proveedor exista y esté activo (opcional pero recomendado)
    const provCheck = await withClient(async (client) => {
      const r = await client.query(
        `select proveedor_id, nombre, activo from app.proveedor where proveedor_id=$1 limit 1;`,
        [proveedor_id]
      );
      return r.rows?.[0] ?? null;
    });

    if (!provCheck) {
      return NextResponse.json({ ok: false, error: `proveedor_id ${proveedor_id} no existe` }, { status: 400 });
    }
    if (provCheck.activo === false) {
      return NextResponse.json({ ok: false, error: `proveedor_id ${proveedor_id} está inactivo` }, { status: 400 });
    }

    const results: any[] = [];

    let items_created = 0;
    let items_reused = 0;
    let offers_created = 0;
    let offers_upserted = 0;

    await withClient(async (client) => {
      // Transacción: si querés que una URL fallida no rompa las demás,
      // NO metas todo en 1 TX. Acá hacemos TX por URL (más tolerante).
      for (const url_original of cleanUrls) {
        const url_canonica = canonicalize(url_original);

        // validación URL
        let parsedOk = true;
        try {
          new URL(url_canonica);
        } catch {
          parsedOk = false;
        }
        if (!parsedOk) {
          results.push({
            url: url_original,
            status: "ERROR",
            error: "url inválida",
          });
          continue;
        }

        try {
          await client.query("begin;");

          // 1) buscar item existente por url_canonica
          const findItem = await client.query(
            `
            select item_id::bigint as item_id
            from app.item_seguimiento
            where url_canonica = $1
            limit 1;
            `,
            [url_canonica]
          );

          let item_id: number | null = null;

          if (findItem.rows?.[0]?.item_id) {
            item_id = Number(findItem.rows[0].item_id);
            items_reused++;
          } else {
            // 2) crear item
            const insItem = await client.query(
              `
              insert into app.item_seguimiento
                (proveedor_id, motor_id, url_original, url_canonica, seleccionado, estado)
              values
                ($1, $2, $3, $4, true, 'PENDING_SCRAPE')
              returning item_id::bigint as item_id;
              `,
              [proveedor_id, motor_id, url_original, url_canonica]
            );

            item_id = Number(insItem.rows?.[0]?.item_id ?? 0);
            if (!Number.isFinite(item_id) || item_id <= 0) {
              throw new Error("no se pudo crear item (item_id vacío)");
            }
            items_created++;
          }

          // 3) correr motor y obtener presentaciones reales
          const motorOut = await runMotorForPricesByPresentacion(BigInt(motor_id), url_original);

          const prices: Price[] = Array.isArray(motorOut?.prices) ? motorOut.prices : [];
          if (prices.length === 0) {
            throw new Error("motor no devolvió presentaciones/precios");
          }

          // 4) upsert offers por presentación
          //    - estado = 'OK' si se insertó correctamente
          //    - url_canonica se guarda para dedupe
          for (const p of prices) {
            const pres = Number(p.presentacion);
            if (!Number.isFinite(pres)) continue;

            // OJO: en app.offers no guardamos price. Solo definimos la oferta (url + presentación)
            // El precio diario lo guarda el cron en app.item_price_daily_pres.
            const up = await client.query(
              `
              insert into app.offers
                (item_id, motor_id, url_original, url_canonica, presentacion, estado)
              values
                ($1, $2, $3, $4, $5, 'OK')
              on conflict (item_id, url_canonica, presentacion)
              do update set
                motor_id = excluded.motor_id,
                url_original = excluded.url_original,
                estado = 'OK',
                updated_at = now()
              returning offer_id::bigint as offer_id, (xmax = 0) as inserted;
              `,
              [item_id, motor_id, url_original, url_canonica, pres]
            );

            const inserted = Boolean(up.rows?.[0]?.inserted);
            if (inserted) offers_created++;
            else offers_upserted++;
          }

          await client.query("commit;");

          results.push({
            url: url_original,
            status: "OK",
            item_id,
            presentaciones: prices.map((x) => x.presentacion).sort((a, b) => a - b),
          });
        } catch (e: any) {
          try {
            await client.query("rollback;");
          } catch {
            // ignore
          }
          results.push({
            url: url_original,
            status: "ERROR",
            error: String(e?.message ?? e),
            pg: e?.code ? errJson(e) : undefined,
          });
        }
      }
    });

    return NextResponse.json(
      {
        ok: true,
        proveedor_id,
        motor_id,
        items_created,
        items_reused,
        offers_created,
        offers_upserted,
        results,
      },
      { status: 200 }
    );
  } catch (e: any) {
    const info = errJson(e);
    return NextResponse.json({ ok: false, error: info.message, pg: info }, { status: 500 });
  }
}
