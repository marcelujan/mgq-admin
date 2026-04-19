"use client";

import { useState } from "react";
import StockTargetPicker from "./stock-target-picker";

type Item = { item_tipo: any; item_ref_id: number; label: string; nombre: string; uom: string | null; saldo?: number | null; };

export default function StockMovimientoForm({ mode }: { mode: "ingreso" | "ajuste" }) {
  const [target, setTarget] = useState<Item | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!target) { setErr("Seleccioná un ítem."); return; }
    setSaving(true); setErr(null); setMsg(null);
    try {
      const body: any = { item_tipo: target.item_tipo, item_ref_id: target.item_ref_id, nota };
      if (mode === "ingreso") body.cantidad = Number(cantidad);
      else body.delta_cantidad = Number(cantidad);
      const r = await fetch(`/api/stock-operaciones/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setMsg(`Operación #${j.stock_operacion_id} registrada.`);
      setCantidad("");
      setNota("");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <StockTargetPicker
        allowedTypes={["MANUAL", "PROVEEDOR", "FORMULADO", "ENVASE", "ETIQUETA", "PAQUETERIA"]}
        value={target}
        onChange={setTarget}
        label="Ítem"
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,220px) minmax(0,1fr)", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{mode === "ingreso" ? "Cantidad" : "Delta (+/-)"}</div>
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder={mode === "ingreso" ? "Cantidad positiva" : "Ej: -3 o 5"} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }} />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Nota</div>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }} />
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
