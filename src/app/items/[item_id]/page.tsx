import PriceHistoryChart from "./PriceHistoryChart";
import { db } from "@/lib/db";

type ItemParams = { item_id?: string };

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function decodeRepeated(s: string, maxRounds = 3): string {
  let out = String(s ?? "");
  for (let i = 0; i < maxRounds; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

type ParsedKey =
  | { kind: "PROVEEDOR"; id: number; item_key: string }
  | { kind: "FORMULADO_PRODUCTO"; producto_id: number; item_key: string }
  | { kind: "MANUAL_COST_OPTION"; cost_option_id: number; item_key: string };

function parseItemKey(raw: string): ParsedKey | null {
  const s = decodeRepeated(String(raw ?? "").trim());

  if (/^\d+$/.test(s)) {
    const id = Number(s);
    if (Number.isFinite(id) && id > 0) return { kind: "PROVEEDOR", id, item_key: `p:${id}` };
    return null;
  }

  const mp = s.match(/^p:(\d+)$/i);
  if (mp) {
    const id = Number(mp[1]);
    if (Number.isFinite(id) && id > 0) return { kind: "PROVEEDOR", id, item_key: `p:${id}` };
    return null;
  }

  const mfp = s.match(/^fprod:(\d+)$/i);
  if (mfp) {
    const producto_id = Number(mfp[1]);
    if (Number.isFinite(producto_id) && producto_id > 0) return { kind: "FORMULADO_PRODUCTO", producto_id, item_key: `fprod:${producto_id}` };
    return null;
  }

  const mm = s.match(/^mopt:(\d+)$/i);
  if (mm) {
    const cost_option_id = Number(mm[1]);
    if (Number.isFinite(cost_option_id) && cost_option_id > 0) return { kind: "MANUAL_COST_OPTION", cost_option_id, item_key: `mopt:${cost_option_id}` };
    return null;
  }

  return null;
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

    return cleaned || null;
  } catch {
    return null;
  }
}

export default async function ItemPage({ params }: { params: ItemParams | Promise<ItemParams> }) {
  const p = await Promise.resolve(params);
  const raw = p?.item_id ?? "";
  const parsed = parseItemKey(raw);

  if (!parsed) {
    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Item inválido</h1>
        <div style={{ opacity: 0.9 }}>
          item_id=<code>{String(raw)}</code>
        </div>
      </div>
    );
  }

  const sql = db();

  if (parsed.kind === "PROVEEDOR") {
    let productTitle = `Item ${parsed.id}`;
    let itemUrl: string | null = null;

    try {
      const res: any = await sql.query(
        `select url_original, url_canonica
         from app.item_seguimiento
         where item_id = $1
         limit 1;`,
        [parsed.id]
      );
      const row = normalizeQueryResult(res)[0] ?? null;
      itemUrl = (row?.url_original || row?.url_canonica || null) as string | null;

      if (itemUrl) {
        const t = titleFromUrl(itemUrl);
        if (t) productTitle = t;
      }
    } catch {}

    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{productTitle}</h1>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            item_key=<code>{parsed.item_key}</code> · item_id=<code>{parsed.id}</code>
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

        <PriceHistoryChart itemKey={parsed.item_key} />
      </div>
    );
  }

  if (parsed.kind === "FORMULADO_PRODUCTO") {
    let titulo = `Bulk · Producto ${parsed.producto_id}`;
    try {
      const r: any = await sql.query(`select nombre from app.producto where producto_id = $1 limit 1;`, [parsed.producto_id]);
      const row = normalizeQueryResult(r)[0] ?? null;
      const prodName = String(row?.nombre ?? "").trim();
      if (prodName) titulo = `Bulk · ${prodName}`;
    } catch {}

    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{titulo}</h1>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            item_key=<code>{parsed.item_key}</code> · producto_id=<code>{parsed.producto_id}</code>
          </div>
        </div>

        <PriceHistoryChart itemKey={parsed.item_key} />
      </div>
    );
  }

  // MANUAL_COST_OPTION
  {
    let titulo = `Manual · opt ${parsed.cost_option_id}`;
    let detalle = "";

    try {
      const r: any = await sql.query(
        `
          select manual_nombre, manual_uom, manual_cantidad, manual_costo_ars
          from app.cost_option
          where cost_option_id = $1
          limit 1;
        `,
        [parsed.cost_option_id]
      );
      const row = normalizeQueryResult(r)[0] ?? null;
      if (row) {
        const n = String(row.manual_nombre ?? "").trim();
        if (n) titulo = `Manual · ${n}`;
        const uom = String(row.manual_uom ?? "").trim();
        const cant = row.manual_cantidad;
        const costo = row.manual_costo_ars;
        detalle = `${cant ?? ""} ${uom}`.trim() + (costo != null ? ` · ARS ${String(costo)}` : "");
      }
    } catch {}

    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{titulo}</h1>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            item_key=<code>{parsed.item_key}</code> · cost_option_id=<code>{parsed.cost_option_id}</code>
            {detalle ? <> · {detalle}</> : null}
          </div>
        </div>

        <PriceHistoryChart itemKey={parsed.item_key} />
      </div>
    );
  }
}