import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

function assertAdminAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function normalizeUrl(u: unknown): string | null {
  const s = String(u ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

function normalizeUrlsFromText(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function safeRollback(client: PoolClient, txOpen: boolean) {
  if (!txOpen) return;
  try {
    // simple protocol para evitar prepared statements
    await (client as any).query({ text: "rollback;", queryMode: "simple" });
  } catch {
    // ignore
  }
}

type MotorPrice = { presentacion: number; price: number };
type MotorResult = { sourceUrl?: string; prices?: MotorPrice[] };

export async function POST(req: NextRequest) {
  const started = Date.now();
  let client: PoolClient | null = null;
  let txOpen = false;

  try {
    const authResp = assertAdminAuth(req);
    if (authResp) return authResp;

    const body = await req.json().catch(() => ({} as any));

    const proveedorId = Number(body?.proveedor_id);
    const motorId = Number(body?.motor_id ?? 1);

    const urls: string[] = Array.isArray(body?.urls)
      ? body.urls.map((u: any) => String(u))
      : normalizeUrlsFromText(body?.urls_text);

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

    // Helper de queries en simple protocol (evita prepared statements con pooler)
    const q = async <T = any>(text: string, values?: any[]) => {
      return (client as any).query({ text, values, queryMode: "simple" }) as Promise<{
        rows: T[];
        rowCount: number;
      }>;
    };

    await q("begin;");
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

      // 1) Crear item
      const itemIns = await q<{ item_id: string }>(
        `
        insert into app.item_seguimiento
          (proveedor_id, motor_id, url_original, url_canonica, seleccionado, estado, created_at, updated_at)
        values
          ($1, $2, $3, $3, true, 'OK', now(), now())
        returning item_id::text as item_id;
        `,
        [proveedorId, motorId, url]
      );

      const itemId = Number(itemIns.rows?.[0]?.item_id);
      created_items++;

      // 2) Scrape presentaciones y precios
      const motorRes = (await runMotorForPricesByPresentacion(
        BigInt(motorId),
        url
      )) as unknown as MotorResult;

      const sourceUrl = String(motorRes?.sourceUrl ?? url);
      const prices = Array.isArray(motorRes?.prices) ? motorRes.prices : [];

      if (!prices.length) {
        results.push({ url, item_id: itemId, ok: false, error: "no_prices_by_presentacion" });
        continue;
      }

      // 3) Insertar offers
      let offersForUrl = 0;

      for (const p of prices) {
        const pres = Number((p as any)?.presentacion);
        if (!Number.isFinite(pres)) continue;

        await q(
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
        offersForUrl++;
      }

      results.push({ url, item_id: itemId, ok: true, offers: offersForUrl });
    }

    await q("commit;");
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
