"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type TipoFiltro = "" | "PROVEEDOR" | "MANUAL" | "FORMULADO";
type EstadoProveedorFiltro = "" | "PENDING_SCRAPE" | "WAITING_REVIEW" | "OK" | "ERROR_SCRAPE";

type ItemRow = {
  item_key: string;
  kind: string;
  item_id: string;
  proveedor_nombre?: string | null;
  url_original?: string | null;
  url_canonica?: string | null;
  seleccionado?: boolean | null;
  estado?: string | null;
  updated_at?: string | null;
  producto_nombre?: string | null;
  manual_nombre?: string | null;
  manual_uom?: string | null;
  manual_cantidad?: number | null;
  manual_costo_ars?: number | null;
  ok_count?: number | null;
  fail_count?: number | null;
  pending_count?: number | null;
};

function hostFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host || url;
  } catch {
    return url;
  }
}

function nameFromUrl(url: string): string | null {
  try {
    const u = new URL(String(url));
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts.length ? parts[parts.length - 1] : "";
    if (!last) return null;

    const cleaned = decodeURIComponent(last)
      .replace(/\.(html|htm)$/i, "")
      .replace(/[_]+/g, " ")
      .replace(/[-]+/g, " ")
      .trim();

    if (!cleaned) return null;
    if (cleaned.length < 3) return null;

    return cleaned;
  } catch {
    return null;
  }
}

function badgeStyle(estado: any) {
  const s = String(estado ?? "").toUpperCase();
  const base = {
    display: "inline-block",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    opacity: 0.95,
    whiteSpace: "nowrap" as const,
  };

  if (s === "OK") return { ...base, borderColor: "rgba(34,197,94,0.55)" };
  if (s.includes("ERROR")) return { ...base, borderColor: "rgba(239,68,68,0.55)" };
  if (s.includes("PENDING") || s.includes("WAIT")) return { ...base, borderColor: "rgba(234,179,8,0.55)" };
  return base;
}

function fmtUpdated(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return String(s);

  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function makePageButtons(current: number, total: number): Array<number | "…"> {
  if (total <= 1) return [1];
  const set = new Set<number>();
  set.add(1);
  set.add(total);
  set.add(current);
  if (current - 1 >= 1) set.add(current - 1);
  if (current + 1 <= total) set.add(current + 1);

  const arr = Array.from(set).sort((a, b) => a - b);

  const out: Array<number | "…"> = [];
  for (let i = 0; i < arr.length; i++) {
    const n = arr[i];
    if (i > 0 && n - arr[i - 1] > 1) out.push("…");
    out.push(n);
  }
  return out;
}

export default function ItemsClient() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState<TipoFiltro>("");
  const [estadoProv, setEstadoProv] = useState<EstadoProveedorFiltro>("");
  const [seleccionado, setSeleccionado] = useState<"" | "true" | "false">("");

  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  const [total, setTotal] = useState(0);

  const estadoDisabled = tipo !== "" && tipo !== "PROVEEDOR";

  const page = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit) || 1), [total, limit]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      try {
        const sp = new URLSearchParams();
        sp.set("limit", String(limit));
        sp.set("offset", String(offset));
        if (tipo) sp.set("tipo", tipo);
        if (!estadoDisabled && estadoProv) sp.set("estado", estadoProv);
        if (search.trim()) sp.set("search", search.trim());
        if (seleccionado) sp.set("seleccionado", seleccionado);

        const res = await fetch(`/api/items?${sp.toString()}`, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));

        if (!res.ok || !j?.ok) {
          setError(j?.error ?? `http_${res.status}`);
          setItems([]);
          setTotal(0);
          return;
        }

        setItems(Array.isArray(j?.items) ? (j.items as ItemRow[]) : []);
        setTotal(Number(j?.total ?? 0));
      } catch (e: any) {
        setError(String(e?.message ?? e));
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    })();
  }, [search, tipo, estadoProv, seleccionado, limit, offset, estadoDisabled]);

  const pageButtons = useMemo(() => makePageButtons(page, totalPages), [page, totalPages]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Buscar</label>
          <input
            value={search}
            onChange={(e) => {
              setOffset(0);
              setSearch(e.target.value);
            }}
            placeholder="url / proveedor / producto / manual"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.92)",
              outline: "none",
              width: 340,
            }}
          />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Tipo</label>
          <select
            className="items-filter-select"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.92)",
              outline: "none",
              minWidth: 180,
            }}
            value={tipo}
            onChange={(e) => {
              setOffset(0);
              setTipo(e.target.value as TipoFiltro);
            }}
          >
            <option value="">(todos)</option>
            <option value="PROVEEDOR">Proveedor</option>
            <option value="MANUAL">Manual</option>
            <option value="FORMULADO">Formulado</option>
          </select>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Estado (scrape)</label>
          <select
            className="items-filter-select"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.92)",
              outline: "none",
              opacity: estadoDisabled ? 0.5 : 1,
              cursor: estadoDisabled ? "not-allowed" : "pointer",
              minWidth: 210,
            }}
            value={estadoProv}
            disabled={estadoDisabled}
            onChange={(e) => {
              setOffset(0);
              setEstadoProv(e.target.value as EstadoProveedorFiltro);
            }}
          >
            <option value="">(todos)</option>
            <option value="PENDING_SCRAPE">PENDING_SCRAPE</option>
            <option value="WAITING_REVIEW">WAITING_REVIEW</option>
            <option value="OK">OK</option>
            <option value="ERROR_SCRAPE">ERROR_SCRAPE</option>
          </select>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Seleccionado</label>
          <select
            className="items-filter-select"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.92)",
              outline: "none",
            }}
            value={seleccionado}
            onChange={(e) => {
              setOffset(0);
              setSeleccionado(e.target.value as any);
            }}
          >
            <option value="">(todos)</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>

        <button
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.02)",
            cursor: "pointer",
          }}
          onClick={() => {
            setSearch("");
            setTipo("");
            setEstadoProv("");
            setSeleccionado("");
            setOffset(0);
          }}
        >
          Limpiar
        </button>

        <div style={{ marginLeft: "auto", fontSize: 13 }}>
          {loading ? "Cargando..." : error ? <span style={{ color: "#ff6b6b" }}>{error}</span> : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.02)",
            cursor: offset === 0 || loading ? "not-allowed" : "pointer",
            opacity: offset === 0 || loading ? 0.5 : 1,
          }}
          disabled={offset === 0 || loading}
          onClick={() => setOffset(0)}
          title="Primera página"
        >
          ⏮
        </button>

        <button
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.02)",
            cursor: offset === 0 || loading ? "not-allowed" : "pointer",
            opacity: offset === 0 || loading ? 0.5 : 1,
          }}
          disabled={offset === 0 || loading}
          onClick={() => setOffset((v) => Math.max(v - limit, 0))}
        >
          ← Prev
        </button>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {pageButtons.map((b, idx) =>
            b === "…" ? (
              <span key={`e_${idx}`} style={{ opacity: 0.7, padding: "0 4px" }}>
                …
              </span>
            ) : (
              <button
                key={b}
                onClick={() => setOffset((b - 1) * limit)}
                disabled={loading}
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 10,
                  padding: "6px 10px",
                  background: b === page ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.02)",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  fontSize: 12,
                }}
                title={`Página ${b}`}
              >
                {b}
              </button>
            )
          )}
        </div>

        <button
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.02)",
            cursor: loading || page >= totalPages ? "not-allowed" : "pointer",
            opacity: loading || page >= totalPages ? 0.5 : 1,
          }}
          disabled={loading || page >= totalPages}
          onClick={() => setOffset((v) => v + limit)}
        >
          Next →
        </button>

        <button
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.02)",
            cursor: loading || page >= totalPages ? "not-allowed" : "pointer",
            opacity: loading || page >= totalPages ? 0.5 : 1,
          }}
          disabled={loading || page >= totalPages}
          onClick={() => setOffset((totalPages - 1) * limit)}
          title="Última página"
        >
          ⏭
        </button>

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          pág {page}/{totalPages} · total={total} · limit={limit}
        </div>
      </div>

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, overflow: "auto" }}>
        <table style={{ minWidth: 1100, width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
              <th style={{ padding: 10, width: 90, textAlign: "right" }}>Item #</th>
              <th style={{ padding: 10, minWidth: 420 }}>Nombre</th>
              <th style={{ padding: 10, width: 220 }}>Fuente</th>
              <th style={{ padding: 10, width: 220 }}>Estado</th>
              <th style={{ padding: 10, width: 180 }}>Actualizado</th>
              <th style={{ padding: 10, width: 120, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const kind = String(it.kind ?? "").toUpperCase();
              const itemId = String(it.item_id ?? "");

              const isProv = kind === "PROVEEDOR";
              const isFor = kind === "FORMULADO";
              const isMan = kind === "MANUAL";

              const url = String(it.url_canonica || it.url_original || "").trim();
              const showUrl = isProv && !!url;

              let nombre =
                (isFor ? String(it.producto_nombre ?? "").trim() : "") ||
                (isMan ? String(it.manual_nombre ?? "").trim() : "") ||
                (isProv ? (nameFromUrl(url) ?? "") : "") ||
                (url ? url : "");

              if (!nombre) nombre = `Item ${itemId}`;

              const fuente = String(it.proveedor_nombre ?? "—") || "—";

              const okc = Number(it.ok_count ?? 0);
              const failc = Number(it.fail_count ?? 0);
              const pendc = Number(it.pending_count ?? 0);

              const estadoText = isProv
                ? `OK: ${Number.isFinite(okc) ? okc : 0} | FAIL: ${Number.isFinite(failc) ? failc : 0} | PEND: ${
                    Number.isFinite(pendc) ? pendc : 0
                  }`
                : String(it.estado ?? "—");

              return (
                <tr key={it.item_key} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: 10, textAlign: "right", whiteSpace: "nowrap", opacity: 0.85 }}>{itemId}</td>

                  <td
                    style={{
                      padding: 10,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 680,
                      fontWeight: 650 as any,
                    }}
                    title={nombre}
                  >
                    {nombre}
                  </td>

                  <td
                    style={{ padding: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    title={fuente}
                  >
                    {fuente}
                  </td>

                  <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                    {isProv ? <span style={{ opacity: 0.92 }}>{estadoText}</span> : <span style={badgeStyle(it.estado)}>{it.estado}</span>}
                  </td>

                  <td style={{ padding: 10, whiteSpace: "nowrap", opacity: 0.85 }}>{fmtUpdated(it.updated_at ?? null)}</td>

                  <td style={{ padding: 10, textAlign: "center", whiteSpace: "nowrap" }}>
                    <div style={{ display: "inline-flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
                      <Link
                        href={`/items/${encodeURIComponent(it.item_key)}`}
                        title="Ver detalle"
                        style={{ opacity: 0.9, textDecoration: "none" }}
                      >
                        🔍
                      </Link>
                      {showUrl ? (
                        <a href={url} target="_blank" rel="noreferrer" title={url} style={{ opacity: 0.9, textDecoration: "none" }}>
                          🔗
                        </a>
                      ) : (
                        <span style={{ opacity: 0.3 }} title="Sin URL">
                          🔗
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && items.length === 0 ? (
              <tr>
                <td style={{ padding: 14, fontSize: 13, opacity: 0.7 }} colSpan={6}>
                  Sin resultados
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}