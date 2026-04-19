"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = { item_tipo: string; item_ref_id: string; nombre: string; label: string; uom: string | null; saldo: number | null; };
type Op = { stock_operacion_id: number; tipo: string; fecha: string; nota: string | null; movimientos_count: number; total_entradas: number; total_salidas: number; };

export default function StockSaldosClient() {
  const [tipo, setTipo] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [ops, setOps] = useState<Op[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

  const rowsFmt = useMemo(() => rows.map((r) => ({ ...r, saldo_fmt: new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(Number(r.saldo ?? 0)) })), [rows]);

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
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/stock/ingreso" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "6px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", textDecoration: "none" }}>Ingreso</Link>
          <Link href="/stock/ajuste" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "6px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", textDecoration: "none" }}>Ajuste</Link>
          <Link href="/stock/produccion" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "6px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", textDecoration: "none" }}>Producción</Link>
        </div>
      </div>

      {err ? <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,90,90,0.08)", fontSize: 12 }}>{err}</div> : null}

      <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
              <th style={{ textAlign: "left", padding: "5px 10px", width: 110, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Tipo</th>
              <th style={{ textAlign: "left", padding: "5px 10px", width: 90, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Item #</th>
              <th style={{ textAlign: "left", padding: "5px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Nombre</th>
              <th style={{ textAlign: "left", padding: "5px 10px", width: 70, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>UOM</th>
              <th style={{ textAlign: "right", padding: "5px 10px", width: 120, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Saldo</th>
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

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Operaciones recientes</div>
        <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
            <thead><tr style={{ background: "rgba(255,255,255,0.03)" }}><th style={{ textAlign: "left", padding: "5px 8px", width: 80 }}>Op #</th><th style={{ textAlign: "left", padding: "5px 8px", width: 110 }}>Tipo</th><th style={{ textAlign: "left", padding: "5px 8px", width: 170 }}>Fecha</th><th style={{ textAlign: "right", padding: "5px 8px", width: 90 }}>Mov.</th><th style={{ textAlign: "right", padding: "5px 8px", width: 110 }}>Entradas</th><th style={{ textAlign: "right", padding: "5px 8px", width: 110 }}>Salidas</th><th style={{ textAlign: "left", padding: "5px 8px" }}>Nota</th></tr></thead>
            <tbody>
              {ops.map((op) => (
                <tr key={op.stock_operacion_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{op.stock_operacion_id}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{op.tipo}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{new Date(op.fecha).toLocaleString("es-AR")}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{op.movimientos_count}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(Number(op.total_entradas ?? 0))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(Number(op.total_salidas ?? 0))}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={op.nota ?? ""}>{op.nota ?? ""}</td>
                </tr>
              ))}
              {!loading && ops.length === 0 ? <tr><td colSpan={7} style={{ padding: "8px 10px", opacity: 0.7 }}>Sin operaciones.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
