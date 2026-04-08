import { NextResponse } from "next/server";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";
import { inferProveedorAceptadoFromUrl } from "@/lib/proveedores-aceptados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewRow = {
  url: string;
  status: "OK" | "WARNING" | "ERROR";
  proveedor?: string | null;
  motor_id?: number | null;
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const urls =
      splitAndNormalizeUrls(body?.urls).length > 0
        ? splitAndNormalizeUrls(body?.urls)
        : splitAndNormalizeUrls(body?.url);

    if (urls.length === 0) {
      return NextResponse.json({ ok: false, error: "urls requerida (array) o url requerida" }, { status: 400 });
    }

    const previews: PreviewRow[] = [];

    for (const url of urls) {
      const proveedor = inferProveedorAceptadoFromUrl(url);
      if (!proveedor) {
        previews.push({
          url,
          status: "ERROR",
          proveedor: null,
          motor_id: null,
          title: null,
          sku: null,
          prices: [],
          warnings: [],
          errors: ["proveedor_no_aceptado_o_no_reconocido_por_url"],
        });
        continue;
      }

      try {
        const r = await runMotorForPricesByPresentacion(BigInt(proveedor.motorId), url);
        previews.push({
          url,
          proveedor: proveedor.nombre,
          motor_id: proveedor.motorId,
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
          proveedor: proveedor.nombre,
          motor_id: proveedor.motorId,
          status: "ERROR",
          title: null,
          sku: null,
          prices: [],
          warnings: [],
          errors: [String(e?.message ?? e)],
        });
      }
    }

    return NextResponse.json({ ok: true, previews }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
