import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { fetchBnaUsdVenta, upsertFxForCurrentDatePg } from "@/lib/fx-bna";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

function assertCronAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    const err: any = new Error("unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

async function run(dryRun: boolean) {
  const started = Date.now();
  const client = await pool.connect();
  try {
    const bna = await fetchBnaUsdVenta();
    const d0 = await client.query(`select current_date::text as d;`);
    const currentDate = String(d0.rows?.[0]?.d ?? "");

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        current_date: currentDate,
        source_url: bna.source_url,
        page_date: bna.page_date,
        hora_actualizacion: bna.hora_actualizacion,
        compra: bna.compra,
        venta: bna.venta,
        time_ms: Date.now() - started,
      };
    }

    const upsert = await upsertFxForCurrentDatePg(client, bna.venta);
    return {
      ok: true,
      dry_run: false,
      current_date: currentDate,
      source_url: bna.source_url,
      page_date: bna.page_date,
      hora_actualizacion: bna.hora_actualizacion,
      compra: bna.compra,
      venta: bna.venta,
      upsert,
      time_ms: Date.now() - started,
    };
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCronAuth(req);
    const dryRun = ["1", "true", "yes"].includes(String(new URL(req.url).searchParams.get("dry_run") ?? "").toLowerCase());
    const payload = await run(dryRun);
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: e?.statusCode ?? 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
