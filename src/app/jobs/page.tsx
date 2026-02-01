"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type JobRow = {
  job_id: number;
  tipo: string;
  estado: string;
  prioridad: number;
  item_id: number | null;
  next_run_at: string | null;
  locked_until: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  finished_at?: string | null;

  // enriquecidos por API
  url_canonica?: string | null;
  motor_id?: number | null;
  proveedor_nombre?: string | null;
  proveedor_codigo?: string | null;

  warnings_count?: number;
  errors_count?: number;
  valid_count?: number;
  ofertas_count?: number;
};

type ItemRow = {
  item_id: number;
  url_canonica: string;
  estado: string;
};

function prettyNameFromUrl(url?: string | null) {
  if (!url) return "";
  try {
    const u = new URL(url);
    const slug = u.pathname.split("/").filter(Boolean).pop() || "";
    return slug.replace(/-/g, " ");
  } catch {
    const slug = String(url).split("/").filter(Boolean).pop() || "";
    return slug.replace(/-/g, " ");
  }
}

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default function JobsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [onlyLatestSucceeded, setOnlyLatestSucceeded] = useState(false);

  const [runningAll, setRunningAll] = useState(false);
  const [ranCount, setRanCount] = useState(0);

  // panel crear job
  const [items, setItems] = useState<ItemRow[]>([]);
  const [itemsQ, setItemsQ] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "200");
      if (onlyLatestSucceeded) {
        qs.set("latest_succeeded", "1");
      } else if (estado) {
        qs.set("estado", estado);
      }

      const res = await fetch(`/api/jobs?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e: any) {
      setErr(e?.message || "Error cargando jobs");
    } finally {
      setLoading(false);
    }
  }

  async function loadItems() {
    setItemsLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "50");
      if (itemsQ.trim()) qs.set("search", itemsQ.trim());

      const res = await fetch(`/api/items?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const list = Array.isArray(data.items) ? data.items : Array.isArray(data.rows) ? data.rows : [];
      setItems(list);
    } catch (e: any) {
      alert(e?.message || "Error cargando items");
    } finally {
      setItemsLoading(false);
    }
  }

  async function runNextClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    try {
      // IMPORTANTE: POST sin body para evitar contratos distintos entre deployments
      const res = await fetch(`/api/jobs/run-next`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await load();
    } catch (ex: any) {
      alert(ex?.message || "Error ejecutando run-next");
    }
  }

  async function runAllClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (runningAll) return;

    setRunningAll(true);
    setRanCount(0);

    const MAX = 100;
    try {
      for (let i = 0; i < MAX; i++) {
        const res = await fetch(`/api/jobs/run-next`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

        if (data.claimed === false) break;
        setRanCount((c) => c + 1);
      }
      await load();
    } catch (ex: any) {
      alert(ex?.message || "Error ejecutando run-all");
    } finally {
      setRunningAll(false);
    }
  }

  async function createJobsForSelected(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    const ids = selectedItemIds.slice();
    if (ids.length === 0) {
      alert("Seleccioná al menos un item");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: ids, prioridad: 100 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSelectedItemIds([]);
      await load();
    } catch (ex: any) {
      alert(ex?.message || "Error creando jobs");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    load();
    loadItems();
  }, []);

  useEffect(() => {
    load();
  }, [estado, onlyLatestSucceeded]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((j) => {
      const prov = `${j.proveedor_nombre || ""} ${j.proveedor_codigo || ""}`.toLowerCase();
      const url = (j.url_canonica || "").toLowerCase();
      return (
        String(j.job_id).includes(needle) ||
        (j.tipo || "").toLowerCase().includes(needle) ||
        (j.estado || "").toLowerCase().includes(needle) ||
        String(j.item_id ?? "").includes(needle) ||
        prov.includes(needle) ||
        url.includes(needle)
      );
    });
  }, [jobs, q]);

  function toggleItem(id: number) {
    setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectVisible() {
    const visible = items.map((it) => it.item_id);
    setSelectedItemIds(Array.from(new Set([...selectedItemIds, ...visible])));
  }

  function clearSelection() {
    setSelectedItemIds([]);
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", color: "rgba(255,255,255,0.92)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Jobs manual</h1>

        <button type="button" onClick={load} disabled={loading} style={{ padding: "6px 10px" }}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>

        <button type="button" onClick={runNextClick} disabled={loading || runningAll} style={{ padding: "6px 10px" }}>
          Run next job
        </button>

        <button type="button" onClick={runAllClick} disabled={loading || runningAll} style={{ padding: "6px 10px" }}>
          {runningAll ? `Run all... (${ranCount})` : "Run all pending"}
        </button>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={onlyLatestSucceeded}
            onChange={(e) => setOnlyLatestSucceeded(e.target.checked)}
          />
          Solo últimos SUCCEEDED
        </label>

        <select
          value={onlyLatestSucceeded ? "" : estado}
          onChange={(e) => setEstado(e.target.value)}
          disabled={onlyLatestSucceeded}
          style={{ padding: "6px 10px", minWidth: 180 }}
        >
          <option value="">(todos)</option>
          <option value="PENDING">PENDING</option>
          <option value="RUNNING">RUNNING</option>
          <option value="WAITING_REVIEW">WAITING_REVIEW</option>
          <option value="SUCCEEDED">SUCCEEDED</option>
          <option value="FAILED">FAILED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>

        <button type="button" onClick={load} style={{ padding: "6px 10px" }}>
          Filtrar
        </button>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por id / tipo / estado / item_id / proveedor / url"
          style={{ flex: 1, padding: "6px 10px" }}
        />
      </div>

      {err ? (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid rgba(255,80,80,0.5)", borderRadius: 10 }}>
          {err}
        </div>
      ) : null}

      {/* Panel crear job manual */}
      <div
        style={{
          marginBottom: 14,
          padding: 12,
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Crear job manual (por item_id)</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <input
            value={itemsQ}
            onChange={(e) => setItemsQ(e.target.value)}
            placeholder="Buscar items (url / proveedor / id)"
            style={{ flex: 1, padding: "8px 10px" }}
          />
          <button type="button" onClick={loadItems} disabled={itemsLoading} style={{ padding: "8px 12px" }}>
            {itemsLoading ? "Buscando..." : "Buscar"}
          </button>
          <button type="button" onClick={selectVisible} style={{ padding: "8px 12px" }}>
            Seleccionar visibles
          </button>
          <button type="button" onClick={clearSelection} disabled={selectedItemIds.length === 0} style={{ padding: "8px 12px" }}>
            Limpiar selección
          </button>
          <button
            type="button"
            onClick={createJobsForSelected}
            disabled={creating || selectedItemIds.length === 0}
            style={{ padding: "8px 12px" }}
          >
            {creating ? "Creando..." : `Crear jobs (${selectedItemIds.length})`}
          </button>
        </div>

        <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <th style={{ width: 34 }} />
                <th style={{ padding: "6px 8px" }}>item_id</th>
                <th style={{ padding: "6px 8px" }}>url</th>
                <th style={{ padding: "6px 8px" }}>estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const checked = selectedItemIds.includes(it.item_id);
                return (
                  <tr key={it.item_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleItem(it.item_id)} />
                    </td>
                    <td style={{ padding: "6px 8px" }}>{it.item_id}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <a href={it.url_canonica} target="_blank" rel="noreferrer" style={{ color: "#a6d1ff" }}>
                        {it.url_canonica}
                      </a>
                    </td>
                    <td style={{ padding: "6px 8px" }}>{it.estado}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla jobs */}
      <div style={{ overflow: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <th style={{ padding: "8px 10px" }}>job_id</th>
              <th style={{ padding: "8px 10px" }}>estado</th>
              <th style={{ padding: "8px 10px" }}>tipo</th>
              <th style={{ padding: "8px 10px" }}>artículo</th>
              <th style={{ padding: "8px 10px" }}>proveedor</th>
              <th style={{ padding: "8px 10px" }}>motor</th>
              <th style={{ padding: "8px 10px" }}>prioridad</th>
              <th style={{ padding: "8px 10px" }}>terminó</th>
              <th style={{ padding: "8px 10px" }}>warn/err</th>
              <th style={{ padding: "8px 10px" }}>locked_until</th>
              <th style={{ padding: "8px 10px" }}>last_error</th>
              <th style={{ padding: "8px 10px" }}>actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((j) => {
              const prov = j.proveedor_nombre
                ? `${j.proveedor_nombre}${j.proveedor_codigo ? ` (${j.proveedor_codigo})` : ""}`
                : "";
              const when = j.finished_at || j.updated_at || j.created_at;
              const warn = j.warnings_count ?? 0;
              const errc = j.errors_count ?? 0;

              return (
                <tr key={j.job_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "8px 10px" }}>{j.job_id}</td>
                  <td style={{ padding: "8px 10px" }}>{j.estado}</td>
                  <td style={{ padding: "8px 10px" }}>{j.tipo}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {j.url_canonica ? (
                      <a href={j.url_canonica} target="_blank" rel="noreferrer" style={{ color: "#a6d1ff" }}>
                        {prettyNameFromUrl(j.url_canonica) || `item_id: ${j.item_id ?? ""}`}
                      </a>
                    ) : (
                      <span>{`item_id: ${j.item_id ?? ""}`}</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px" }}>{prov || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{j.motor_id ?? "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{j.prioridad}</td>
                  <td style={{ padding: "8px 10px" }}>{fmtDate(when)}</td>
                  <td style={{ padding: "8px 10px" }}>{`${warn}/${errc}`}</td>
                  <td style={{ padding: "8px 10px" }}>{j.locked_until ? fmtDate(j.locked_until) : "—"}</td>
                  <td style={{ padding: "8px 10px" }} title={j.last_error || ""}>
                    {(j.last_error || "—").slice(0, 80)}
                    {(j.last_error || "").length > 80 ? "…" : ""}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {j.estado === "WAITING_REVIEW" ? (
                      <Link href={`/jobs/${j.job_id}`} style={{ color: "#a6d1ff" }}>
                        Revisar
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td style={{ padding: "12px 10px", opacity: 0.75 }} colSpan={12}>
                  {loading ? "Cargando..." : "Sin resultados"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
