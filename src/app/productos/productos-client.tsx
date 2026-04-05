"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type ProductoRow = {
  producto_id: number;
  nombre: string;
  categoria: string | null;
  densidad_producto_g_ml: number | null;
  activo: boolean;
  tiene_base: boolean;
  tiene_formula: boolean;
  updated_at: string;
};

type SortKey = "producto_id" | "nombre" | "tipo" | "densidad";
type SortDir = "asc" | "desc";

function getTipo(row: ProductoRow): string {
  return row.tiene_formula ? "Formulado" : row.tiene_base ? "Simple" : "Sin definir";
}

function compareText(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, "es", { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function compareNumber(a: number, b: number, dir: SortDir): number {
  const cmp = a - b;
  return dir === "asc" ? cmp : -cmp;
}

export default function ProductosClient() {
  const [rows, setRows] = useState<ProductoRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("producto_id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q ? rows : rows.filter((r) => (r.nombre || "").toLowerCase().includes(q));

    return [...base].sort((a, b) => {
      if (sortKey === "producto_id") return compareNumber(Number(a.producto_id), Number(b.producto_id), sortDir);
      if (sortKey === "nombre") return compareText(a.nombre || "", b.nombre || "", sortDir);
      if (sortKey === "tipo") return compareText(getTipo(a), getTipo(b), sortDir);
      return compareNumber(Number(a.densidad_producto_g_ml ?? Number.NEGATIVE_INFINITY), Number(b.densidad_producto_g_ml ?? Number.NEGATIVE_INFINITY), sortDir);
    });
  }, [rows, search, sortKey, sortDir]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/productos?limit=200&offset=0`, { cache: "no-store" });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "error");
      setRows(data.productos || []);
    } catch (e: any) {
      setError(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(key: SortKey) {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }

  function sortLabel(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  useEffect(() => {
    load();
  }, []);

  const thBase: CSSProperties = { padding: "6px 10px", opacity: 0.8, lineHeight: 1.2 };
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
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre"
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.03)",
            width: 320,
          }}
        />
        <button
          onClick={load}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          Refrescar
        </button>
        {loading ? <span style={{ fontSize: 12, opacity: 0.75 }}>Cargando...</span> : null}
        {error ? <span style={{ fontSize: 12, color: "tomato" }}>{error}</span> : null}
      </div>

      <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
              <th style={{ ...thBase, width: 90 }}>
                <button type="button" onClick={() => toggleSort("producto_id")} style={thButton}>Item #{sortLabel("producto_id")}</button>
              </th>
              <th style={thBase}>
                <button type="button" onClick={() => toggleSort("nombre")} style={thButton}>Nombre{sortLabel("nombre")}</button>
              </th>
              <th style={{ ...thBase, width: 140 }}>
                <button type="button" onClick={() => toggleSort("tipo")} style={thButton}>Tipo{sortLabel("tipo")}</button>
              </th>
              <th style={{ ...thBase, width: 130 }}>
                <button type="button" onClick={() => toggleSort("densidad")} style={thButton}>Densidad{sortLabel("densidad")}</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const tipo = getTipo(r);
              const idNum = Number((r as any).producto_id);
              const idOk = Number.isFinite(idNum);

              return (
                <tr key={String((r as any).producto_id)} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: "6px 10px", opacity: 0.85, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
                    {String((r as any).producto_id)}
                    {!idOk ? <span style={{ color: "tomato" }}> (ID inválido)</span> : null}
                  </td>
                  <td style={{ padding: "6px 10px", lineHeight: 1.2 }}>
                    {idOk ? (
                      <Link href={`/productos/${idNum}`} style={{ textDecoration: "underline" }}>
                        {r.nombre}
                      </Link>
                    ) : (
                      <span>{r.nombre}</span>
                    )}
                  </td>
                  <td style={{ padding: "6px 10px", lineHeight: 1.2 }}>{tipo}</td>
                  <td style={{ padding: "6px 10px", lineHeight: 1.2 }}>{r.densidad_producto_g_ml ?? "-"}</td>
                </tr>
              );
            })}
            {!filtered.length ? (
              <tr>
                <td colSpan={4} style={{ padding: "8px 10px", opacity: 0.75, lineHeight: 1.2 }}>
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
