import PriceHistoryChart from "./PriceHistoryChart";
import { db } from "@/lib/db";

type ItemParams = { item_id?: string };

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function parseItemKey(raw: string): { kind: "PROVEEDOR" | "FORMULADO"; id: number; item_key: string } | null {
  const s = String(raw ?? "").trim();

  // soporte legacy: /items/123
  if (/^\d+$/.test(s)) {
    const id = Number(s);
    if (Number.isFinite(id) && id > 0) return { kind: "PROVEEDOR", id, item_key: `p:${id}` };
    return null;
  }

  const m = s.match(/^([pf]):(\d+)$/i);
  if (!m) return null;

  const id = Number(m[2]);
  if (!Number.isFinite(id) || id <= 0) return null;

  if (m[1].toLowerCase() === "p") return { kind: "PROVEEDOR", id, item_key: `p:${id}` };
  return { kind: "FORMULADO", id, item_key: `f:${id}` };
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

  // PROVEEDOR
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
    } catch {
      // ignore
    }

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

        <div style={{ fontSize: 14, opacity: 0.85 }}>
          Histórico diario por presentación (tabla: <code>app.item_price_daily_pres</code>)
        </div>

        <PriceHistoryChart itemKey={parsed.item_key} />
      </div>
    );
  }

  // FORMULADO
  let titulo = `Item formulado ${parsed.id}`;
  let subtitulo = "";

  try {
    const r: any = await sql.query(
      `
        select
          i.tipo,
          p.nombre as producto_nombre,
          o.nombre as oferta_nombre
        from app.item_formulado i
        left join app.producto p on p.producto_id = i.producto_id
        left join app.producto_oferta o on o.oferta_id = i.oferta_id
        where i.item_formulado_id = $1
          and i.activo = true
        limit 1;
      `,
      [parsed.id]
    );
    const row = normalizeQueryResult(r)[0] ?? null;
    if (row) {
      const tipo = String(row.tipo ?? "").toUpperCase();
      const prodName = String(row.producto_nombre ?? "").trim();
      const ofertaName = String(row.oferta_nombre ?? "").trim();

      if (tipo === "BULK") titulo = prodName ? `Bulk · ${prodName}` : `Bulk ${parsed.id}`;
      else if (tipo === "PRESENTACION") titulo = prodName ? `${prodName} · ${ofertaName || "Presentación"}` : `Presentación ${parsed.id}`;
      else titulo = prodName ? `Item formulado · ${prodName}` : `Item formulado ${parsed.id}`;

      subtitulo = ofertaName;
    }
  } catch {
    // ignore
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{titulo}</h1>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          item_key=<code>{parsed.item_key}</code> · item_formulado_id=<code>{parsed.id}</code>
          {subtitulo ? <> · {subtitulo}</> : null}
        </div>
      </div>

      <div style={{ fontSize: 14, opacity: 0.85 }}>
        Histórico desde snapshots automáticos (tablas: <code>app.item_formulado_snapshot</code> /{" "}
        <code>app.producto_oferta_costo_snapshot</code>)
      </div>

      <PriceHistoryChart itemKey={parsed.item_key} />
    </div>
  );
}