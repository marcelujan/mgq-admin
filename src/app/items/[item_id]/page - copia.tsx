import PriceHistoryChart from "./PriceHistoryChart";
import { db } from "../../../lib/db";

type ItemParams = { item_id?: string };

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function titleFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const last = (u.pathname.split("/").filter(Boolean).pop() || "").trim();
    if (!last) return null;

    const decoded = decodeURIComponent(last);
    const cleaned = decoded
      .replace(/\.(html|htm|php)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) return null;

    return cleaned
      .split(" ")
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  } catch {
    return null;
  }
}

export default async function ItemPage({
  params,
}: {
  params: ItemParams | Promise<ItemParams>;
}) {
  const p = await Promise.resolve(params);

  const raw = p?.item_id;
  const itemId = raw !== undefined ? Number(raw) : NaN;

  if (!Number.isFinite(itemId) || itemId <= 0) {
    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Item inválido</h1>
        <div style={{ opacity: 0.9 }}>
          item_id=<code>{String(raw)}</code>
        </div>
      </div>
    );
  }

  let productTitle = `Item ${itemId}`;
  let itemUrl: string | null = null;

  try {
    const sql = db();
    const res: any = await sql.query(
      `select url_original, url_canonica
       from app.item_seguimiento
       where item_id = $1
       limit 1;`,
      [itemId]
    );
    const row = normalizeQueryResult(res)[0] ?? null;
    itemUrl = (row?.url_original || row?.url_canonica || null) as string | null;

    if (itemUrl) {
      const t = titleFromUrl(itemUrl);
      if (t) productTitle = t;
    }
  } catch {
    // si falla la DB, queda el fallback "Item {id}"
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{productTitle}</h1>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          item_id={itemId}
          {itemUrl ? (
            <>
              {" · "}
              <a href={itemUrl} target="_blank" rel="noreferrer" style={{ color: "inherit", opacity: 0.9 }}>
                Ver URL
              </a>
            </>
          ) : null}
        </div>
      </div>

      <div style={{ fontSize: 14, opacity: 0.85 }}>
        Histórico diario por presentación (tabla: <code>app.item_price_daily_pres</code>)
      </div>

      <PriceHistoryChart itemId={itemId} />
    </div>
  );
}
