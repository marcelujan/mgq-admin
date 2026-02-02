"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const r = useRouter();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setError(null);
    try {
      const resp = await fetch("/api/productos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const j = await resp.json();
      if (!j.ok) throw new Error(j.error || "error");
      r.push(`/productos/${j.producto_id}`);
    } catch (e: any) {
      setError(e?.message ?? "error");
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginTop: 0 }}>Crear producto</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" style={{ width: 320 }} />
        <button onClick={crear} disabled={!nombre.trim()}>
          Crear
        </button>
      </div>
      {error && <div style={{ marginTop: 10, color: "crimson" }}>{error}</div>}
    </div>
  );
}
