"use client";

import { useEffect, useMemo, useState } from "react";
import StockTargetPicker from "./stock-target-picker";

type Item = { item_tipo: any; item_ref_id: number; label?: string; nombre: string; uom: string | null; saldo?: number | null; densidad_g_ml?: number | null };

type Mode = "ingreso" | "ajuste";

function formatDateInput(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayDateInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function StockMovimientoForm({ mode, operationId }: { mode: Mode; operationId?: number }) {
  const [target, setTarget] = useState<Item | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [fecha, setFecha] = useState(todayDateInput());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!operationId);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!operationId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/stock-operaciones/${operationId}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        const op = j.operacion;
        const mov = Array.isArray(op?.movimientos) ? op.movimientos[0] : null;
        if (!mov) throw new Error("La operación no tiene movimiento editable.");
        if (!cancelled) {
          setTarget({
            item_tipo: mov.item_tipo,
            item_ref_id: Number(mov.item_ref_id),
            label: mov.label,
            nombre: mov.nombre,
            uom: mov.uom,
            saldo: mov.saldo,
            densidad_g_ml: mov.densidad_g_ml,
          });
          const rawDelta = Number(mov.delta_cantidad ?? 0);
          setCantidad(String(mode === "ingreso" ? Math.abs(rawDelta) : rawDelta));
          setFecha(formatDateInput(op?.fecha) || todayDateInput());
        }
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [operationId]);

  const quantityLabel = useMemo(() => {
    if (!target?.uom) return "";
    return target.uom;
  }, [target]);

  async function submit() {
    if (!target) {
      setErr("Seleccioná un ítem.");
      return;
    }
    if (!fecha) {
      setErr("La fecha es obligatoria.");
      return;
    }
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const body: any = {
        item_tipo: target.item_tipo,
        item_ref_id: target.item_ref_id,
        fecha: fecha || null,
      };
      if (mode === "ingreso") body.cantidad = Number(cantidad);
      else body.delta_cantidad = Number(cantidad);

      const url = operationId ? `/api/stock-operaciones/${operationId}` : `/api/stock-operaciones/${mode}`;
      if (operationId) body.tipo = mode === "ingreso" ? "INGRESO" : "AJUSTE";
      const method = operationId ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setMsg(`Operación #${j.stock_operacion_id ?? operationId} registrada.`);
      if (!operationId) setCantidad("");
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
        onChange={(item) => setTarget(item ? { ...item, label: item.label ?? item.nombre } : null)}
        label="Ítem"
        placeholder="Buscar ítem..."
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,220px) minmax(0,220px)", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{mode === "ingreso" ? "Cantidad ingresada" : "Ajuste"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
            <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder={mode === "ingreso" ? "Cantidad positiva" : "Positivo o negativo"} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }} />
            <div style={{ fontSize: 12, opacity: 0.8, minWidth: 28, textAlign: "right" }}>{quantityLabel}</div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Fecha</div>
          <input value={fecha} onChange={(e) => setFecha(e.target.value)} type="date" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }} />
        </div>
      </div>

      {err ? <div style={{ fontSize: 12, color: "#ffb4b4" }}>{err}</div> : null}
      {msg ? <div style={{ fontSize: 12, color: "#b8f2c8" }}>{msg}</div> : null}
      {loading ? <div style={{ fontSize: 12, opacity: 0.7 }}>Cargando...</div> : null}

      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <button type="button" onClick={() => void submit()} disabled={saving || loading} style={{ border: "none", background: "transparent", padding: 0, color: "inherit", cursor: saving || loading ? "default" : "pointer", fontSize: 12.5, opacity: 0.95 }}>
          {saving ? "Guardando..." : operationId ? "Guardar cambios" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
