"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type Row = {
  item_comercial_id: number;
  nombre: string | null;
  descripcion?: string | null;
  cantidad: number | null;
  unidad: string | null;
  activo: boolean;
  origen_tipo: string | null;
  origen_id: number | null;
  origen_label: string | null;
};

type SortKey = "item_comercial_id" | "nombre" | "cantidad" | "unidad" | "origen_label";
type SortDir = "asc" | "desc";

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(Number(n));
}

function compareText(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, "es", { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function compareNumber(a: number, b: number, dir: SortDir): number {
  const cmp = a - b;
  return dir === "asc" ? cmp : -cmp;
}

export default function ItemsComercialesClient() {
  const [search, setSearch] = useState("");
  const [includeInactivos, setIncludeInactivos] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const qp = new URLSearchParams();
        qp.set("include_inactivos", includeInactivos ? "true" : "false");
        if (search.trim()) qp.set("search", search.trim());

        const r = await fetch(`/api/items-comerciales?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) setRows((j.items ?? []) as Row[]);
      } catch (e: any) {
        if (!cancelled) {
          setErr(String(e?.message || e));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [search, includeInactivos]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortKey === "item_comercial_id") return compareNumber(Number(a.item_comercial_id), Number(b.item_comercial_id), sortDir);
      if (sortKey === "nombre") return compareText(a.nombre ?? "", b.nombre ?? "", sortDir);
      if (sortKey === "cantidad") return compareNumber(Number(a.cantidad ?? Number.NEGATIVE_INFINITY), Number(b.cantidad ?? Number.NEGATIVE_INFINITY), sortDir);
      if (sortKey === "unidad") return compareText(a.unidad ?? "", b.unidad ?? "", sortDir);
      return compareText(a.origen_label ?? "", b.origen_label ?? "", sortDir);
    });
  }, [rows, sortKey, sortDir]);

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

  async function handleDelete(row: Row) {
    const id = Number(row.item_comercial_id);
    if (!Number.isFinite(id) || id <= 0) {
      setErr("ID inválido.");
      return;
    }
    const ok = confirm(`Eliminar definitivamente este ITEM COMERCIAL?\n\nAcción irreversible.`);
    if (!ok) return;

    setErr(null);
    setDeletingId(id);
    try {
      const r = await fetch(`/api/items-comerciales/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setRows((prev) => prev.filter((x) => Number(x.item_comercial_id) !== id));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setDeletingId(null);
    }
  }

  const thBase: CSSProperties = { textAlign: "left", padding: "5px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", lineHeight: 1.15 };
  const thButton: CSSProperties = { all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, color: "inherit" };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none", width: 260 }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.85 }}>
          <input type="checkbox" checked={includeInactivos} onChange={(e) => setIncludeInactivos(e.target.checked)} /> Incluir inactivos
        </label>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{loading ? "Cargando..." : `${rows.length} item(s)`}</div>
      </div>

      {err ? (
        <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,90,90,0.08)" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
          <div style={{ fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>{err}</div>
        </div>
      ) : null}

      <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
              <th style={{ ...thBase, width: 90 }}><button type="button" onClick={() => toggleSort("item_comercial_id")} style={thButton}>Item #{sortLabel("item_comercial_id")}</button></th>
              <th style={thBase}><button type="button" onClick={() => toggleSort("nombre")} style={thButton}>Nombre{sortLabel("nombre")}</button></th>
              <th style={{ ...thBase, textAlign: "right", width: 120 }}><button type="button" onClick={() => toggleSort("cantidad")} style={{ ...thButton, marginLeft: "auto" }}>Cantidad{sortLabel("cantidad")}</button></th>
              <th style={{ ...thBase, width: 70 }}><button type="button" onClick={() => toggleSort("unidad")} style={thButton}>UOM{sortLabel("unidad")}</button></th>
              <th style={{ ...thBase, width: 250 }}><button type="button" onClick={() => toggleSort("origen_label")} style={thButton}>Origen{sortLabel("origen_label")}</button></th>
              <th style={{ ...thBase, width: 80 }}>Estado</th>
              <th style={{ ...thBase, width: 120 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.item_comercial_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "5px 10px", opacity: 0.85, fontVariantNumeric: "tabular-nums", lineHeight: 1.15, whiteSpace: "nowrap" }}>{r.item_comercial_id}</td>
                <td style={{ padding: "5px 10px", fontWeight: 400, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.nombre ?? ""}>{r.nombre ?? ""}</td>
                <td style={{ padding: "5px 10px", textAlign: "right", opacity: 0.9, lineHeight: 1.15, whiteSpace: "nowrap" }}>{fmtNum(r.cantidad)}</td>
                <td style={{ padding: "5px 10px", opacity: 0.85, lineHeight: 1.15, whiteSpace: "nowrap" }}>{r.unidad ?? ""}</td>
                <td style={{ padding: "5px 10px", opacity: 0.85, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.origen_label ?? ""}>{r.origen_label ?? ""}</td>
                <td style={{ padding: "5px 10px", opacity: 0.9, lineHeight: 1.15, whiteSpace: "nowrap" }}>{r.activo ? "Activo" : "Inactivo"}</td>
                <td style={{ padding: "5px 10px", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                  <div style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                    <Link href={`/items-comerciales/${r.item_comercial_id}`} style={{ textDecoration: "none", opacity: 0.9 }}>Editar</Link>
                    <button type="button" onClick={() => void handleDelete(r)} disabled={deletingId === r.item_comercial_id} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: deletingId === r.item_comercial_id ? "default" : "pointer", opacity: deletingId === r.item_comercial_id ? 0.5 : 0.9 }}>
                      {deletingId === r.item_comercial_id ? "…" : "🗑️"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && sortedRows.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "8px 10px", opacity: 0.7, lineHeight: 1.15 }}>Sin resultados.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
