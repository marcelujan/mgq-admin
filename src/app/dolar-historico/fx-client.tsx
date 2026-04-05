"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type FxRow = {
  fecha: string;
  valor: number | null;
};

type SortKey = "fecha" | "valor";
type SortDir = "asc" | "desc";

function compareText(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, "es", { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function compareNumber(a: number, b: number, dir: SortDir): number {
  const cmp = a - b;
  return dir === "asc" ? cmp : -cmp;
}

function fmtValor(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(n));
}

export default function FxClient() {
  const [rows, setRows] = useState<FxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("fecha");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "400");
      if (search.trim()) qs.set("search", search.trim());
      const res = await fetch(`/api/fx?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [search]);

  function toggleSort(key: SortKey) {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(key === "fecha" ? "desc" : "asc");
      return key;
    });
  }

  function sortLabel(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const filtered = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortKey === "fecha") return compareText(a.fecha || "", b.fecha || "", sortDir);
      return compareNumber(Number(a.valor ?? Number.NEGATIVE_INFINITY), Number(b.valor ?? Number.NEGATIVE_INFINITY), sortDir);
    });
  }, [rows, sortKey, sortDir]);

  const thBase: CSSProperties = { padding: "6px 10px", opacity: 0.8, lineHeight: 1.15 };
  const thButton: CSSProperties = {
    all: "unset",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color: "inherit",
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por fecha..."
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
              width: 220,
            }}
          />
          {loading ? <span style={{ fontSize: 12, opacity: 0.75 }}>Cargando...</span> : null}
          {error ? <span style={{ fontSize: 12, color: "tomato" }}>{error}</span> : null}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{rows.length} registro(s)</div>
      </div>

      <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
              <th style={{ ...thBase, width: 130 }}>
                <button type="button" onClick={() => toggleSort("fecha")} style={thButton}>Fecha{sortLabel("fecha")}</button>
              </th>
              <th style={{ ...thBase, width: 160, textAlign: "right" }}>
                <button type="button" onClick={() => toggleSort("valor")} style={{ ...thButton, marginLeft: "auto" }}>USD venta{sortLabel("valor")}</button>
              </th>
              <th style={{ ...thBase, width: 120 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.fecha} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ padding: "6px 10px", lineHeight: 1.15, whiteSpace: "nowrap" }}>{r.fecha}</td>
                <td style={{ padding: "6px 10px", lineHeight: 1.15, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtValor(r.valor)}</td>
                <td style={{ padding: "6px 10px", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                  <div style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                    <Link href={`/dolar-historico/${encodeURIComponent(r.fecha)}`} style={{ textDecoration: "none", opacity: 0.9 }}>Editar</Link>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: "8px 10px", opacity: 0.75, lineHeight: 1.15 }}>
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
