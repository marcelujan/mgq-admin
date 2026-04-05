"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  mode: "new" | "edit";
  initialFecha?: string;
  initialValor?: number | null;
};

export default function FxForm({ mode, initialFecha = "", initialValor = null }: Props) {
  const router = useRouter();
  const [fecha, setFecha] = useState(initialFecha);
  const [valor, setValor] = useState(initialValor === null || initialValor === undefined ? "" : String(initialValor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const valorNum = Number(valor);
      if (!fecha) throw new Error("Fecha requerida");
      if (!Number.isFinite(valorNum) || valorNum <= 0) throw new Error("USD venta inválido");

      const url = mode === "new" ? "/api/fx" : `/api/fx/${encodeURIComponent(initialFecha)}`;
      const method = mode === "new" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, valor: valorNum }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      router.push("/dolar-historico");
      router.refresh();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14, maxWidth: 520 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <label htmlFor="fecha" style={{ fontSize: 13, opacity: 0.85 }}>Fecha</label>
        <input
          id="fecha"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          disabled={mode === "edit"}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.03)",
          }}
        />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label htmlFor="valor" style={{ fontSize: 13, opacity: 0.85 }}>USD venta</label>
        <input
          id="valor"
          type="number"
          step="0.0001"
          min="0"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.03)",
          }}
        />
      </div>

      {error ? (
        <div style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,90,90,0.24)", background: "rgba(255,90,90,0.08)", fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 12px",
            background: "rgba(255,255,255,0.03)",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dolar-historico")}
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 10,
            padding: "8px 12px",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Volver
        </button>
      </div>
    </form>
  );
}
