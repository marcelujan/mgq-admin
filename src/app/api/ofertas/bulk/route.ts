import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";
import { inferProveedorAceptadoFromUrl } from "@/lib/proveedores-aceptados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED!,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

type BulkBody = {
  urls?: string[] | string;
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
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

async function ensureProveedor(client: PoolClient, codigo: string, nombre: string, motorId: number): Promise<number> {
  const q = async <T = any>(text: string, values?: any[]) => {
    return (client as any).query({ text, values, queryMode: "simple" }) as Promise<{ rows: T[]; rowCount: number }>;
  };

  const found = await q<{ proveedor_id: number }>(
    `select proveedor_id from app.proveedor where upper(coalesce(codigo, '')) = upper($1) or upper(nombre) = upper($2) limit 1;`,
    [codigo, nombre]
  );

  if (found.rows?.length) {
    const proveedorId = Number(found.rows[0].proveedor_id);
    await q(
      `update app.proveedor
         set nombre = $2,
             codigo = $3,
             activo = true
       where proveedor_id = $1;`,
      [proveedorId, nombre, codigo]
    );
    return proveedorId;
  }

  const inserted = await q<{ proveedor_id: number }>(
    `insert into app.proveedor (nombre, codigo, activo)
     values ($1, $2, true)
     returning proveedor_id;`,
    [nombre, codigo]
  );

  const proveedorId = Number(inserted.rows?.[0]?.proveedor_id ?? 0);
  if (!Number.isFinite(proveedorId) || proveedorId <= 0) {
    throw new Error(`provider_insert_failed:${codigo}`);
  }
  return proveedorId;
}

async function ensureMotorProveedor(client: PoolClient, motorId: number, nombre: string): Promise<number> {
  const q = async <T = any>(text: string, values?: any[]) => {
    return (client as any).query({ text, values, queryMode: "simple" }) as Promise<{ rows: T[]; rowCount: number }>;
  };

  const found = await q<{ motor_id: number }>(
    `select motor_id from app.motor_proveedor where motor_id = $1 limit 1;`,
    [motorId]
  );

  if (found.rows?.length) {
    await q(
      `update app.motor_proveedor
          set motor_nombre = $2,
              activo = true,
              updated_at = now()
        where motor_id = $1;`,
      [motorId, nombre]
    );
    return motorId;
  }

  const inserted = await q<{ motor_id: number }>(
    `insert into app.motor_proveedor (motor_id, motor_nombre, motor_version, activo, created_at, updated_at)
     values ($1, $2, '1', true, now(), now())
     returning motor_id;`,
    [motorId, nombre]
  );

  const ensuredId = Number(inserted.rows?.[0]?.motor_id ?? 0);
  if (!Number.isFinite(ensuredId) || ensuredId <= 0) {
    throw new Error(`motor_insert_failed:${motorId}`);
  }
  return ensuredId;
}

export async function POST(req: NextRequest) {
  let client: PoolClient | null = null;

  try {
    const body = (await req.json()) as BulkBody;
    const urls = splitAndCleanUrls(body?.urls);

    if (urls.length === 0) {
      return NextResponse.json({ ok: false, error: "Pegá al menos 1 URL válida" }, { status: 400 });
    }

    client = await pool.connect();

    const q = async <T = any>(text: string, values?: any[]) => {
      return (client as any).query({ text, values, queryMode: "simple" }) as Promise<{
        rows: T[];
        rowCount: number;
      }>;
    };

    await q("begin;");

    const todayRes = await q<{ d: string }>(`select current_date::text as d;`);
    const asOfDate = String(todayRes.rows?.[0]?.d ?? "").trim();
    if (!asOfDate) throw new Error("bulk_create_missing_current_date");

    let items_created = 0;
    let offers_created = 0;
    let prices_seeded_today = 0;

    const results: Array<{
      url: string;
      status: "OK" | "ERROR";
      proveedor?: string;
      item_id?: number;
      offers_inserted?: number;
      prices_seeded_today?: number;
      presentaciones?: Array<{ presentacion: number; priceArs: number }>;
      error?: string;
    }> = [];

    for (const url of urls) {
      const providerSpec = inferProveedorAceptadoFromUrl(url);
      if (!providerSpec) {
        results.push({ url, status: "ERROR", error: "proveedor_no_aceptado_o_no_reconocido_por_url" });
        continue;
      }

      const proveedor_id = await ensureProveedor(client, providerSpec.codigo, providerSpec.nombre, providerSpec.motorId);
      const motor_id = await ensureMotorProveedor(client, providerSpec.motorId, providerSpec.nombre);

      let motor;
      try {
        motor = await runMotorForPricesByPresentacion(BigInt(motor_id), url);
      } catch (e: any) {
        results.push({ url, proveedor: providerSpec.nombre, status: "ERROR", error: String(e?.message ?? e ?? "motor_error") });
        continue;
      }

      const sourceUrl = normalizeUrl(String((motor as any)?.sourceUrl ?? url));
      const prices = Array.isArray((motor as any)?.prices) ? (motor as any).prices : [];

      if (prices.length === 0) {
        results.push({ url, proveedor: providerSpec.nombre, status: "ERROR", error: "no_prices_returned_by_motor" });
        continue;
      }

      const existing = await q<{ item_id: number }>(
        `select item_id from app.item_seguimiento where url_canonica = $1 limit 1;`,
        [sourceUrl]
      );

      let item_id: number;
      if ((existing.rows?.length ?? 0) > 0) {
        item_id = Number(existing.rows[0].item_id);
        await q(
          `update app.item_seguimiento
              set proveedor_id = $2,
                  motor_id = $3,
                  url_original = $4,
                  url_canonica = $5,
                  updated_at = now()
            where item_id = $1;`,
          [item_id, proveedor_id, motor_id, url, sourceUrl]
        );
      } else {
        const insItem = await q<{ item_id: number }>(
          `insert into app.item_seguimiento
             (proveedor_id, motor_id, url_original, url_canonica, seleccionado, estado, created_at, updated_at)
           values
             ($1, $2, $3, $4, true, 'OK', now(), now())
           returning item_id;`,
          [proveedor_id, motor_id, url, sourceUrl]
        );
        item_id = Number(insItem.rows?.[0]?.item_id ?? 0);
        if (!Number.isFinite(item_id) || item_id <= 0) {
          results.push({ url, proveedor: providerSpec.nombre, status: "ERROR", error: "item_insert_failed_no_item_id" });
          continue;
        }
        items_created += 1;
      }

      const validPrices = prices
        .map((p: any) => ({
          presentacion: Number(p?.presentacion),
          priceArs: Number(p?.priceArs),
        }))
        .filter((p: { presentacion: number; priceArs: number }) => Number.isFinite(p.presentacion) && Number.isFinite(p.priceArs) && p.priceArs > 0);

      let insertedForThisUrl = 0;
      for (const p of validPrices) {
        const insOffer = await q(
          `insert into app.offers
             (item_id, motor_id, url_original, url_canonica, presentacion, estado, created_at, updated_at)
           values
             ($1, $2, $3, $4, $5, 'OK', now(), now())
           on conflict do nothing;`,
          [item_id, motor_id, url, sourceUrl, p.presentacion]
        );
        insertedForThisUrl += insOffer.rowCount ?? 0;
      }

      let seededForThisUrl = 0;
      for (const p of validPrices) {
        await q(
          `insert into app.item_price_daily_pres
             (item_id, as_of_date, presentacion, price_ars, source_url, scrape_run_id)
           values
             ($1, $2::date, $3, $4, $5, null)
           on conflict (item_id, as_of_date, presentacion)
           do update set
             price_ars = excluded.price_ars,
             source_url = excluded.source_url,
             scrape_run_id = excluded.scrape_run_id;`,
          [item_id, asOfDate, p.presentacion, p.priceArs, sourceUrl]
        );
        seededForThisUrl += 1;
      }

      offers_created += insertedForThisUrl;
      prices_seeded_today += seededForThisUrl;
      results.push({
        url,
        proveedor: providerSpec.nombre,
        status: "OK",
        item_id,
        offers_inserted: insertedForThisUrl,
        prices_seeded_today: seededForThisUrl,
        presentaciones: validPrices.map((x: any) => ({ presentacion: Number(x.presentacion), priceArs: Number(x.priceArs) })),
      });
    }

    await q("commit;");

    return NextResponse.json({ ok: true, items_created, offers_created, prices_seeded_today, as_of_date: asOfDate, results });
  } catch (e: any) {
    if (client) {
      try {
        await (client as any).query({ text: "rollback;", queryMode: "simple" });
      } catch {}
    }
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "bulk_error") }, { status: 500 });
  } finally {
    client?.release();
  }
}
