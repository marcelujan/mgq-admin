"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

type ItemKind = "PROVEEDOR" | "FORMULADO" | string;

type ItemRow = {
  item_key: string; // p:<item_id> | f:<item_formulado_id>
  kind: ItemKind;
  item_id: string | number;

  // proveedor
  proveedor_codigo: string;
  proveedor_nombre: string;
  url_original: string;
  url_canonica: string;
  seleccionado: boolean;
  estado: string;
  created_at?: string;
  updated_at?: string;

  // formulado
  producto_nombre?: string | null;
  oferta_nombre?: string | null;
  tipo_formulado?: string | null; // BULK | PRESENTACION

  // opcional
  mensaje_error?: string | null;
  ultimo_job_id?: string | number | null;
  ultimo_job_estado?: string | null;
};

function qs(params: Record<string, any>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  return sp.toString();
}

function productTitleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = (u.pathname.split("/").filter(Boolean).pop() || "").trim();
    if (!last) return u.hostname;
    const decoded = decodeURIComponent(last)
      .replace(/\.(html|htm|php)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return decoded || u.hostname;
  } catch {
    return url;
  }
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function badgeStyle(estado: string): CSSProperties {
  const s = (estado || "").toUpperCase();
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    padding: "2px 10px",
    fontSize: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
    whiteSpace: "nowrap",
  };

  if (s === "OK") return { ...base, borderColor: "rgba(34,197,94,0.45)", background: "rgba(34,197,94,0.10)" };
  if (s === "FORMULADO")
    return { ...base, borderColor: "rgba(59,130,246,0.45)", background: "rgba(59,130,246,0.10)" };
  if (s.includes("ERROR"))
    return { ...base, borderColor: "rgba(248,113,113,0.55)", background: "rgba(248,113,113,0.10)" };
  if (s.includes("WAIT") || s.includes("PENDING"))
    return { ...base, borderColor: "rgba(251,191,36,0.55)", background: "rgba(251,191,36,0.10)" };

  return base;
}

function labelTipoFormulado(tipo?: string | null): string {
  const t = String(tipo ?? "").toUpperCase();
  if (t === "BULK") return "Bulk";
  if (t === "PRESENTACION") return "Presentación";
  return t || "Formulado";
}

export default function ItemsClient() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [seleccionado, setSeleccionado] = useState<"" | "true" | "false">("");
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const query = useMemo(
    () =>
      qs({
        search: search.trim() || undefined,
        estado: estado || undefined,
        seleccionado: seleccionado || undefined,
        limit,
        offset,
      }),
    [search, estado, seleccionado, limit, offset]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`/api/items?${query}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        return j.items as ItemRow[];
      })
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "error");
        setItems([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const fmtUpdated = useMemo(() => {
    const f = new Intl.DateTimeFormat("es-AR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (iso?: string) => {
      if (!iso) return "";
      const d = new Date(iso);
      return Number.isFinite(d.getTime()) ? f.format(d) : iso;
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <style jsx global>{`
        .items-filter-select {
          color-scheme: dark;
        }
        .items-filter-select option {
          background: #0b0b0b;
          color: #ffffff;
        }
      `}</style>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Buscar</label>
          <input
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              width: 320,
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.92)",
              outline: "none",
            }}
            value={search}
            onChange={(e) => {
              setOffset(0);
              setSearch(e.target.value);
            }}
            placeholder="url / proveedor / producto"
          />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Estado</label>
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
            value={estado}
            onChange={(e) => {
              setOffset(0);
              setEstado(e.target.value);
            }}
          >
            <option value="">(todos)</option>
            <option value="FORMULADO">FORMULADO</option>
            <option value="PENDING_SCRAPE">PENDING_SCRAPE</option>
            <option value="WAITING_REVIEW">WAITING_REVIEW</option>
            <option value="OK">OK</option>
            <option value="ERROR_SCRAPE">ERROR_SCRAPE</option>
            <option value="MANUAL_OVERRIDE">MANUAL_OVERRIDE</option>
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
            setEstado("");
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

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
        <button
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.02)",
            cursor: loading || items.length < limit ? "not-allowed" : "pointer",
            opacity: loading || items.length < limit ? 0.5 : 1,
          }}
          disabled={loading || items.length < limit}
          onClick={() => setOffset((v) => v + limit)}
        >
          Next →
        </button>
        <div style={{ fontSize: 12, opacity: 0.7 }}>offset={offset} limit={limit}</div>
      </div>

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, overflow: "auto" }}>
        <table style={{ minWidth: 980, width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
              <th style={{ padding: 10, width: 120 }}>ID</th>
              <th style={{ padding: 10, minWidth: 360 }}>Producto</th>
              <th style={{ padding: 10, width: 220 }}>Proveedor</th>
              <th style={{ padding: 10, width: 160 }}>Estado</th>
              <th style={{ padding: 10, width: 150 }}>Actualizado</th>
              <th style={{ padding: 10, width: 44 }} title="Abrir URL">
                🔗
              </th>
              <th style={{ padding: 10, width: 44 }} title="Ver detalle">
                🔍
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const isProv = (it.kind || "").toUpperCase() === "PROVEEDOR";
              const isFor = (it.kind || "").toUpperCase() === "FORMULADO";

              const url = (it.url_canonica || it.url_original || "").trim();
              const showUrl = isProv && !!url;

              const productoTitle = isProv
                ? productTitleFromUrl(url)
                : isFor
                  ? `${labelTipoFormulado(it.tipo_formulado)} · ${String(it.producto_nombre ?? "").trim() || "Producto"}` +
                    (String(it.oferta_nombre ?? "").trim() ? ` · ${String(it.oferta_nombre ?? "").trim()}` : "")
                  : `Item ${String(it.item_id)}`;

              const productoSub = isProv ? hostFromUrl(url) : isFor ? "" : "";

              return (
                <tr key={it.item_key} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: 10, whiteSpace: "nowrap", opacity: 0.9 }}>
                    <div style={{ fontWeight: 700 }}>{String(it.item_id)}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{it.kind}</div>
                  </td>
                  <td style={{ padding: 10 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        opacity: 0.95,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 520,
                      }}
                      title={isProv ? url : productoTitle}
                    >
                      {productoTitle}
                    </div>
                    {productoSub ? (
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.65,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 520,
                        }}
                      >
                        {productoSub}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                    {isProv ? (
                      <>
                        <div style={{ fontWeight: 700, opacity: 0.95 }}>{it.proveedor_codigo}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{it.proveedor_nombre}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.6 }}>—</div>
                    )}
                  </td>
                  <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                    <span style={badgeStyle(it.estado)} title={it.mensaje_error ?? undefined}>
                      {it.estado}
                      {it.mensaje_error ? <span style={{ opacity: 0.9 }}>⚠︎</span> : null}
                    </span>
                  </td>
                  <td style={{ padding: 10, whiteSpace: "nowrap", opacity: 0.85 }}>{fmtUpdated(it.updated_at)}</td>
                  <td style={{ padding: 10, textAlign: "center" }}>
                    {showUrl ? (
                      <a href={url} target="_blank" rel="noreferrer" title={url} style={{ opacity: 0.9 }}>
                        🔗
                      </a>
                    ) : (
                      <span style={{ opacity: 0.3 }}>🔗</span>
                    )}
                  </td>
                  <td style={{ padding: 10, textAlign: "center" }}>
                    <Link href={`/items/${encodeURIComponent(it.item_key)}`} title="Ver detalle" style={{ opacity: 0.9 }}>
                      🔍
                    </Link>
                  </td>
                </tr>
              );
            })}

            {!loading && items.length === 0 ? (
              <tr>
                <td style={{ padding: 14, fontSize: 13, opacity: 0.7 }} colSpan={7}>
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