"use client";

import { useEffect, useState } from "react";

type Health = { ok: boolean; error?: string };

export default function DbHealthIndicator() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/db-health", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as Health | null;
        if (!r.ok || !j) throw new Error((j as any)?.error || `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        setHealth(j);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setHealth({ ok: false, error: String(e?.message || e) });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const ok = health?.ok === true;

  return (
    <span
      title={health ? (ok ? "DB: OK" : `DB: FAIL${health.error ? " — " + health.error : ""}`) : "DB: ..."}
      aria-label={health ? (ok ? "DB OK" : "DB FAIL") : "DB ..."}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.02)",
        fontSize: 12,
        opacity: 0.9,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: ok ? "rgba(80,220,120,0.95)" : "rgba(240,90,90,0.95)",
          boxShadow: "0 0 0 2px rgba(0,0,0,0.35) inset",
        }}
      />
      <span style={{ opacity: 0.8 }}>DB</span>
    </span>
  );
}
