"use client";

import { useEffect, useState } from "react";
import StockMovimientoForm from "./stock-movimiento-form";
import StockProduccionForm from "./stock-produccion-form";

export default function StockOperacionEdit({ operationId }: { operationId: number }) {
  const [tipo, setTipo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setErr(null);
      try {
        const r = await fetch(`/api/stock-operaciones/${operationId}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) setTipo(String(j.operacion?.tipo ?? ""));
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [operationId]);

  if (err) return <div style={{ fontSize: 12, color: "#ffb4b4" }}>{err}</div>;
  if (!tipo) return <div style={{ fontSize: 12, opacity: 0.7 }}>Cargando...</div>;
  if (tipo === "INGRESO") return <StockMovimientoForm mode="ingreso" operationId={operationId} />;
  if (tipo === "AJUSTE") return <StockMovimientoForm mode="ajuste" operationId={operationId} />;
  if (tipo === "PRODUCCION") return <StockProduccionForm operationId={operationId} />;
  return <div style={{ fontSize: 12, opacity: 0.7 }}>Tipo no editable en esta versión.</div>;
}
