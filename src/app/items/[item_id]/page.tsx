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

    if (!cleaned) return null;
    if (/^products?_?id$/i.test(cleaned)) return null;
    if (/^\d+$/.test(cleaned)) return null;
    if (/^oscsid$/i.test(cleaned)) return null;
    return cleaned || null;
  } catch {
    return null;
  }
}

function providerFallbackTitle(providerName: string | null, providerCode: string | null, canonicalUrl: string | null, originalUrl: string | null, itemId: number): string {
  const name = String(providerName ?? "").trim();
  const code = String(providerCode ?? "").trim();
  if (name && code) return `${name} · SKU ${code}`;
  if (canonicalUrl) {
    const t = titleFromUrl(canonicalUrl);
    if (t) return t;
  }
  if (originalUrl) {
    const t = titleFromUrl(originalUrl);
    if (t) return t;
  }
  if (name) return name;
  return `Item ${itemId}`;
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
    let providerCode: string | null = null;

    try {
      const res: any = await sql.query(
        `
        select
          i.url_original,
          i.url_canonica,
          i.descripcion_fuente,
          i.articulo_prov,
          p.nombre as proveedor_nombre,
          op.descripcion as oferta_descripcion
        from app.item_seguimiento i
        left join app.proveedor p on p.proveedor_id = i.proveedor_id
        left join lateral (
          select descripcion
          from app.oferta_proveedor op
          where op.item_id = i.item_id
            and coalesce(trim(op.descripcion), '') <> ''
          order by op.updated_at desc nulls last, op.oferta_id desc
          limit 1
        ) op on true
        where i.item_id = $1
        limit 1;
        `,
        [parsed.id]
      );
      const row = normalizeQueryResult(res)[0] ?? null;
      itemUrl = (row?.url_canonica || row?.url_original || null) as string | null;
      providerCode = (row?.articulo_prov || null) as string | null;

      const descripcionFuente = String(row?.descripcion_fuente ?? "").trim();
      const ofertaDescripcion = String(row?.oferta_descripcion ?? "").trim();
      const proveedorNombre = String(row?.proveedor_nombre ?? "").trim() || null;
      const urlOriginal = (row?.url_original || null) as string | null;
      const urlCanonica = (row?.url_canonica || null) as string | null;

      productTitle =
        descripcionFuente ||
        ofertaDescripcion ||
        providerFallbackTitle(proveedorNombre, providerCode, urlCanonica, urlOriginal, parsed.id);
    } catch {}

    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{productTitle}</h1>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            item_key=<code>{parsed.item_key}</code> · item_id=<code>{parsed.id}</code>
            {providerCode ? (
              <>
                {" · "}
                SKU=<code>{providerCode}</code>
              </>
            ) : null}
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
