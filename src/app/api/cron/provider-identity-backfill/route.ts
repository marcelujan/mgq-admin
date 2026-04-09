import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool } from "pg";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";
import { inferProveedorAceptadoFromUrl } from "@/lib/proveedores-aceptados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HANDLER_VERSION = "provider-identity-backfill-2026-04-09";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

type Body = {
  limit?: number;
  dry_run?: boolean;
  item_ids?: number[];
};

type PendingRow = {
  item_id: number;
  motor_id: number;
  proveedor_nombre: string | null;
  url_original: string | null;
  url_canonica: string | null;
};

type BackfillResultRow = {
  item_id: number;
  motor_id: number;
  proveedor?: string | null;
  url: string;
  status: "OK" | "SKIP" | "ERROR";
  descripcion_fuente?: string | null;
  articulo_prov?: string | null;
  error?: string | null;
};

function assertCronAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    const err: any = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

function normalizeUrl(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) return `https://${s}`;
  return s;
}

function trimToNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : String(v ?? "").trim();
  return s ? s : null;
}

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(n)));
}

function parseItemIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => Math.trunc(v));
}

function extractIdentity(motor: any) {
  return {
    descripcion_fuente: trimToNull(motor?.title),
    articulo_prov: trimToNull(motor?.sku),
  };
}

async function selectPendingRows(itemIds: number[], limit: number): Promise<PendingRow[]> {
  if (itemIds.length > 0) {
    const res = await pool.query<PendingRow>(
      `
      select
        i.item_id,
        i.motor_id,
        pr.nombre as proveedor_nombre,
        i.url_original,
        i.url_canonica
      from app.item_seguimiento i
      left join app.proveedor pr on pr.proveedor_id = i.proveedor_id
      where i.item_id = any($1::int[])
        and i.motor_id in (1, 2)
        and coalesce(nullif(trim(i.descripcion_fuente), ''), '') = ''
        and coalesce(nullif(trim(i.url_canonica), ''), nullif(trim(i.url_original), ''), '') <> ''
      order by i.item_id asc
      limit $2
      `,
      [itemIds, limit]
    );
    return res.rows;
  }

  const res = await pool.query<PendingRow>(
    `
    select
      i.item_id,
      i.motor_id,
      pr.nombre as proveedor_nombre,
      i.url_original,
      i.url_canonica
    from app.item_seguimiento i
    left join app.proveedor pr on pr.proveedor_id = i.proveedor_id
    where i.motor_id in (1, 2)
      and coalesce(nullif(trim(i.descripcion_fuente), ''), '') = ''
      and coalesce(nullif(trim(i.url_canonica), ''), nullif(trim(i.url_original), ''), '') <> ''
    order by i.item_id asc
    limit $1
    `,
    [limit]
  );
  return res.rows;
}

async function countPendingRows(itemIds: number[]): Promise<number> {
  if (itemIds.length > 0) {
    const res = await pool.query<{ n: string }>(
      `
      select count(*)::text as n
      from app.item_seguimiento i
      where i.item_id = any($1::int[])
        and i.motor_id in (1, 2)
        and coalesce(nullif(trim(i.descripcion_fuente), ''), '') = ''
        and coalesce(nullif(trim(i.url_canonica), ''), nullif(trim(i.url_original), ''), '') <> ''
      `,
      [itemIds]
    );
    return Number(res.rows?.[0]?.n ?? 0);
  }

  const res = await pool.query<{ n: string }>(
    `
    select count(*)::text as n
    from app.item_seguimiento i
    where i.motor_id in (1, 2)
      and coalesce(nullif(trim(i.descripcion_fuente), ''), '') = ''
      and coalesce(nullif(trim(i.url_canonica), ''), nullif(trim(i.url_original), ''), '') <> ''
    `
  );
  return Number(res.rows?.[0]?.n ?? 0);
}

async function updateIdentity(args: {
  item_id: number;
  source_url: string | null;
  descripcion_fuente: string | null;
  articulo_prov: string | null;
}) {
  await pool.query(
    `
    update app.item_seguimiento
    set
      url_canonica = coalesce($2, url_canonica),
      descripcion_fuente = coalesce($3, descripcion_fuente),
      articulo_prov = coalesce($4, articulo_prov),
      updated_at = now()
    where item_id = $1
    `,
    [args.item_id, args.source_url, args.descripcion_fuente, args.articulo_prov]
  );
}

export async function POST(req: NextRequest) {
  try {
    assertCronAuth(req);

    const body = (await req.json().catch(() => ({}))) as Body;
    const limit = parseLimit(body?.limit);
    const dry_run = Boolean(body?.dry_run);
    const item_ids = parseItemIds(body?.item_ids);

    const pending_before = await countPendingRows(item_ids);
    const rows = await selectPendingRows(item_ids, limit);

    let updated_ok = 0;
    let skipped = 0;
    let failed = 0;

    const results: BackfillResultRow[] = [];

    for (const row of rows) {
      const rawUrl = normalizeUrl(row.url_canonica || row.url_original || "");
      if (!rawUrl) {
        skipped += 1;
        results.push({
          item_id: row.item_id,
          motor_id: row.motor_id,
          proveedor: row.proveedor_nombre,
          url: "",
          status: "SKIP",
          error: "missing_url",
        });
        continue;
      }

      const inferred = inferProveedorAceptadoFromUrl(rawUrl);
      if (!inferred) {
        skipped += 1;
        results.push({
          item_id: row.item_id,
          motor_id: row.motor_id,
          proveedor: row.proveedor_nombre,
          url: rawUrl,
          status: "SKIP",
          error: "proveedor_no_aceptado_o_no_reconocido_por_url",
        });
        continue;
      }

      try {
        const motor = await runMotorForPricesByPresentacion(BigInt(row.motor_id), rawUrl, { timeoutMs: 15_000 });
        const identity = extractIdentity(motor);
        const source_url = trimToNull(motor?.sourceUrl) || rawUrl;

        if (!identity.descripcion_fuente) {
          skipped += 1;
          results.push({
            item_id: row.item_id,
            motor_id: row.motor_id,
            proveedor: row.proveedor_nombre,
            url: source_url,
            status: "SKIP",
            descripcion_fuente: identity.descripcion_fuente,
            articulo_prov: identity.articulo_prov,
            error: "descripcion_fuente_not_found",
          });
          continue;
        }

        if (!dry_run) {
          await updateIdentity({
            item_id: row.item_id,
            source_url,
            descripcion_fuente: identity.descripcion_fuente,
            articulo_prov: identity.articulo_prov,
          });
        }

        updated_ok += 1;
        results.push({
          item_id: row.item_id,
          motor_id: row.motor_id,
          proveedor: row.proveedor_nombre,
          url: source_url,
          status: "OK",
          descripcion_fuente: identity.descripcion_fuente,
          articulo_prov: identity.articulo_prov,
          error: null,
        });
      } catch (e: any) {
        failed += 1;
        results.push({
          item_id: row.item_id,
          motor_id: row.motor_id,
          proveedor: row.proveedor_nombre,
          url: rawUrl,
          status: "ERROR",
          error: String(e?.message ?? e ?? "backfill_error"),
        });
      }
    }

    const pending_remaining = await countPendingRows(item_ids);

    return NextResponse.json({
      ok: true,
      handler_version: HANDLER_VERSION,
      dry_run,
      limit,
      item_ids: item_ids.length > 0 ? item_ids : null,
      pending_before,
      claimed_total: rows.length,
      updated_ok,
      skipped,
      failed,
      pending_remaining,
      should_continue: pending_remaining > 0 && rows.length > 0 && item_ids.length === 0,
      results,
    });
  } catch (e: any) {
    const status = Number(e?.statusCode ?? 500);
    return NextResponse.json(
      {
        ok: false,
        handler_version: HANDLER_VERSION,
        error: String(e?.message ?? e ?? "provider_identity_backfill_error"),
      },
      { status: Number.isFinite(status) && status > 0 ? status : 500 }
    );
  }
}
