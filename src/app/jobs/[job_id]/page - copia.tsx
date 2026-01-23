"use client";

import { useEffect, useState } from "react";

export default function JobDetailPage({ params }: { params: { job_id: string } }) {
  const jobId = params.job_id;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [sel, setSel] = useState(0);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function approve() {
    try {
      const res = await fetch(`/api/jobs/${jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidato_index: sel }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      alert(`Oferta creada: ${j.oferta_id}`);
      await load();
    } catch (e: any) {
      alert(e?.message || "Error aprobando");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Cargando...</div>;
  if (err) return <div style={{ padding: 16 }}><b>Error:</b> {err}</div>;

  const job = data?.job;
  const result = data?.result;
  const candidatos: any[] = result?.candidatos || [];

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>Job {jobId}</h1>

      <h3>Job</h3>
      <pre style={{ background: "#111", padding: 12, overflowX: "auto" }}>{JSON.stringify(job, null, 2)}</pre>

      <h3>Result</h3>
      <pre style={{ background: "#111", padding: 12, overflowX: "auto" }}>{JSON.stringify(result, null, 2)}</pre>

      <h3>Candidatos ({candidatos.length})</h3>
      {candidatos.length > 0 ? (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select value={sel} onChange={(e) => setSel(Number(e.target.value))} style={{ padding: "6px 10px" }}>
            {candidatos.map((_c, idx) => (
              <option key={idx} value={idx}>
                #{idx}
              </option>
            ))}
          </select>
          <button onClick={approve} style={{ padding: "6px 10px" }}>
            Aprobar candidato
          </button>
        </div>
      ) : (
        <div>Sin candidatos</div>
      )}
    </div>
  );
}
