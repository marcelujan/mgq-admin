import { db } from "@/lib/db";

export type EumaParsedProduct = {
  sourceUrl: string;
  title: string;
  sku: string;
  description: string;
  presentacionMl: number;
  precioUsd: number;
};

function decodeHtmlEntities(s: string): string {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(s: string): string {
  return decodeHtmlEntities(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseDecimal(raw: string): number | null {
  const cleaned = String(raw ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function canonicalizeEumaUrl(url: string, productId?: string | null): string {
  const pid = productId ?? extractEumaProductId(url);
  if (!pid) return url;
  return `https://www.euma.com.ar/catalog/product_info.php?products_id=${pid}`;
}

export function extractEumaProductId(input: string): string | null {
  const s = String(input ?? '');
  let m = s.match(/products_id\/(\d+)/i);
  if (m?.[1]) return m[1];
  m = s.match(/[?&]products_id=(\d+)/i);
  if (m?.[1]) return m[1];
  m = s.match(/name="products_id"\s+value="(\d+)"/i);
  if (m?.[1]) return m[1];
  return null;
}

export async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "MGqBot/1.0 (+https://vercel.app)",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`fetch_failed_http_${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function parseEumaProductHtml(html: string, sourceUrlHint: string): EumaParsedProduct {
  const productId =
    extractEumaProductId(html) ??
    extractEumaProductId(sourceUrlHint);
  if (!productId) throw new Error('euma_product_id_not_found');

  const priceMatch = html.match(/<h1[^>]*style=["'][^"']*float\s*:\s*right;?[^"']*["'][^>]*>\s*u\$s\s*([0-9.,]+)\s*<\/h1>/i);
  const precioUsd = priceMatch?.[1] ? parseDecimal(priceMatch[1]) : null;
  if (precioUsd === null || !Number.isFinite(precioUsd)) throw new Error('euma_usd_price_not_found');

  const h1Matches = Array.from(html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi)).map((m) => stripTags(m[1] ?? ''));
  const title = h1Matches.find((x) => x && !/^u\$s/i.test(x));
  if (!title) throw new Error('euma_title_not_found');

  const presMatch = html.match(/<strong>\s*Cm3:\s*<\/strong>[\s\S]*?<select[^>]*>[\s\S]*?<option[^>]*>\s*([^<]+?)\s*<\/option>/i);
  const presentacionMl = presMatch?.[1] ? parseDecimal(presMatch[1]) : null;
  if (presentacionMl === null || !Number.isFinite(presentacionMl) || presentacionMl <= 0) {
    throw new Error('euma_presentacion_cm3_not_found');
  }

  let description = '';
  const contentTextMatch = html.match(/<div[^>]*class=["']contentText["'][^>]*>([\s\S]*?)<p>\s*Opciones:\s*<\/p>/i);
  if (contentTextMatch?.[1]) {
    const raw = contentTextMatch[1]
      .replace(/<div[^>]*id=["']piGal["'][\s\S]*?<\/div>/i, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ');
    description = stripTags(raw);
  }
  if (!description) description = title;

  return {
    sourceUrl: canonicalizeEumaUrl(sourceUrlHint, productId),
    title,
    sku: productId,
    description,
    presentacionMl: Number(presentacionMl),
    precioUsd: Number(precioUsd),
  };
}

export async function getFxTodayFromDb(): Promise<number | null> {
  const sql = db();
  const rows = (await sql`
    select valor
    from app.fx
    where fecha = current_date
    limit 1
  `) as any[];
  const raw = rows?.[0]?.valor;
  const n = raw === null || raw === undefined ? null : Number(raw);
  return Number.isFinite(n as any) ? (n as number) : null;
}
