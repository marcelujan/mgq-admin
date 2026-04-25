"use client";

import { useEffect, useState } from "react";

type AuthStatus = {
  connected: boolean;
  auth: null | {
    site_id: string;
    user_id: number;
    nickname: string | null;
    scope: string | null;
    expires_at: string;
    connected_at: string;
    updated_at: string;
    is_active: boolean;
  };
};

export default function MercadoLibreAuthPage() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/ml/auth/status", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setStatus({ connected: !!j.connected, auth: j.auth || null });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function disconnect() {
    if (!confirm("¿Desconectar Mercado Libre?")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/ml/auth/disconnect", { method: "POST" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
  const ok = url?.searchParams.get("ok");
  const error = url?.searchParams.get("error");

  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 820 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Mercado Libre · Autenticación</h1>

      {ok ? <div style={{ fontSize: 13, color: "#86efac" }}>Cuenta conectada correctamente.</div> : null}
      {error ? <div style={{ fontSize: 13, color: "#fca5a5" }}>{error}</div> : null}

      <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Estado de conexión</div>
        {loading ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Cargando...</div>
        ) : status?.connected && status.auth ? (
          <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
            <div><strong>Conectado:</strong> Sí</div>
            <div><strong>Site:</strong> {status.auth.site_id}</div>
            <div><strong>User ID:</strong> {status.auth.user_id}</div>
            <div><strong>Nickname:</strong> {status.auth.nickname || "—"}</div>
            <div><strong>Scope:</strong> {status.auth.scope || "—"}</div>
            <div><strong>Expira:</strong> {status.auth.expires_at}</div>
          </div>
        ) : (
          <div style={{ fontSize: 13, opacity: 0.75 }}>No hay cuenta conectada.</div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            href="/api/ml/auth/start"
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13, textDecoration: "none", color: "inherit" }}
          >
            Conectar Mercado Libre
          </a>
          <button
            type="button"
            onClick={disconnect}
            disabled={!status?.connected || busy}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13, cursor: !status?.connected || busy ? "not-allowed" : "pointer", opacity: !status?.connected || busy ? 0.6 : 1 }}
          >
            Desconectar
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Variables de entorno requeridas: MELI_APP_ID, MELI_CLIENT_SECRET, MELI_REDIRECT_URI y opcionalmente MELI_USE_PKCE.
      </div>
    </div>
  );
}