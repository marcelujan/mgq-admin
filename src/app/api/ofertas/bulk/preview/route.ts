import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewRow = {
  url: string;
  status: "OK" | "WARNING" | "ERROR";
  title?: string | null;
  sku?: string | null;
  prices?: Array<{ presentacion: number; priceArs: number }>;
  warnings?: string[];
  errors?: string[];
};

function splitAndNormalizeUrls(urls: unknown): string[] {
  if (Array.isArray(urls)) {
    return urls.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof urls === "string") {
    return urls
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

async function resolveMotorId(sql: any, body: any): Promise<number> {
  // Prioridad:
  // 1) motor_id explícito
  // 2) proveedor_id -> proveedor.motor_id_default
  // 3) proveedor_codigo -> proveedor.motor_id_default
  const motorIdRaw = body?.motor_id ?? body?.motorId;
  if (motorIdRaw !== undefined && motorIdRaw !== null && String(motorIdRaw).trim() !== "") {
    const n = Number(motorIdRaw);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const proveedorIdRaw = body?.proveedor_id ?? body?.proveedorId;
  if (proveedorIdRaw !== undefined && proveedorIdRaw !== null && String(proveedorIdRaw).trim() !== "") {
    const proveedorId = Number(proveedorIdRaw);
    const r = await sql.query(
      `select motor_id_default from app.proveedor where proveedor_id = $1 limit 1;`,
      [proveedorId]
    );
    const mid = Number(r?.rows?.[0]?.motor_id_default ?? 0);
    if (Number.isFinite(mid) && mid > 0) return mid;
    throw new Error(`proveedor_id=${proveedorId} sin motor_id_default`);
  }

  const proveedorCodigoRaw = body?.proveedor_codigo ?? body?.proveedorCodigo;
  if (typeof proveedorCodigoRaw === "string" && proveedorCodigoRaw.trim()) {
    const codigo = proveedorCodigoRaw.trim();
    const r = await sql.query(
      `select motor_id_default from app.proveedor where codigo = $1 limit 1;`,
      [codigo]
    );
    const mid = Number(r?.rows?.[0]?.motor_id_default ?? 0);
    if (Number.isFinite(mid) && mid > 0) return mid;
    throw new Error(`proveedor_codigo=${codigo} sin motor_id_default`);
  }

  throw new Error("motor_id requerido (o proveedor_id/proveedor_codigo con motor_id_default)");
}

export async function POST(req: Request) {
  try {
    const sql = db();
    const body = await req.json().catch(() => ({}));

    // Acepta urls[] o url (fallback legacy)
    const urls =
      splitAndNormalizeUrls(body?.urls).length > 0
        ? splitAndNormalizeUrls(body?.urls)
        : splitAndNormalizeUrls(body?.url);

    if (urls.length === 0) {
      return NextResponse.json({ ok: false, error: "urls requerida (array) o url requerida" }, { status: 400 });
    }

    const motorId = await resolveMotorId(sql, body);

    const previews: PreviewRow[] = [];

    for (const url of urls) {
      try {
        const r = await runMotorForPricesByPresentacion(BigInt(motorId), url);

        previews.push({
          url,
          status: "OK",
          title: (r as any)?.title ?? null,
          sku: (r as any)?.sku ?? null,
          prices: Array.isArray((r as any)?.prices) ? (r as any).prices : [],
          warnings: Array.isArray((r as any)?.warnings) ? (r as any).warnings : [],
          errors: [],
        });
      } catch (e: any) {
        previews.push({
          url,
          status: "ERROR",
          title: null,
          sku: null,
          prices: [],
          warnings: [],
          errors: [String(e?.message ?? e)],
        });
      }
    }

    return NextResponse.json({ ok: true, motor_id: motorId, previews }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
