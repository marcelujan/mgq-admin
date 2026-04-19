"use client";

import { useState } from "react";
import StockTargetPicker from "./stock-target-picker";

type Item = { item_tipo: any; item_ref_id: number; label: string; nombre: string; uom: string | null; saldo?: number | null; };
type Line = { key: string; item: Item; cantidad: string };

export default function StockProduccionForm() {
  const [output, setOutput] = useState<Item | null>(null);
  const [cantidadObtenida, setCantidadObtenida] = useState("");
  const [nota, setNota] = useState("");
  const [picker, setPicker] = useState<Item | null>(null);
  const [consumos, setConsumos] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function addConsumo() {
    if (!picker) return;
    setConsumos((prev) => [...prev, { key: `${picker.item_tipo}:${picker.item_ref_id}:${Date.now()}`, item: picker, cantidad: "1" }]);
    setPicker(null);
  }

  async function submit() {
    if (!output) { setErr("Seleccioná el formulado obtenido."); return; }
    setSaving(true); setErr(null); setMsg(null);
    try {
      const body = {
        formulado_item_formulado_id: output.item_ref_id,
        cantidad_obtenida: Number(cantidadObtenida),
        nota,
        consumos: consumos.map((x) => ({ item_tipo: x.item.item_tipo, item_ref_id: x.item.item_ref_id, cantidad: Number(x.cantidad) })),
      };
      const r = await fetch(`/api/stock-operaciones/produccion`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setMsg(`Operación #${j.stock_operacion_id} registrada.`);
      setCantidadObtenida("");
      setNota("");
      setConsumos([]);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <StockTargetPicker allowedTypes={["FORMULADO"]} value={output} onChange={setOutput} label="Formulado obtenido" />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,220px) minmax(0,1fr)", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Cantidad obtenida</div>
          <input value={cantidadObtenida} onChange={(e) => setCantidadObtenida(e.target.value)} placeholder="Cantidad positiva" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }} />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Nota</div>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Consumos reales</div>
        <StockTargetPicker allowedTypes={["MANUAL", "PROVEEDOR", "FORMULADO"]} value={picker} onChange={setPicker} label="Agregar consumo" placeholder="Buscar insumo..." />
        <div><button type="button" onClick={addConsumo} disabled={!picker} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "4px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", cursor: !picker ? "default" : "pointer" }}>+</button></div>
        <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
            <thead><tr style={{ background: "rgba(255,255,255,0.03)" }}><th style={{ textAlign: "left", padding: "5px 8px", width: 80 }}>Item #</th><th style={{ textAlign: "left", padding: "5px 8px" }}>Consumo</th><th style={{ textAlign: "right", padding: "5px 8px", width: 120 }}>Cantidad</th><th style={{ textAlign: "left", padding: "5px 8px", width: 52 }}>UOM</th><th style={{ textAlign: "left", padding: "5px 8px", width: 54 }}></th></tr></thead>
            <tbody>
              {consumos.map((line) => (
                <tr key={line.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{line.item.item_ref_id}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={line.item.label}>{line.item.label}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}><input value={line.cantidad} onChange={(e) => setConsumos((prev) => prev.map((x) => x.key === line.key ? { ...x, cantidad: e.target.value } : x))} style={{ width: 92, minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "4px 8px", background: "rgba(255,255,255,0.03)", color: "inherit", textAlign: "right" }} /></td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{line.item.uom ?? ""}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}><button type="button" onClick={() => setConsumos((prev) => prev.filter((x) => x.key !== line.key))} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: "pointer", opacity: 0.9 }}>✕</button></td>
                </tr>
              ))}
              {consumos.length === 0 ? <tr><td colSpan={5} style={{ padding: "8px", opacity: 0.7 }}>Sin consumos cargados.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {err ? <div style={{ fontSize: 12, color: "#ffb4b4" }}>{err}</div> : null}
      {msg ? <div style={{ fontSize: 12, color: "#b8f2c8" }}>{msg}</div> : null}

      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <button type="button" onClick={() => void submit()} disabled={saving} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "6px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", cursor: saving ? "default" : "pointer" }}>{saving ? "Guardando..." : "Guardar"}</button>
      </div>
    </div>
  );
}
