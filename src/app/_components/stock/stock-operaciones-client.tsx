"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Op = { stock_operacion_id: number; tipo: string; fecha: string; nota: string | null; referencia_externa: string | null; movimientos_count: number; total_entradas: number; total_salidas: number; };
type SortBy = "stock_operacion_id" | "tipo" | "fecha" | "movimientos_count" | "total_entradas" | "total_salidas";
type SortDir = "asc" | "desc";

function sortArrow(active: boolean, dir: SortDir) {
  if (!active) return "";
  return dir === "asc" ? " ▲" : " ▼";
}

export default function StockOperacionesClient() {
  const [tipo, setTipo] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rows, setRows] = useState<Op[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("fecha");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(next: SortBy) {
    setSortBy((prev) => {
      if (prev === next) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(next === "fecha" ? "desc" : "asc");
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const qp = new URLSearchParams();
        if (tipo) qp.set("tipo", tipo);
        if (search.trim()) qp.set("search", search.trim());
        if (fromDate) qp.set("from", fromDate);
        if (toDate) qp.set("to", toDate);
        qp.set("limit", "500");
        const r = await fetch(`/api/stock-operaciones?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) setRows((j.items ?? []) as Op[]);
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
    return () => { cancelled = true; };
  }, [tipo, search, fromDate, toDate]);

  async function removeOp(id: number) {
    if (!window.confirm(`¿Eliminar operación #${id}?`)) return;
    try {
      const r = await fetch(`/api/stock-operaciones/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setRows((prev) => prev.filter((x) => x.stock_operacion_id !== id));
    } catch (e: any) {
      window.alert(String(e?.message || e));
    }
  }

  const rowsFmt = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av: any = sortBy === "fecha" ? new Date(a.fecha).getTime() : ["stock_operacion_id","movimientos_count","total_entradas","total_salidas"].includes(sortBy) ? Number((a as any)[sortBy] ?? 0) : String((a as any)[sortBy] ?? "").toLocaleLowerCase();
      const bv: any = sortBy === "fecha" ? new Date(b.fecha).getTime() : ["stock_operacion_id","movimientos_count","total_entradas","total_salidas"].includes(sortBy) ? Number((b as any)[sortBy] ?? 0) : String((b as any)[sortBy] ?? "").toLocaleLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortBy, sortDir]);

  const thButton = (active: boolean): React.CSSProperties => ({ cursor: "pointer", userSelect: "none", textDecoration: active ? "underline" : "none", textUnderlineOffset: 3 });
  const actionLink: React.CSSProperties = { textDecoration: "none", color: "inherit", fontSize: 12, opacity: 0.92, whiteSpace: "nowrap" };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }}>
          <option value="">Todos</option>
          <option value="INGRESO">Ingreso</option>
          <option value="AJUSTE">Ajuste</option>
          <option value="PRODUCCION">Producción</option>
          <option value="VENTA">Venta</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en op #, nota o referencia..." style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", outline: "none", width: 280 }} />
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", outline: "none" }} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", outline: "none" }} />
        <div style={{ fontSize: 12, opacity: 0.7 }}>{loading ? "Cargando..." : `${rows.length} operación(es)`}</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/stock" style={actionLink}>Volver a Stock</Link>
        </div>
      </div>

      {err ? <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,90,90,0.08)", fontSize: 12 }}>{err}</div> : null}

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <th onClick={() => toggleSort("stock_operacion_id")} style={{ textAlign: "left", padding: "5px 8px", width: 80, ...thButton(sortBy === "stock_operacion_id") }}>Op #{sortArrow(sortBy === "stock_operacion_id", sortDir)}</th>
                <th onClick={() => toggleSort("tipo")} style={{ textAlign: "left", padding: "5px 8px", width: 110, ...thButton(sortBy === "tipo") }}>Tipo{sortArrow(sortBy === "tipo", sortDir)}</th>
                <th onClick={() => toggleSort("fecha")} style={{ textAlign: "left", padding: "5px 8px", width: 120, ...thButton(sortBy === "fecha") }}>Fecha{sortArrow(sortBy === "fecha", sortDir)}</th>
                <th style={{ textAlign: "left", padding: "5px 8px" }}>Nota / Referencia</th>
                <th onClick={() => toggleSort("movimientos_count")} style={{ textAlign: "right", padding: "5px 8px", width: 80, ...thButton(sortBy === "movimientos_count") }}>Mov.{sortArrow(sortBy === "movimientos_count", sortDir)}</th>
                <th onClick={() => toggleSort("total_entradas")} style={{ textAlign: "right", padding: "5px 8px", width: 100, ...thButton(sortBy === "total_entradas") }}>Entradas{sortArrow(sortBy === "total_entradas", sortDir)}</th>
                <th onClick={() => toggleSort("total_salidas")} style={{ textAlign: "right", padding: "5px 8px", width: 100, ...thButton(sortBy === "total_salidas") }}>Salidas{sortArrow(sortBy === "total_salidas", sortDir)}</th>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 56 }}></th>
              </tr>
            </thead>
            <tbody>
              {rowsFmt.map((op) => (
                <tr key={op.stock_operacion_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{op.stock_operacion_id}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{op.tipo}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{new Date(op.fecha).toLocaleDateString("es-AR")}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={[op.nota, op.referencia_externa].filter(Boolean).join(" · ")}>
                    {[op.nota, op.referencia_externa].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{op.movimientos_count}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(Number(op.total_entradas ?? 0))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(Number(op.total_salidas ?? 0))}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Link href={`/stock/operaciones/${op.stock_operacion_id}`} style={{ textDecoration: "none", color: "inherit", fontSize: 12.5 }}>✏️</Link>
                      <button type="button" onClick={() => removeOp(op.stock_operacion_id)} style={{ border: "none", background: "transparent", padding: 0, color: "inherit", cursor: "pointer", fontSize: 12.5 }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rowsFmt.length === 0 ? <tr><td colSpan={8} style={{ padding: "8px 10px", opacity: 0.7 }}>Sin operaciones.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
