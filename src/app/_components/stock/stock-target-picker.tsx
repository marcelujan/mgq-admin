"use client";

import { useEffect, useState } from "react";

type Tipo = "PROVEEDOR" | "MANUAL" | "FORMULADO" | "ENVASE" | "ETIQUETA" | "PAQUETERIA";

type Item = {
  item_tipo: Tipo;
  item_ref_id: number;
  label: string;
  nombre: string;
  uom: string | null;
  saldo?: number | null;
  costo_ref_ars?: number | null;
};

export default function StockTargetPicker({
  allowedTypes,
  value,
  onChange,
  label,
  placeholder = "Buscar...",
}: {
  allowedTypes: Tipo[];
  value: Item | null;
  onChange: (item: Item | null) => void;
  label: string;
  placeholder?: string;
}) {
  const [tipo, setTipo] = useState<Tipo>(allowedTypes[0]);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!allowedTypes.includes(tipo)) setTipo(allowedTypes[0]);
  }, [allowedTypes, tipo]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const qp = new URLSearchParams({ tipo, search });
        const r = await fetch(`/api/stock-objetivos?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) setItems((j.items ?? []) as Item[]);
      } catch (e: any) {
        if (!cancelled) {
          setItems([]);
          setErr(String(e?.message || e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [tipo, search]);

  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0,1fr)", gap: 8 }}>
        <select value={tipo} onChange={(e) => { setTipo(e.target.value as Tipo); onChange(null); }} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }}>
          {allowedTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }} />
      </div>
      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ maxHeight: 190, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 80, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Item #</th>
                <th style={{ textAlign: "left", padding: "5px 8px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Nombre</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 90, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Saldo</th>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 52, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>UOM</th>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 54, borderBottom: "1px solid rgba(255,255,255,0.08)" }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={`${it.item_tipo}:${it.item_ref_id}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{it.item_ref_id}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={it.label}>{it.label}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(Number(it.saldo ?? 0))}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{it.uom ?? ""}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}><button type="button" onClick={() => onChange(it)} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: "pointer", opacity: 0.9 }}>Elegir</button></td>
                </tr>
              ))}
              {!loading && items.length === 0 ? <tr><td colSpan={5} style={{ padding: "8px", opacity: 0.7 }}>{err ? err : "Sin resultados."}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      {value ? (
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 80 }}>Item #</th>
                <th style={{ textAlign: "left", padding: "5px 8px" }}>Seleccionado</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 90 }}>Saldo</th>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 52 }}>UOM</th>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 54 }}></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{value.item_ref_id}</td>
                <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={value.label}>{value.label}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(Number(value.saldo ?? 0))}</td>
                <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{value.uom ?? ""}</td>
                <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}><button type="button" onClick={() => onChange(null)} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: "pointer", opacity: 0.9 }}>✕</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
