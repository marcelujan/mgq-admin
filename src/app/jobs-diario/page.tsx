"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type RunRow = {
  id: number;
  as_of_date: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  total_items: number | null;
  ok_count: number | null;
  fail_count: number | null;
  skipped_count: number | null;
  pending_count: number | null;
};

type Row = {
  run_id: number;
  offer_id: number;
  cron_status: string;
  attempts: number;
  last_error: string | null;
  processed_at: string;

  item_id: number;
  motor_id: number | null;
  presentacion: number | null;
  url_original: string;
  url_canonica: string;

  proveedor_id: number | null;
  proveedor_codigo: string | null;
  proveedor_nombre: string | null;

  actualizado: boolean;
};

function productTitleFromUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    const last = (u.pathname.split("/").filter(Boolean).pop() || "").trim();
    if (!last) return u.hostname;
    const decoded = decodeURIComponent(last);
    const cleaned = decoded
      .replace(/\.(html|htm|php)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return u.hostname;
    return cleaned
      .split(" ")
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  } catch {
    return urlStr;
  }
}

function fmtIso(dtIso: string): string {
  const d = new Date(dtIso);
  if (!Number.isFinite(d.getTime())) return dtIso;
  return new Intl.DateTimeFormat("es-AR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function JobsDiarioPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runId, setRunId] = useState<number | null>(null);
  const [run, setRun] = useState<RunRow | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      setErr(null);
      const params = new URLSearchParams();
      if (runId) params.set("run_id", String(runId));
      params.set("limit", "1000");
      const res = await fetch(`/api/jobs-diario?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.error ?? `http_${res.status}`);
        return;
      }
      const rRuns = Array.isArray(j?.runs) ? (j.runs as RunRow[]) : [];
      const rRun = (j?.run ?? null) as RunRow | null;
      const rRows = Array.isArray(j?.rows) ? (j.rows as Row[]) : [];
      setRuns(rRuns);
      setRun(rRun);
      setRows(rRows);
      if (!runId && rRuns.length) setRunId(Number(rRuns[0].id));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && String(r.cron_status).toLowerCase() !== status.toLowerCase()) return false;
      if (!qq) return true;
      const prod = productTitleFromUrl(r.url_canonica || r.url_original).toLowerCase();
      const prov = (r.proveedor_nombre || r.proveedor_codigo || "").toLowerCase();
      return (
        prod.includes(qq) ||
        prov.includes(qq) ||
        String(r.item_id).includes(qq) ||
        String(r.offer_id).includes(qq)
      );
    });
  }, [rows, q, status]);

  const statuses = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.cron_status))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", color: "rgba(255,255,255,0.92)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>Jobs diario</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
          <Link href="/" style={{ color: "inherit", opacity: 0.85 }}>
            Inicio
          </Link>
          <Link href="/items" style={{ color: "inherit", opacity: 0.85 }}>
            Items
          </Link>
          <Link href="/jobs" style={{ color: "inherit", opacity: 0.85 }}>
            Jobs manual
          </Link>
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 12, color: "#ff6b6b" }}>Error: {err}</div>
      ) : null}

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontWeight: 700, opacity: 0.9 }}>Corrida</div>
        <select
          value={runId ?? ""}
          onChange={(e) => setRunId(e.target.value ? Number(e.target.value) : null)}
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 8,
            padding: "6px 10px",
            background: "rgba(255,255,255,0.03)",
            color: "rgba(255,255,255,0.92)",
            outline: "none",
            colorScheme: "dark",
          }}
        >
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              #{r.id} · {r.as_of_date} · {r.status}
            </option>
          ))}
        </select>

        {run ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {run.started_at ? fmtIso(run.started_at) : ""}{" "}
            {run.finished_at ? `→ ${fmtIso(run.finished_at)}` : ""}
            {typeof run.total_items === "number"
              ? ` · total ${run.total_items} · ok ${run.ok_count ?? 0} · fail ${run.fail_count ?? 0}`
              : ""}
          </div>
        ) : null}

        <div style={{ flex: "1 1 280px" }} />

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar (producto, proveedor, item_id, offer_id)"
          style={{
            minWidth: 280,
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 8,
            padding: "6px 10px",
            background: "rgba(255,255,255,0.03)",
            color: "rgba(255,255,255,0.92)",
            outline: "none",
          }}
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 8,
            padding: "6px 10px",
            background: "rgba(255,255,255,0.03)",
            color: "rgba(255,255,255,0.92)",
            outline: "none",
            colorScheme: "dark",
          }}
        >
          <option value="">Estado (todos)</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div style={{ fontSize: 12, opacity: 0.75 }}>{filtered.length} filas</div>
      </div>

      <div
        style={{
          marginTop: 12,
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 12,
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.03)" }}>
                <th style={{ padding: "10px 10px", width: 140 }}>Fecha</th>
                <th style={{ padding: "10px 10px" }}>Producto</th>
                <th style={{ padding: "10px 10px", width: 160 }}>Proveedor</th>
                <th style={{ padding: "10px 10px", width: 80 }}>Motor</th>
                <th style={{ padding: "10px 10px", width: 120 }}>Presentación</th>
                <th style={{ padding: "10px 10px", width: 110 }}>Estado</th>
                <th style={{ padding: "10px 10px", width: 110 }}>Actualizado</th>
                <th style={{ padding: "10px 10px", width: 40 }}>🔗</th>
                <th style={{ padding: "10px 10px", width: 40 }}>🔍</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const url = r.url_canonica || r.url_original;
                const prod = productTitleFromUrl(url);
                const prov = r.proveedor_codigo || r.proveedor_nombre || (r.proveedor_id ? `#${r.proveedor_id}` : "");
                const showWarn = !!r.last_error;

                return (
                  <tr key={`${r.run_id}_${r.offer_id}`} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "10px 10px", opacity: 0.85, whiteSpace: "nowrap" }}>
                      {fmtIso(r.processed_at)}
                    </td>
                    <td style={{ padding: "10px 10px", maxWidth: 520 }}>
                      <div title={prod} style={{ fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {prod}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.65 }}>
                        item {r.item_id} · offer {r.offer_id}
                      </div>
                    </td>
                    <td style={{ padding: "10px 10px", opacity: 0.9 }}>{prov}</td>
                    <td style={{ padding: "10px 10px", opacity: 0.9 }}>{r.motor_id ?? "-"}</td>
                    <td style={{ padding: "10px 10px", opacity: 0.9 }}>{r.presentacion ?? "-"}</td>
                    <td style={{ padding: "10px 10px" }}>
                      <span
                        title={showWarn ? r.last_error ?? "" : ""}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(255,255,255,0.03)",
                          fontSize: 12,
                          opacity: 0.95,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.cron_status}
                        {showWarn ? <span style={{ opacity: 0.85 }}>⚠︎</span> : null}
                      </span>
                    </td>
                    <td style={{ padding: "10px 10px", opacity: 0.9 }}>{r.actualizado ? "Sí" : "No"}</td>
                    <td style={{ padding: "10px 10px", textAlign: "center" }}>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" title={url} style={{ color: "inherit", opacity: 0.9 }}>
                          🔗
                        </a>
                      ) : (
                        <span style={{ opacity: 0.35 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "center" }}>
                      <Link href={`/items/${r.item_id}`} title="Ver detalle" style={{ color: "inherit", opacity: 0.9 }}>
                        🔍
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 14, opacity: 0.75 }}>
                    Sin resultados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        Fuente: <code>pricing_daily_runs</code> + <code>pricing_daily_run_items</code> + <code>offers</code> +{" "}
        <code>item_seguimiento</code> + <code>offer_prices_daily</code>
      </div>
    </div>
  );
}
