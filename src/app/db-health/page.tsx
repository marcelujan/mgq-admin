"use client";

import { useEffect, useState } from "react";

type Health = { ok: boolean; error?: string };

export default function DbHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/db-health", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as Health | null;
      if (!r.ok || !j) throw new Error((j as any)?.error || `HTTP ${r.status}`);
      setHealth(j);
    } catch (e: any) {
      setHealth({ ok: false, error: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ok = health?.ok === true;

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>DB health</h1>

        <button
          onClick={refresh}
          disabled={loading}
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.03)",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Verificando..." : "Reverificar"}
        </button>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          padding: 14,
          background: "rgba(255,255,255,0.02)",
          display: "grid",
          gap: 10,
          maxWidth: 720,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: ok ? "rgba(80,220,120,0.95)" : "rgba(240,90,90,0.95)",
              boxShadow: "0 0 0 2px rgba(0,0,0,0.35) inset",
            }}
          />
          <div style={{ fontWeight: 700 }}>{health ? (ok ? "OK" : "FAIL") : "..."}</div>
        </div>

        {health?.error ? (
          <div style={{ fontSize: 12, opacity: 0.8, whiteSpace: "pre-wrap" }}>{health.error}</div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Endpoint: <code>/api/db-health</code>
          </div>
        )}
      </div>
    </div>
  );
}
