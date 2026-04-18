"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type CatalogoKind = "envases" | "etiqueta" | "paqueteria";

type Row = {
  item_envase_id?: number;
  item_etiqueta_id?: number;
  item_paqueteria_id?: number;
  nombre: string | null;
  uom: string | null;
  cantidad_referencia: number | null;
  costo_ars: number | null;
  medidas?: string | null;
  activo: boolean;
};

type SortKey = "id" | "nombre" | "uom" | "cantidad_referencia" | "costo_ars" | "medidas";
type SortDir = "asc" | "desc";

const API_BASE: Record<CatalogoKind, string> = {
  envases: "/api/items-envases",
  etiqueta: "/api/items-etiqueta",
  paqueteria: "/api/items-paqueteria",
};

const DETAIL_BASE: Record<CatalogoKind, string> = {
  envases: "/items-envases",
  etiqueta: "/items-etiqueta",
  paqueteria: "/items-paqueteria",
};

function getId(kind: CatalogoKind, row: Row): number {
  if (kind === "envases") return Number(row.item_envase_id);
  if (kind === "etiqueta") return Number(row.item_etiqueta_id);
  return Number(row.item_paqueteria_id);
}

function fmtNum(n: number | null | undefined, digits: number): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n));
}

function compareText(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, "es", { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function compareNumber(a: number, b: number, dir: SortDir): number {
  const cmp = a - b;
  return dir === "asc" ? cmp : -cmp;
}

export default function CatalogoListClient({ kind }: { kind: CatalogoKind }) {
  const [search, setSearch] = useState("");
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
        if (search.trim()) qp.set("search", search.trim());
        const r = await fetch(`${API_BASE[kind]}?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (cancelled) return;
        setRows((j.items ?? []) as Row[]);
      } catch (e: any) {
        if (cancelled) return;
        setErr(String(e?.message || e));
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [kind, search]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortKey === "id") return compareNumber(getId(kind, a), getId(kind, b), sortDir);
      if (sortKey === "nombre") return compareText(a.nombre ?? "", b.nombre ?? "", sortDir);
      if (sortKey === "uom") return compareText(a.uom ?? "", b.uom ?? "", sortDir);
      if (sortKey === "cantidad_referencia") return compareNumber(Number(a.cantidad_referencia ?? Number.NEGATIVE_INFINITY), Number(b.cantidad_referencia ?? Number.NEGATIVE_INFINITY), sortDir);
      if (sortKey === "costo_ars") return compareNumber(Number(a.costo_ars ?? Number.NEGATIVE_INFINITY), Number(b.costo_ars ?? Number.NEGATIVE_INFINITY), sortDir);
      return compareText(a.medidas ?? "", b.medidas ?? "", sortDir);
    });
  }, [rows, sortKey, sortDir, kind]);

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
    const id = getId(kind, row);
    if (!Number.isFinite(id) || id <= 0) {
      setErr("ID inválido.");
      return;
    }
    const ok = confirm("Eliminar definitivamente este registro?\n\nAcción irreversible.");
    if (!ok) return;

    setErr(null);
    setDeletingId(id);
    try {
      const r = await fetch(`${API_BASE[kind]}/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setRows((prev) => prev.filter((x) => getId(kind, x) !== id));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setDeletingId(null);
    }
  }

  const thBase: CSSProperties = { textAlign: "left", padding: "5px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", lineHeight: 1.15 };
  const thButton: CSSProperties = { all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, color: "inherit" };
  const count = rows.length;
  const showMedidas = kind === "etiqueta";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none", width: 260 }}
        />
        <div style={{ fontSize: 12, opacity: 0.7 }}>{loading ? "Cargando..." : `${count} registro(s)`}</div>
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
              <th style={{ ...thBase, width: 90 }}><button type="button" onClick={() => toggleSort("id")} style={thButton}>Item #{sortLabel("id")}</button></th>
              <th style={thBase}><button type="button" onClick={() => toggleSort("nombre")} style={thButton}>Nombre{sortLabel("nombre")}</button></th>
              <th style={{ ...thBase, width: 80 }}><button type="button" onClick={() => toggleSort("uom")} style={thButton}>UOM{sortLabel("uom")}</button></th>
              <th style={{ ...thBase, textAlign: "right", width: 110 }}><button type="button" onClick={() => toggleSort("cantidad_referencia")} style={{ ...thButton, marginLeft: "auto" }}>Cantidad{sortLabel("cantidad_referencia")}</button></th>
              <th style={{ ...thBase, textAlign: "right", width: 120 }}><button type="button" onClick={() => toggleSort("costo_ars")} style={{ ...thButton, marginLeft: "auto" }}>Costo (ARS){sortLabel("costo_ars")}</button></th>
              {showMedidas ? <th style={{ ...thBase, width: 110 }}><button type="button" onClick={() => toggleSort("medidas")} style={thButton}>Medidas{sortLabel("medidas")}</button></th> : null}
              <th style={{ ...thBase, width: 90 }}>Estado</th>
              <th style={{ ...thBase, width: 120 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const id = getId(kind, r);
              return (
                <tr key={id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 10px", opacity: 0.85, fontVariantNumeric: "tabular-nums", lineHeight: 1.15, whiteSpace: "nowrap" }}>{id}</td>
                  <td style={{ padding: "5px 10px", fontWeight: 400, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.nombre ?? ""}>{r.nombre ?? ""}</td>
                  <td style={{ padding: "5px 10px", opacity: 0.85, lineHeight: 1.15, whiteSpace: "nowrap" }}>{r.uom ?? ""}</td>
                  <td style={{ padding: "5px 10px", textAlign: "right", opacity: 0.9, lineHeight: 1.15, whiteSpace: "nowrap" }}>{fmtNum(r.cantidad_referencia, 3)}</td>
                  <td style={{ padding: "5px 10px", textAlign: "right", opacity: 0.9, lineHeight: 1.15, whiteSpace: "nowrap" }}>{fmtNum(r.costo_ars, 2)}</td>
                  {showMedidas ? <td style={{ padding: "5px 10px", opacity: 0.9, lineHeight: 1.15, whiteSpace: "nowrap" }}>{r.medidas ?? ""}</td> : null}
                  <td style={{ padding: "5px 10px", opacity: 0.9, lineHeight: 1.15, whiteSpace: "nowrap" }}>{r.activo ? "Activo" : "Inactivo"}</td>
                  <td style={{ padding: "5px 10px", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                    <div style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                      <Link href={`${DETAIL_BASE[kind]}/${id}`} style={{ textDecoration: "none", opacity: 0.9 }}>Editar</Link>
                      <button type="button" onClick={() => void handleDelete(r)} disabled={deletingId === id} title="Eliminar definitivamente" style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: deletingId === id ? "default" : "pointer", opacity: deletingId === id ? 0.5 : 0.9 }}>
                        {deletingId === id ? "…" : "🗑️"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && sortedRows.length === 0 ? (
              <tr>
                <td colSpan={showMedidas ? 8 : 7} style={{ padding: "8px 10px", opacity: 0.7, lineHeight: 1.15 }}>Sin resultados.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
