"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type TipoFiltro = "" | "PROVEEDOR" | "MANUAL" | "FORMULADO";
type EstadoProveedorFiltro = "" | "OK" | "WAIT" | "PEND" | "ERROR";
type EstadoItemFiltro = "" | "OK" | "FAIL" | "PEND";
type SortBy = "item_id" | "nombre" | "fuente" | "estado_proveedor" | "updated_at";
type SortDir = "asc" | "desc";

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

    if (!cleaned || cleaned.length < 3) return null;
    return cleaned;
  } catch {
    return null;
  }
}

function providerStatusLabel(estado: string | null | undefined): string {
  const s = String(estado ?? "").toUpperCase();
  if (s === "OK") return "OK";
  if (s === "WAITING_REVIEW") return "WAIT";
  if (s === "PENDING_SCRAPE") return "PEND";
  if (s === "ERROR_SCRAPE") return "ERROR";
  return "—";
}

function badgeStyle(estado: string | null | undefined) {
  const s = String(estado ?? "").toUpperCase();
  const base = {
    display: "inline-block",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
    opacity: 0.95,
    whiteSpace: "nowrap" as const,
  };

  if (s === "OK") return { ...base, borderColor: "rgba(34,197,94,0.55)" };
  if (s.includes("ERROR") || s.includes("FAIL")) return { ...base, borderColor: "rgba(239,68,68,0.55)" };
  if (s.includes("PEND") || s.includes("WAIT")) return { ...base, borderColor: "rgba(234,179,8,0.55)" };
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

function hasCounts(it: ItemRow): boolean {
  return (
    it.ok_count !== null &&
    it.ok_count !== undefined &&
    it.fail_count !== null &&
    it.fail_count !== undefined &&
    it.pending_count !== null &&
    it.pending_count !== undefined
  );
}

export type ItemsClientProps = {
  initialTipo?: TipoFiltro;
  lockTipo?: boolean;
  hideTipoFilter?: boolean;
  showSeleccionadoFilter?: boolean;
  initialSortBy?: SortBy;
  initialSortDir?: SortDir;
};

export default function ItemsClient(props: ItemsClientProps) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState("");
  const initialTipo = props.initialTipo ?? "";
  const lockTipo = props.lockTipo ?? false;
  const hideTipoFilter = props.hideTipoFilter ?? false;
  const showSeleccionadoFilter = props.showSeleccionadoFilter ?? false;

  const [tipo, setTipo] = useState<TipoFiltro>(initialTipo);
  const [estadoProveedor, setEstadoProveedor] = useState<EstadoProveedorFiltro>("");
  const [estadoItem, setEstadoItem] = useState<EstadoItemFiltro>("");
  const [seleccionado, setSeleccionado] = useState<"" | "true" | "false">("");
  const initialSortBy = props.initialSortBy ?? "item_id";
  const initialSortDir = props.initialSortDir ?? "desc";
  const [sortBy, setSortBy] = useState<SortBy>(initialSortBy);
  const [sortDir, setSortDir] = useState<SortDir>(initialSortDir);

  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const estadoProveedorDisabled = tipo !== "" && tipo !== "PROVEEDOR";

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
        sp.set("sort_by", sortBy);
        sp.set("sort_dir", sortDir);
        if (tipo) sp.set("tipo", tipo);
        if (!estadoProveedorDisabled && estadoProveedor) sp.set("estado_proveedor", estadoProveedor);
        if (estadoItem) sp.set("estado_item", estadoItem);
        if (search.trim()) sp.set("search", search.trim());
        if (showSeleccionadoFilter && seleccionado) sp.set("seleccionado", seleccionado);

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
  }, [search, tipo, estadoProveedor, estadoItem, seleccionado, limit, offset, sortBy, sortDir, estadoProveedorDisabled, reloadToken, showSeleccionadoFilter]);

  async function handleDelete(item: ItemRow) {
    if (item.kind !== "FORMULADO") {
      setError("Eliminar definitivo sólo está habilitado para FORMULADO en esta versión.");
      return;
    }

    const ok = confirm(
      `Eliminar definitivamente este FORMULADO?\n\n` +
        `Esto borra: producto, fórmula, item_formulado y snapshots.\n` +
        `Acción irreversible.`
    );
    if (!ok) return;

    setError(null);
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(item.item_key)}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);

      if (!res.ok || !j?.ok) {
        setError(j?.error ?? `http_${res.status}`);
        return;
      }

      setReloadToken((x) => x + 1);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : String(e));
    }
  }

  function toggleSort(col: SortBy) {
    setOffset(0);
    if (sortBy === col) {
      setSortDir((v) => (v === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(col);
    setSortDir(col === "item_id" || col === "updated_at" ? "desc" : "asc");
  }

  function sortIndicator(col: SortBy) {
    if (sortBy !== col) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

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
            placeholder="url / proveedor / nombre"
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

        {!hideTipoFilter ? (
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Tipo</label>
            <select
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
              disabled={lockTipo}
              onChange={(e) => {
                if (lockTipo) return;
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
        ) : null}

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Estado proveedor</label>
          <select
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.92)",
              outline: "none",
              opacity: estadoProveedorDisabled ? 0.5 : 1,
              cursor: estadoProveedorDisabled ? "not-allowed" : "pointer",
              minWidth: 170,
            }}
            value={estadoProveedor}
            disabled={estadoProveedorDisabled}
            onChange={(e) => {
              setOffset(0);
              setEstadoProveedor(e.target.value as EstadoProveedorFiltro);
            }}
          >
            <option value="">(todos)</option>
            <option value="OK">OK</option>
            <option value="WAIT">WAIT</option>
            <option value="PEND">PEND</option>
            <option value="ERROR">ERROR</option>
          </select>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Estado item</label>
          <select
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.92)",
              outline: "none",
              minWidth: 150,
            }}
            value={estadoItem}
            onChange={(e) => {
              setOffset(0);
              setEstadoItem(e.target.value as EstadoItemFiltro);
            }}
          >
            <option value="">(todos)</option>
            <option value="OK">OK</option>
            <option value="FAIL">FAIL</option>
            <option value="PEND">PEND</option>
          </select>
        </div>

        {showSeleccionadoFilter ? (
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Seleccionado</label>
            <select
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
                setSeleccionado(e.target.value as "" | "true" | "false");
              }}
            >
              <option value="">(todos)</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
        ) : null}

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
            setTipo(initialTipo);
            setEstadoProveedor("");
            setEstadoItem("");
            setSeleccionado("");
            setSortBy(initialSortBy);
            setSortDir(initialSortDir);
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
        <table style={{ minWidth: 1220, width: "100%", fontSize: 13, borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
              <th style={{ padding: "6px 10px", width: 90, textAlign: "right" }}>
                <button type="button" onClick={() => toggleSort("item_id")} style={headerButtonStyle("right")}>
                  Item # <span style={{ opacity: 0.7 }}>{sortIndicator("item_id")}</span>
                </button>
              </th>
              <th style={{ padding: "6px 10px", minWidth: 380 }}>
                <button type="button" onClick={() => toggleSort("nombre")} style={headerButtonStyle("left")}>
                  Nombre <span style={{ opacity: 0.7 }}>{sortIndicator("nombre")}</span>
                </button>
              </th>
              <th style={{ padding: "6px 10px", width: 180 }}>
                <button type="button" onClick={() => toggleSort("fuente")} style={headerButtonStyle("left")}>
                  Fuente <span style={{ opacity: 0.7 }}>{sortIndicator("fuente")}</span>
                </button>
              </th>
              <th style={{ padding: "6px 10px", width: 160 }}>
                <button type="button" onClick={() => toggleSort("estado_proveedor")} style={headerButtonStyle("left")}>
                  Estado proveedor <span style={{ opacity: 0.7 }}>{sortIndicator("estado_proveedor")}</span>
                </button>
              </th>
              <th style={{ padding: "6px 10px", width: 240 }}>Estado item</th>
              <th style={{ padding: "6px 10px", width: 180 }}>
                <button type="button" onClick={() => toggleSort("updated_at")} style={headerButtonStyle("left")}>
                  Actualizado <span style={{ opacity: 0.7 }}>{sortIndicator("updated_at")}</span>
                </button>
              </th>
              <th style={{ padding: "6px 10px", width: 120, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {items.map((it) => {
              const kind = String(it.kind ?? "").toUpperCase();
              const itemId = String(it.item_id ?? "");

              const isProv = kind === "PROVEEDOR";
              const url = String(it.url_canonica || it.url_original || "").trim();
              const showUrl = isProv && !!url;

              let nombre =
                (kind === "FORMULADO" ? String(it.producto_nombre ?? "").trim() : "") ||
                (kind === "MANUAL" ? String(it.manual_nombre ?? "").trim() : "") ||
                (isProv ? nameFromUrl(url) ?? "" : "") ||
                (url ? url : "");

              if (!nombre) nombre = `Item ${itemId}`;

              const fuente = String(it.proveedor_nombre ?? "—") || "—";
              const estadoProveedorLabel = isProv ? providerStatusLabel(it.estado) : "—";

              const showCounts = hasCounts(it);
              const okc = Number(it.ok_count ?? 0);
              const failc = Number(it.fail_count ?? 0);
              const pendc = Number(it.pending_count ?? 0);

              const estadoCountsText = `OK: ${Number.isFinite(okc) ? okc : 0} | FAIL: ${
                Number.isFinite(failc) ? failc : 0
              } | PEND: ${Number.isFinite(pendc) ? pendc : 0}`;

              return (
                <tr key={it.item_key} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 10px", textAlign: "right", whiteSpace: "nowrap", opacity: 0.85, lineHeight: 1.15 }}>{itemId}</td>

                  <td
                    style={{
                      padding: "5px 10px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 680,
                      fontWeight: 400 as const,
                      lineHeight: 1.15,
                    }}
                    title={nombre}
                  >
                    {nombre}
                  </td>

                  <td
                    style={{ padding: "5px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.15 }}
                    title={fuente}
                  >
                    {fuente}
                  </td>

                  <td style={{ padding: "5px 10px", whiteSpace: "nowrap", lineHeight: 1.15 }}>
                    {estadoProveedorLabel === "—" ? "—" : <span style={badgeStyle(estadoProveedorLabel)}>{estadoProveedorLabel}</span>}
                  </td>

                  <td style={{ padding: "5px 10px", whiteSpace: "nowrap", lineHeight: 1.15 }}>
                    {showCounts ? <span style={{ opacity: 0.92 }}>{estadoCountsText}</span> : <span>—</span>}
                  </td>

                  <td style={{ padding: "5px 10px", whiteSpace: "nowrap", opacity: 0.85, lineHeight: 1.15 }}>
                    {fmtUpdated(it.updated_at ?? null)}
                  </td>

                  <td style={{ padding: "5px 10px", textAlign: "center", whiteSpace: "nowrap", lineHeight: 1.15 }}>
                    <div style={{ display: "inline-flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
                      <Link
                        href={`/items/${encodeURIComponent(it.item_key)}`}
                        title="Ver detalle"
                        style={{ opacity: 0.9, textDecoration: "none" }}
                      >
                        🔍
                      </Link>
                      {showUrl ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          title={url}
                          style={{ opacity: 0.9, textDecoration: "none" }}
                        >
                          🔗
                        </a>
                      ) : (
                        <span style={{ opacity: 0.3 }} title="Sin URL">
                          🔗
                        </span>
                      )}
                      <button
                        onClick={() => void handleDelete(it)}
                        title={it.kind === "FORMULADO" ? "Eliminar definitivamente" : `Eliminar no está habilitado para ${it.kind}`}
                        disabled={it.kind !== "FORMULADO"}
                        style={{
                          opacity: it.kind === "FORMULADO" ? 0.9 : 0.5,
                          cursor: it.kind === "FORMULADO" ? "pointer" : "not-allowed",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          color: "inherit",
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && items.length === 0 ? (
              <tr>
                <td style={{ padding: "8px 10px", fontSize: 13, opacity: 0.7, lineHeight: 1.15 }} colSpan={7}>
                  Sin resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function headerButtonStyle(align: "left" | "right") {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: align === "right" ? "flex-end" : "flex-start",
    gap: 6,
    width: "100%",
    background: "transparent",
    border: "none",
    color: "inherit",
    padding: 0,
    cursor: "pointer",
    fontWeight: 700,
    textAlign: align,
  } as const;
}
