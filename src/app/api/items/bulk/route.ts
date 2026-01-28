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

function assertCronAuth(req: NextRequest) {
  // Reusamos CRON_SECRET como “admin secret” simple.
  // Si querés, lo renombramos después a ADMIN_SECRET.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    const err: any = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

function normalizeUrl(u: string): string | null {
  const s = String(u ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

function normalizeUrlsFromText(raw: string): string[] {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function safeRollback(client: PoolClient, txOpen: boolean) {
  if (!txOpen) return;
  try {
    await client.query("rollback;");
  } catch {
    // ignore
  }
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  let client: PoolClient | null = null;
  let txOpen = false;

  try {
    assertCronAuth(req);

    const body = await req.json().catch(() => ({}));

    // Soportamos ambos formatos:
    // A) { proveedor_id, motor_id, urls: string[] }
    // B) { proveedor_id, motor_id, urls_text: string } (1 por línea)
    const proveedorId = Number(body?.proveedor_id);
    const motorId = Number(body?.motor_id ?? 1);

    const urls: string[] = Array.isArray(body?.urls)
      ? body.urls.map((u: any) => String(u))
      : normalizeUrlsFromText(String(body?.urls_text ?? ""));

    if (!Number.isFinite(proveedorId) || proveedorId <= 0) {
      return NextResponse.json({ ok: false, error: "proveedor_id inválido" }, { status: 400 });
    }
    if (!Number.isFinite(motorId) || motorId <= 0) {
      return NextResponse.json({ ok: false, error: "motor_id inválido" }, { status: 400 });
    }
    if (!urls.length) {
      return NextResponse.json({ ok: false, error: "Sin URLs" }, { status: 400 });
    }

    client = await pool.connect();
    await client.query("begin;");
    txOpen = true;

    let created_items = 0;
    let created_offers = 0;
    const results: any[] = [];

    for (const rawUrl of urls) {
      const url = normalizeUrl(rawUrl);
      if (!url) {
        results.push({ url: rawUrl, ok: false, error: "url inválida" });
        continue;
      }

      // 1) Crear item (una URL = un item)
      // OJO: usás app.item_seguimiento como “tabla de items”.
      const itemIns = await client.query<{
        item_id: string;
      }>(
        `
        insert into app.item_seguimiento
          (proveedor_id, motor_id, url_original, url_canonica, seleccionado, estado, created_at, updated_at)
        values
          ($1, $2, $3, $3, true, 'OK', now(), now())
        returning item_id::text;
        `,
        [proveedorId, motorId, url]
      );

      const itemId = Number(itemIns.rows?.[0]?.item_id);
      created_items++;

      // 2) Scrape presentaciones y precios
      const motorRes = await runMotorForPricesByPresentacion(BigInt(motorId), url);
      const sourceUrl = String(motorRes?.sourceUrl ?? url);
      const prices = Array.isArray(motorRes?.prices) ? motorRes.prices : [];

      if (!prices.length) {
        // Creamos el item igual, pero sin offers (queda para debug)
        results.push({ url, item_id: itemId, ok: false, error: "no_prices_by_presentacion" });
        continue;
      }

      // 3) Insertar offers (una por presentación)
      for (const p of prices) {
        const pres = Number(p?.presentacion);
        if (!Number.isFinite(pres)) continue;

        await client.query(
          `
          insert into app.offers
            (item_id, motor_id, url_original, url_canonica, presentacion, estado, created_at, updated_at)
          values
            ($1, $2, $3, $4, $5, 'OK', now(), now())
          on conflict do nothing;
          `,
          [itemId, motorId, url, sourceUrl, pres]
        );

        created_offers++;
      }

      results.push({ url, item_id: itemId, ok: true, offers: prices.length });
    }

    await client.query("commit;");
    txOpen = false;

    return NextResponse.json(
      {
        ok: true,
        created_items,
        created_offers,
        results,
        time_ms: Date.now() - started,
      },
      { status: 200 }
    );
  } catch (e: any) {
    if (client) await safeRollback(client, txOpen);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: Number(e?.statusCode ?? 500) }
    );
  } finally {
    try {
      client?.release();
    } catch {
      // ignore
    }
  }
}
