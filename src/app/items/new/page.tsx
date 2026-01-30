"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ProveedorRow = {
  proveedor_id: number;
  proveedor_nombre: string;
  motor_id: number | null;
};

type PreviewRow = {
  url: string;
  status: "OK" | "WARNING" | "ERROR";
  title?: string | null;
  sku?: string | null;
  prices?: Array<{ presentacion: number; priceArs: number }>;
  warnings?: string[];
  errors?: string[];
};

function splitUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ItemsNewPage() {
  const [proveedores, setProveedores] = useState<ProveedorRow[]>([]);
  const [proveedorId, setProveedorId] = useState<number>(0);
  const [motorId, setMotorId] = useState<number>(0);
  const [urlsText, setUrlsText] = useState<string>("");

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  const [commitLoading, setCommitLoading] = useState(false);
  const [commitErr, setCommitErr] = useState<string | null>(null);
  const [commitOkMsg, setCommitOkMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/proveedores`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        return (j.proveedores ?? []) as ProveedorRow[];
      })
      .then((rows) => {
        if (cancelled) return;
        setProveedores(rows);
        if (rows.length && !proveedorId) {
          setProveedorId(rows[0].proveedor_id);
          setMotorId(rows[0].motor_id ?? 0);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setProveedores([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proveedorById = useMemo(() => {
    const m = new Map<number, ProveedorRow>();
    for (const p of proveedores) m.set(p.proveedor_id, p);
    return m;
  }, [proveedores]);

  const effectiveMotorId = proveedorId ? proveedorById.get(proveedorId)?.motor_id ?? motorId : motorId;

  async function runPreview() {
    setPreviewErr(null);
    setCommitErr(null);
    setCommitOkMsg(null);
    setPreviewRows([]);

    const urls = splitUrls(urlsText);
    if (urls.length === 0) {
      setPreviewErr("Pegá al menos 1 URL (una por línea).");
      return;
    }

    if (!proveedorId || !effectiveMotorId) {
      setPreviewErr("Seleccioná un proveedor (y que tenga motor asociado).");
      return;
    }

    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/ofertas/bulk/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proveedor_id: proveedorId,
          motor_id: effectiveMotorId,
          urls,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setPreviewRows((data.previews ?? data.rows ?? []) as PreviewRow[]);
    } catch (e: any) {
      setPreviewErr(e?.message || "Error en preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function commitCreate() {
    setCommitErr(null);
    setCommitOkMsg(null);

    const urls = splitUrls(urlsText);
    if (urls.length === 0) {
      setCommitErr("Pegá al menos 1 URL.");
      return;
    }

    if (!proveedorId || !effectiveMotorId) {
      setCommitErr("Seleccioná un proveedor (y que tenga motor asociado).");
      return;
    }

    setCommitLoading(true);
    try {
      const res = await fetch(`/api/ofertas/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proveedor_id: proveedorId,
          motor_id: effectiveMotorId,
          urls,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setCommitOkMsg(
        `OK. items_creados=${data.items_created ?? "?"}, offers_creadas=${data.offers_created ?? "?"}`
      );
    } catch (e: any) {
      setCommitErr(e?.message || "Error creando items/offers");
    } finally {
      setCommitLoading(false);
    }
  }

  const previewOkCount = previewRows.filter((r) => r.status === "OK" || r.status === "WARNING").length;
  const previewErrCount = previewRows.filter((r) => r.status === "ERROR").length;

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <style jsx global>{`
        .items-new-select {
          color-scheme: dark;
        }
        .items-new-select option {
          background: #0b0b0b;
          color: #ffffff;
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Cargar items</h1>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Crear items + offers a partir de URLs</div>
        </div>
        <Link
          href="/items"
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          Volver a lista
        </Link>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          padding: 12,
          background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Proveedor</label>
            <select
              className="items-new-select"
              style={{
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 10,
                padding: "8px 10px",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.92)",
                outline: "none",
                minWidth: 260,
              }}
              value={proveedorId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setProveedorId(id);
                const m = proveedorById.get(id)?.motor_id ?? 0;
                setMotorId(m);
              }}
            >
              {proveedores.length === 0 ? <option value={0}>(sin proveedores)</option> : null}
              {proveedores.map((p) => (
                <option key={p.proveedor_id} value={p.proveedor_id}>
                  {p.proveedor_nombre}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Motor</label>
            <input
              readOnly
              value={effectiveMotorId ? String(effectiveMotorId) : "(sin motor)"}
              style={{
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 10,
                padding: "8px 10px",
                width: 160,
                background: "rgba(255,255,255,0.02)",
                color: "rgba(255,255,255,0.85)",
                outline: "none",
              }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>URLs (una por línea)</label>
          <textarea
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            rows={7}
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.92)",
              outline: "none",
              resize: "vertical",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              fontSize: 12,
            }}
            placeholder="https://..."
          />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={runPreview}
            disabled={previewLoading}
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.02)",
              cursor: previewLoading ? "not-allowed" : "pointer",
              opacity: previewLoading ? 0.6 : 1,
            }}
          >
            {previewLoading ? "Previsualizando..." : "Preview"}
          </button>

          <button
            onClick={commitCreate}
            disabled={commitLoading}
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.04)",
              cursor: commitLoading ? "not-allowed" : "pointer",
              opacity: commitLoading ? 0.6 : 1,
            }}
          >
            {commitLoading ? "Creando..." : "Crear"}
          </button>

          {previewErr ? <div style={{ color: "#ff6b6b", fontSize: 13 }}>{previewErr}</div> : null}
          {commitErr ? <div style={{ color: "#ff6b6b", fontSize: 13 }}>{commitErr}</div> : null}
          {commitOkMsg ? <div style={{ color: "rgba(34,197,94,0.95)", fontSize: 13 }}>{commitOkMsg}</div> : null}

          {previewRows.length ? (
            <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75 }}>
              OK/WARN={previewOkCount} · ERROR={previewErrCount}
            </div>
          ) : null}
        </div>
      </div>

      {previewRows.length ? (
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, overflow: "auto" }}>
          <table style={{ minWidth: 900, width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
                <th style={{ padding: 10, width: 110 }}>Status</th>
                <th style={{ padding: 10 }}>URL</th>
                <th style={{ padding: 10, width: 220 }}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((r, idx) => (
                <tr key={`${r.url}_${idx}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: 10, whiteSpace: "nowrap" }}>{r.status}</td>
                  <td style={{ padding: 10 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 640 }} title={r.url}>
                      {r.url}
                    </div>
                  </td>
                  <td style={{ padding: 10 }}>
                    {r.errors?.length ? (
                      <div style={{ color: "#ff6b6b", fontSize: 12 }}>{r.errors[0]}</div>
                    ) : r.warnings?.length ? (
                      <div style={{ color: "rgba(251,191,36,0.95)", fontSize: 12 }}>{r.warnings[0]}</div>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{r.title ?? "OK"}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
