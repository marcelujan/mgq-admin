"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = { item_tipo: string; item_ref_id: string; nombre: string; label: string; uom: string | null; saldo: number | null; };
type Op = { stock_operacion_id: number; tipo: string; fecha: string; nota: string | null; movimientos_count: number; total_entradas: number; total_salidas: number; };
type RowSortBy = "item_tipo" | "item_ref_id" | "nombre" | "uom" | "saldo";
type SortDir = "asc" | "desc";
type OpSortBy = "stock_operacion_id" | "tipo" | "fecha" | "movimientos_count" | "total_entradas" | "total_salidas";

function sortArrow(active: boolean, dir: SortDir) {
  if (!active) return "";
  return dir === "asc" ? " ▲" : " ▼";
}

export default function StockSaldosClient() {
  const [tipo, setTipo] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [ops, setOps] = useState<Op[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<RowSortBy>("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [opSortBy, setOpSortBy] = useState<OpSortBy>("fecha");
  const [opSortDir, setOpSortDir] = useState<SortDir>("desc");

  function toggleSort(next: RowSortBy) {
    setSortBy((prev) => {
      if (prev === next) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return next;
    });
  }

  function toggleOpSort(next: OpSortBy) {
    setOpSortBy((prev) => {
      if (prev === next) {
        setOpSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setOpSortDir(next === "fecha" ? "desc" : "asc");
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setErr(null);
      try {
        const qp = new URLSearchParams();
        if (tipo) qp.set("tipo", tipo);
        if (search.trim()) qp.set("search", search.trim());
        const r = await fetch(`/api/stock-saldos?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) {
          setRows((j.rows ?? []) as Row[]);
          setOps((j.recientes ?? []) as Op[]);
        }
      } catch (e: any) {
        if (!cancelled) { setErr(String(e?.message || e)); setRows([]); setOps([]); }
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [tipo, search]);

  const rowsFmt = useMemo(() => {
    const copy = rows.map((r) => ({ ...r, saldo_fmt: new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(Number(r.saldo ?? 0)) }));
    copy.sort((a, b) => {
      const av: any = sortBy === "saldo" ? Number(a.saldo ?? 0) : sortBy === "item_ref_id" ? Number(a.item_ref_id) : String((a as any)[sortBy] ?? "").toLocaleLowerCase();
      const bv: any = sortBy === "saldo" ? Number(b.saldo ?? 0) : sortBy === "item_ref_id" ? Number(b.item_ref_id) : String((b as any)[sortBy] ?? "").toLocaleLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortBy, sortDir]);

  const opsFmt = useMemo(() => {
    const copy = [...ops];
    copy.sort((a, b) => {
      const av: any = opSortBy === "fecha" ? new Date(a.fecha).getTime() : opSortBy === "stock_operacion_id" || opSortBy === "movimientos_count" || opSortBy === "total_entradas" || opSortBy === "total_salidas" ? Number((a as any)[opSortBy] ?? 0) : String((a as any)[opSortBy] ?? "").toLocaleLowerCase();
      const bv: any = opSortBy === "fecha" ? new Date(b.fecha).getTime() : opSortBy === "stock_operacion_id" || opSortBy === "movimientos_count" || opSortBy === "total_entradas" || opSortBy === "total_salidas" ? Number((b as any)[opSortBy] ?? 0) : String((b as any)[opSortBy] ?? "").toLocaleLowerCase();
      if (av < bv) return opSortDir === "asc" ? -1 : 1;
      if (av > bv) return opSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [ops, opSortBy, opSortDir]);


  async function deleteOperacion(stock_operacion_id: number) {
    const ok = window.confirm(`Eliminar operación #${stock_operacion_id}?`);
    if (!ok) return;
    setDeletingId(stock_operacion_id);
    setErr(null);
    try {
      const r = await fetch(`/api/stock-operaciones/${stock_operacion_id}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setOps((prev) => prev.filter((x) => x.stock_operacion_id !== stock_operacion_id));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setDeletingId((curr) => (curr === stock_operacion_id ? null : curr));
    }
  }

  const actionLink: React.CSSProperties = { textDecoration: "none", color: "inherit", fontSize: 12, opacity: 0.92, whiteSpace: "nowrap" };
  const thButton = (active: boolean): React.CSSProperties => ({ cursor: "pointer", userSelect: "none", textDecoration: active ? "underline" : "none", textUnderlineOffset: 3 });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }}>
          <option value="">Todos</option>
          <option value="MANUAL">Manual</option>
          <option value="PROVEEDOR">Proveedor</option>
          <option value="FORMULADO">Formulado</option>
          <option value="ENVASE">Envase</option>
          <option value="ETIQUETA">Etiqueta</option>
          <option value="PAQUETERIA">Paquetería</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", outline: "none", width: 260 }} />
        <div style={{ fontSize: 12, opacity: 0.7 }}>{loading ? "Cargando..." : `${rows.length} saldo(s)`}</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/stock/ingreso" style={actionLink}>Ingreso</Link>
          <Link href="/stock/ajuste" style={actionLink}>Ajuste</Link>
          <Link href="/stock/produccion" style={actionLink}>Producción</Link>
        </div>
      </div>

      {err ? <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,90,90,0.08)", fontSize: 12 }}>{err}</div> : null}

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ maxHeight: 34 + 6 * 29, overflowY: "auto", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
              <th onClick={() => toggleSort("item_tipo")} style={{ textAlign: "left", padding: "5px 10px", width: 110, borderBottom: "1px solid rgba(255,255,255,0.08)", ...thButton(sortBy === "item_tipo") }}>Tipo{sortArrow(sortBy === "item_tipo", sortDir)}</th>
              <th onClick={() => toggleSort("item_ref_id")} style={{ textAlign: "left", padding: "5px 10px", width: 90, borderBottom: "1px solid rgba(255,255,255,0.08)", ...thButton(sortBy === "item_ref_id") }}>Item #{sortArrow(sortBy === "item_ref_id", sortDir)}</th>
              <th onClick={() => toggleSort("nombre")} style={{ textAlign: "left", padding: "5px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", ...thButton(sortBy === "nombre") }}>Nombre{sortArrow(sortBy === "nombre", sortDir)}</th>
              <th onClick={() => toggleSort("uom")} style={{ textAlign: "left", padding: "5px 10px", width: 70, borderBottom: "1px solid rgba(255,255,255,0.08)", ...thButton(sortBy === "uom") }}>UOM{sortArrow(sortBy === "uom", sortDir)}</th>
              <th onClick={() => toggleSort("saldo")} style={{ textAlign: "right", padding: "5px 10px", width: 120, borderBottom: "1px solid rgba(255,255,255,0.08)", ...thButton(sortBy === "saldo") }}>Saldo{sortArrow(sortBy === "saldo", sortDir)}</th>
            </tr>
          </thead>
          <tbody>
            {rowsFmt.map((r) => (
              <tr key={`${r.item_tipo}:${r.item_ref_id}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>{r.item_tipo}</td>
                <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>{r.item_ref_id}</td>
                <td style={{ padding: "5px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.label}>{r.label}</td>
                <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>{r.uom ?? ""}</td>
                <td style={{ padding: "5px 10px", textAlign: "right", whiteSpace: "nowrap" }}>{r.saldo_fmt}</td>
              </tr>
            ))}
            {!loading && rowsFmt.length === 0 ? <tr><td colSpan={5} style={{ padding: "8px 10px", opacity: 0.7 }}>Sin resultados.</td></tr> : null}
          </tbody>
        </table>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>Operaciones recientes</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Esta tabla muestra solo un tramo reciente ordenado por fecha. El historial completo conviene llevarlo luego a una hoja aparte.</div>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ maxHeight: 34 + 6 * 29, overflowY: "auto", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <th onClick={() => toggleOpSort("stock_operacion_id")} style={{ textAlign: "left", padding: "5px 8px", width: 80, ...thButton(opSortBy === "stock_operacion_id") }}>Op #{sortArrow(opSortBy === "stock_operacion_id", opSortDir)}</th>
                <th onClick={() => toggleOpSort("tipo")} style={{ textAlign: "left", padding: "5px 8px", width: 110, ...thButton(opSortBy === "tipo") }}>Tipo{sortArrow(opSortBy === "tipo", opSortDir)}</th>
                <th onClick={() => toggleOpSort("fecha")} style={{ textAlign: "left", padding: "5px 8px", width: 170, ...thButton(opSortBy === "fecha") }}>Fecha{sortArrow(opSortBy === "fecha", opSortDir)}</th>
                <th onClick={() => toggleOpSort("movimientos_count")} style={{ textAlign: "right", padding: "5px 8px", width: 90, ...thButton(opSortBy === "movimientos_count") }}>Mov.{sortArrow(opSortBy === "movimientos_count", opSortDir)}</th>
                <th onClick={() => toggleOpSort("total_entradas")} style={{ textAlign: "right", padding: "5px 8px", width: 110, ...thButton(opSortBy === "total_entradas") }}>Entradas{sortArrow(opSortBy === "total_entradas", opSortDir)}</th>
                <th onClick={() => toggleOpSort("total_salidas")} style={{ textAlign: "right", padding: "5px 8px", width: 110, ...thButton(opSortBy === "total_salidas") }}>Salidas{sortArrow(opSortBy === "total_salidas", opSortDir)}</th>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 72 }}></th>
              </tr>
            </thead>
            <tbody>
              {opsFmt.map((op) => (
                <tr key={op.stock_operacion_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{op.stock_operacion_id}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{op.tipo}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{new Date(op.fecha).toLocaleString("es-AR")}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{op.movimientos_count}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(Number(op.total_entradas ?? 0))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(Number(op.total_salidas ?? 0))}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Link href={`/stock/operaciones/${op.stock_operacion_id}`} title="Editar" style={{ textDecoration: "none", color: "inherit", fontSize: 12.5 }}>✏️</Link>
                      <button
                        type="button"
                        title="Eliminar"
                        onClick={() => void deleteOperacion(op.stock_operacion_id)}
                        disabled={deletingId === op.stock_operacion_id}
                        style={{ border: "none", background: "transparent", color: "inherit", padding: 0, cursor: deletingId === op.stock_operacion_id ? "default" : "pointer", fontSize: 12.5, opacity: deletingId === op.stock_operacion_id ? 0.5 : 0.9 }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && opsFmt.length === 0 ? <tr><td colSpan={7} style={{ padding: "8px 10px", opacity: 0.7 }}>Sin operaciones.</td></tr> : null}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
