import https from 'node:https';

export type EumaParsed = {
  canonicalUrl: string;
  productId: string;
  title: string | null;
  description: string | null;
  presentationMl: number | null;
  usdPrice: number | null;
};

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(s: string): string {
  return decodeHtml(s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function extractEumaProductId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const qs = u.searchParams.get('products_id');
    if (qs && /^\d+$/.test(qs)) return qs;
    const m = u.pathname.match(/\/products_id\/(\d+)/i);
    if (m) return m[1];
    return null;
  } catch {
    const m1 = String(rawUrl).match(/[?&]products_id=(\d+)/i);
    if (m1) return m1[1];
    const m2 = String(rawUrl).match(/\/products_id\/(\d+)/i);
    return m2 ? m2[1] : null;
  }
}

export function buildEumaCandidateUrls(rawUrl: string): string[] {
  const id = extractEumaProductId(rawUrl);
  if (!id) return [String(rawUrl)];
  const urls = [
    `https://www.euma.com.ar/catalog/product_info.php/products_id/${id}`,
    `https://www.euma.com.ar/catalog/product_info.php?products_id=${id}`,
    `https://euma.com.ar/catalog/product_info.php/products_id/${id}`,
    `https://euma.com.ar/catalog/product_info.php?products_id=${id}`,
  ];
  return Array.from(new Set(urls));
}

function requestText(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        family: 4,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'accept-language': 'es-AR,es;q=0.9,en;q=0.8',
          'cache-control': 'no-cache',
          pragma: 'no-cache',
          connection: 'close',
        },
      },
      (res) => {
        const code = Number(res.statusCode || 0);
        const loc = res.headers.location;
        if (code >= 300 && code < 400 && loc) {
          res.resume();
          const nextUrl = loc.startsWith('http') ? loc : new URL(loc, url).toString();
          requestText(nextUrl, timeoutMs).then(resolve, reject);
          return;
        }
        if (code < 200 || code >= 300) {
          res.resume();
          reject(new Error(`http_${code}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      }
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

export async function fetchEumaHtml(rawUrl: string, timeoutMs = 12000): Promise<{ url: string; html: string }> {
  const tried: string[] = [];
  for (const candidate of buildEumaCandidateUrls(rawUrl)) {
    try {
      const html = await requestText(candidate, timeoutMs);
      if (/euma\.com\.ar/i.test(html) || /<h1/i.test(html)) {
        return { url: candidate, html };
      }
      tried.push(`${candidate} => empty_or_unexpected_html`);
    } catch (e: any) {
      tried.push(`${candidate} => ${String(e?.message ?? e)}`);
    }
  }
  throw new Error(`euma_fetch_failed: ${tried.join(' | ')}`);
}

function extractTitle(html: string): string | null {
  const re = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  const vals: string[] = [];
  for (let m; (m = re.exec(html)); ) {
    const t = stripTags(m[1]);
    if (t) vals.push(t);
  }
  const nonPrice = vals.find((v) => !/^u\$s\s*/i.test(v));
  return nonPrice ?? vals[0] ?? null;
}

function extractUsdPrice(html: string): number | null {
  const m = html.match(/u\$s\s*([0-9]+(?:[.,][0-9]+)?)/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function extractPresentationMl(html: string): number | null {
  const block = html.match(/<strong>\s*Cm3:\s*<\/strong>[\s\S]*?<select[^>]*>[\s\S]*?<option[^>]*>([\s\S]*?)<\/option>/i);
  const raw = block ? stripTags(block[1]) : null;
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function extractDescription(html: string): string | null {
  const m = html.match(/<div\s+class="contentText"[^>]*>([\s\S]*?)<p>\s*Opciones:\s*<\/p>/i);
  if (!m) return null;
  let s = m[1];
  s = s.replace(/<div id="piGal"[\s\S]*?<\/div>/i, ' ');
  const txt = stripTags(s);
  return txt || null;
}

export function parseEumaProductHtml(html: string, sourceUrl: string): EumaParsed {
  const productId = extractEumaProductId(sourceUrl) ?? '';
  return {
    canonicalUrl: sourceUrl,
    productId,
    title: extractTitle(html),
    description: extractDescription(html),
    presentationMl: extractPresentationMl(html),
    usdPrice: extractUsdPrice(html),
  };
}
