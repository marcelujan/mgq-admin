export type EumaParsedProduct = {
  title: string | null;
  description: string | null;
  productsId: string | null;
  priceUsd: number | null;
  presentacionMl: number | null;
};

function stripTags(html: string): string {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function parseUsd(raw: string): number | null {
  const cleaned = String(raw ?? "")
    .replace(/u\$s?/i, "")
    .replace(/[^\d,.-]/g, "")
    .trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function compactText(s: string | null): string | null {
  if (!s) return null;
  const t = s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return t || null;
}

export function extractEumaProductsId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const path = `${u.pathname}${u.search}`;
    const m = path.match(/(?:products_id[\/=])(\d+)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function buildEumaCandidateUrls(rawUrl: string): string[] {
  const uniq = new Set<string>();
  const add = (u?: string | null) => {
    if (!u) return;
    uniq.add(u);
  };

  try {
    const u = new URL(rawUrl);
    if (/euma\.com\.ar$/i.test(u.hostname)) {
      u.search = "";
      u.hash = "";
      const cleanPath = u.pathname.replace(/\/osCsid\/[^/]+/i, "");
      u.pathname = cleanPath;
      add(u.toString());
    }
  } catch {}

  const pid = extractEumaProductsId(rawUrl);
  if (pid) {
    add(`https://www.euma.com.ar/catalog/product_info.php/products_id/${pid}`);
    add(`https://euma.com.ar/catalog/product_info.php/products_id/${pid}`);
    add(`https://www.euma.com.ar/catalog/product_info.php?products_id=${pid}`);
    add(`https://euma.com.ar/catalog/product_info.php?products_id=${pid}`);
  }

  return Array.from(uniq);
}

export function parseEumaProductFromHtml(html: string): EumaParsedProduct {
  const priceMatch = html.match(/<h1\s+style="float:\s*right;"[^>]*>\s*([^<]+)\s*<\/h1>/i);
  const titleMatch = html.match(/<h1>([^<]+)<\/h1>/i);
  const title = compactText(titleMatch?.[1] ?? null);
  const priceUsd = parseUsd(priceMatch?.[1] ?? "");

  const productIdMatch = html.match(/<input[^>]+name="products_id"[^>]+value="(\d+)"/i);
  const productsId = productIdMatch?.[1] ?? null;

  const presMatch = html.match(/<strong>\s*Cm3:\s*<\/strong>[\s\S]*?<option[^>]*>\s*(\d+(?:[.,]\d+)?)\s*<\/option>/i);
  const presRaw = presMatch?.[1] ?? null;
  const presentacionMl = presRaw ? Number(String(presRaw).replace(",", ".")) : null;

  let description: string | null = null;
  const blockMatch = html.match(/<div class="contentText">([\s\S]*?)<p>\s*Opciones:\s*<\/p>/i);
  if (blockMatch?.[1]) {
    const block = blockMatch[1]
      .replace(/<div id="piGal"[\s\S]*?<\/div>/i, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ");
    description = compactText(stripTags(block));
  }

  return {
    title,
    description,
    productsId,
    priceUsd,
    presentacionMl: Number.isFinite(presentacionMl as number) ? (presentacionMl as number) : null,
  };
}
