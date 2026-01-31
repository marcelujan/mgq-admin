"use client";

import { useEffect, useMemo, useState } from "react";

type JobRow = {
  job_id: number;
  estado: string;
  tipo: string;
  item_id: number | null;
  prioridad: number;
  next_run_at: string | null;
  locked_until: string | null;
  last_error: string | null;
};

type ItemRow = {
  item_id: number;
  url: string;
  estado: string;
};

function fmtIso(dtIso: string | null): string {
  if (!dtIso) return "";
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

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function loadJobs() {
    setErr(null);
    const res = await fetch("/api/jobs", { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "error");
      return;
    }
    setJobs(j.rows ?? []);
  }

  async function searchItems() {
    const res = await fetch(`/api/items?search=${encodeURIComponent(search)}&limit=50`, {
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    setItems(Array.isArray(j?.rows) ? j.rows : []);
  }

  async function createJobs() {
    if (selected.size === 0) return;
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item_ids: Array.from(selected) }),
    });
    setSelected(new Set());
    await loadJobs();
  }

  async function runNext() {
    await fetch("/api/jobs/run-next", { method: "POST" });
    await loadJobs();
  }

  useEffect(() => {
    loadJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    if (!filter) return jobs;
    return jobs.filter((j) => j.estado === filter);
  }, [jobs, filter]);

  return (
    <div style={{ padding: 16, color: "rgba(255,255,255,0.92)" }}>
      <h1 style={{ marginTop: 0 }}>Jobs manual</h1>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <button onClick={loadJobs}>Refrescar</button>
        <button onClick={runNext}>Run next job</button>

        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">(todos)</option>
          <option value="PENDING">PENDING</option>
          <option value="WAITING_REVIEW">WAITING_REVIEW</option>
          <option value="SUCCEEDED">SUCCEEDED</option>
          <option value="FAILED">FAILED</option>
        </select>

        <input
          placeholder="Buscar por id / tipo / estado"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 240 }}
        />
      </div>

      {/* Crear job manual */}
      <div
        style={{
          marginBottom: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          background: "rgba(255,255,255,0.03)",
          padding: 12,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Crear job manual (por item_id)</h3>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            placeholder="Buscar items (url / proveedor / id)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={searchItems}>Buscar</button>
        </div>

        <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid rgba(255,255,255,0.08)" }}>
          <table style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th />
                <th>item_id</th>
                <th>url</th>
                <th>estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.item_id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(it.item_id)}
                      onChange={() => {
                        const n = new Set(selected);
                        n.has(it.item_id) ? n.delete(it.item_id) : n.add(it.item_id);
                        setSelected(n);
                      }}
                    />
                  </td>
                  <td>{it.item_id}</td>
                  <td style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.url}
                  </td>
                  <td>{it.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button onClick={() => setSelected(new Set(items.map((i) => i.item_id)))}>
            Seleccionar visibles
          </button>
          <button onClick={() => setSelected(new Set())}>Limpiar selección</button>
          <button onClick={createJobs} disabled={selected.size === 0}>
            Crear jobs ({selected.size})
          </button>
        </div>
      </div>

      {/* Tabla jobs */}
      {err ? <div style={{ color: "#ff6b6b" }}>Error: {err}</div> : null}

      <table style={{ width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            <th>job_id</th>
            <th>estado</th>
            <th>tipo</th>
            <th>item_id</th>
            <th>prioridad</th>
            <th>next_run_at</th>
            <th>locked_until</th>
            <th>last_error</th>
          </tr>
        </thead>
        <tbody>
          {filteredJobs.map((j) => (
            <tr key={j.job_id}>
              <td>{j.job_id}</td>
              <td>{j.estado}</td>
              <td>{j.tipo}</td>
              <td>{j.item_id ?? "-"}</td>
              <td>{j.prioridad}</td>
              <td>{fmtIso(j.next_run_at)}</td>
              <td>{fmtIso(j.locked_until)}</td>
              <td style={{ maxWidth: 300 }}>{j.last_error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
