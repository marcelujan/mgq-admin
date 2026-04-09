"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type CostOption = {
  cost_option_id: number;
  tipo: string;
  manual_nombre: string | null;
  manual_uom: string | null;
  manual_cantidad: number | null;
  manual_costo_ars: number | null;
  densidad_g_ml: number | null;
  activo: boolean;
};

type SortKey = "cost_option_id" | "manual_nombre" | "manual_uom" | "manual_cantidad" | "manual_costo_ars" | "densidad_g_ml";
type SortDir = "asc" | "desc";

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

export default function ManualesClient() {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CostOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("manual_nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const qp = new URLSearchParams();
        qp.set("solo_seleccionados", "false");
        qp.set("limit", "800");
        if (search.trim()) qp.set("search", search.trim());

        const r = await fetch(`/api/cost-options?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

        const all = (j.cost_options_extra ?? []) as CostOption[];
        const manuales = all.filter((x) => x.tipo === "MANUAL_PRESENTACION" && x.activo === true);
        if (cancelled) return;
        setRows(manuales);
      } catch (e: any) {
        if (cancelled) return;
        setErr(String(e?.message || e));
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [search]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortKey === "cost_option_id") return compareNumber(Number(a.cost_option_id), Number(b.cost_option_id), sortDir);
      if (sortKey === "manual_nombre") return compareText(a.manual_nombre ?? "", b.manual_nombre ?? "", sortDir);
      if (sortKey === "manual_uom") return compareText(a.manual_uom ?? "", b.manual_uom ?? "", sortDir);
      if (sortKey === "manual_cantidad") return compareNumber(Number(a.manual_cantidad ?? Number.NEGATIVE_INFINITY), Number(b.manual_cantidad ?? Number.NEGATIVE_INFINITY), sortDir);
      if (sortKey === "manual_costo_ars") return compareNumber(Number(a.manual_costo_ars ?? Number.NEGATIVE_INFINITY), Number(b.manual_costo_ars ?? Number.NEGATIVE_INFINITY), sortDir);
      return compareNumber(Number(a.densidad_g_ml ?? Number.NEGATIVE_INFINITY), Number(b.densidad_g_ml ?? Number.NEGATIVE_INFINITY), sortDir);
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

  async function handleDelete(row: CostOption) {
    const id = Number(row.cost_option_id);
    if (!Number.isFinite(id) || id <= 0) {
      setErr("ID inválido.");
      return;
    }

    const ok = confirm(
      `Eliminar definitivamente este ITEM MANUAL?\n\n` +
        `Esto borra: cost_option MANUAL_PRESENTACION y snapshots históricos asociados.\n` +
        `Acción irreversible.`
    );
    if (!ok) return;

    setErr(null);
    setDeletingId(id);
    try {
      const r = await fetch(`/api/items/${encodeURIComponent(`mopt:${id}`)}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        if (r.status === 409 && j?.error === "manual_item_in_use") {
          const count = Number(j?.details?.formula_lineas_v2_count ?? 0);
          throw new Error(`No se puede eliminar: el item manual está usado en ${count} línea(s) de fórmula.`);
        }
        throw new Error(j?.error || `HTTP ${r.status}`);
      }

      setRows((prev) => prev.filter((x) => Number(x.cost_option_id) !== id));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setDeletingId(null);
    }
  }

  const count = rows.length;

  const headerRight = useMemo(() => {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.03)",
            color: "rgba(255,255,255,0.92)",
            outline: "none",
            width: 260,
          }}
        />
        <div style={{ fontSize: 12, opacity: 0.7 }}>{loading ? "Cargando..." : `${count} manual(es)`}</div>
      </div>
    );
  }, [search, loading, count]);

  const thBase: CSSProperties = { textAlign: "left", padding: "5px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", lineHeight: 1.15 };
  const thButton: CSSProperties = { all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, color: "inherit" };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12, flexWrap: "wrap" }}>
        {headerRight}
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
              <th style={{ ...thBase, width: 90 }}><button type="button" onClick={() => toggleSort("cost_option_id")} style={thButton}>Item #{sortLabel("cost_option_id")}</button></th>
              <th style={thBase}><button type="button" onClick={() => toggleSort("manual_nombre")} style={thButton}>Nombre{sortLabel("manual_nombre")}</button></th>
              <th style={{ ...thBase, width: 90 }}><button type="button" onClick={() => toggleSort("manual_uom")} style={thButton}>UOM{sortLabel("manual_uom")}</button></th>
              <th style={{ ...thBase, textAlign: "right", width: 110 }}><button type="button" onClick={() => toggleSort("manual_cantidad")} style={{ ...thButton, marginLeft: 'auto' }}>Cantidad{sortLabel("manual_cantidad")}</button></th>
              <th style={{ ...thBase, textAlign: "right", width: 120 }}><button type="button" onClick={() => toggleSort("manual_costo_ars")} style={{ ...thButton, marginLeft: 'auto' }}>Costo (ARS){sortLabel("manual_costo_ars")}</button></th>
              <th style={{ ...thBase, textAlign: "right", width: 110 }}><button type="button" onClick={() => toggleSort("densidad_g_ml")} style={{ ...thButton, marginLeft: 'auto' }}>Densidad{sortLabel("densidad_g_ml")}</button></th>
              <th style={{ ...thBase, width: 120 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.cost_option_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "5px 10px", opacity: 0.85, fontVariantNumeric: "tabular-nums", lineHeight: 1.15, whiteSpace: "nowrap" }}>{r.cost_option_id}</td>
                <td style={{ padding: "5px 10px", fontWeight: 400, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.manual_nombre ?? ""}>{r.manual_nombre ?? ""}</td>
                <td style={{ padding: "5px 10px", opacity: 0.85, lineHeight: 1.15, whiteSpace: "nowrap" }}>{r.manual_uom ?? ""}</td>
                <td style={{ padding: "5px 10px", textAlign: "right", opacity: 0.9, lineHeight: 1.15, whiteSpace: "nowrap" }}>{fmtNum(r.manual_cantidad, 2)}</td>
                <td style={{ padding: "5px 10px", textAlign: "right", opacity: 0.9, lineHeight: 1.15, whiteSpace: "nowrap" }}>{fmtNum(r.manual_costo_ars, 2)}</td>
                <td style={{ padding: "5px 10px", textAlign: "right", opacity: 0.9, lineHeight: 1.15, whiteSpace: "nowrap" }}>{fmtNum(r.densidad_g_ml, 3)}</td>
                <td style={{ padding: "5px 10px", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                  <div style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                    <Link
                      href={`/items/${encodeURIComponent(`mopt:${r.cost_option_id}`)}`}
                      style={{ textDecoration: "none", opacity: 0.9 }}
                      title="Ver detalle (gráficos) en Items"
                    >
                      Ver
                    </Link>
                    <Link href={`/items-manuales/${r.cost_option_id}`} style={{ textDecoration: "none", opacity: 0.9 }} title="Editar manual">
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDelete(r)}
                      disabled={deletingId === r.cost_option_id}
                      title="Eliminar definitivamente"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        color: "inherit",
                        cursor: deletingId === r.cost_option_id ? "default" : "pointer",
                        opacity: deletingId === r.cost_option_id ? 0.5 : 0.9,
                      }}
                    >
                      {deletingId === r.cost_option_id ? "…" : "🗑️"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && sortedRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "8px 10px", opacity: 0.7, lineHeight: 1.15 }}>
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
