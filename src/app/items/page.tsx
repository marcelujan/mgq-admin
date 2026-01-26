"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ItemRow = {
  item_id: number;
  proveedor_id: number;
  motor_id: number;
  url_original: string;
  url_canonica: string;
  seleccionado: boolean;
  estado: string;
  updated_at: string;
  created_at: string;
  last_job_id?: number | null;
  last_job_estado?: string | null;
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

export default function ItemsPage() {
  // list
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [q, setQ] = useState("");

  // bulk add
  const [proveedorId, setProveedorId] = useState<number>(3);
  const [motorId, setMotorId] = useState<number>(1);
  const [urlsText, setUrlsText] = useState<string>("");

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  const [commitLoading, setCommitLoading] = useState(false);
  const [commitErr, setCommitErr] = useState<string | null>(null);
  const [commitOkMsg, setCommitOkMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/items?limit=50&offset=0`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setItems(data.items ?? []);
    } catch (e: any) {
      setErr(e?.message || "Error cargando items");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) => {
      return (
        String(it.item_id).includes(needle) ||
        (it.url_original || "").toLowerCase().includes(needle) ||
        (it.url_canonica || "").toLowerCase().includes(needle) ||
        String(it.proveedor_id).includes(needle) ||
        String(it.motor_id).includes(needle) ||
        (it.estado || "").toLowerCase().includes(needle)
      );
    });
  }, [items, q]);

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

    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/ofertas/bulk/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proveedor_id: proveedorId,
          motor_id: motorId,
          urls,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      // Esperado: data.previews (ajustar si tu route devuelve otro nombre)
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

    setCommitLoading(true);
    try {
      const res = await fetch(`/api/ofertas/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proveedor_id: proveedorId,
          motor_id: motorId,
          urls,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setCommitOkMsg(
        `OK. items_creados=${data.items_created ?? "?"}, offers_creadas=${data.offers_created ?? "?"}`
      );

      // refrescar lista
      await load();

      // opcional: limpiar preview
      // setPreviewRows([]);
      // setUrlsText("");
    } catch (e: any) {
      setCommitErr(e?.message || "Error creando items/offers");
    } finally {
      setCommitLoading(false);
    }
  }

  const previewOkCount = previewRows.filter((r) => r.status === "OK" || r.status === "WARNING").length;
  const previewErrCount = previewRows.filter((r) => r.status === "ERROR").length;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Items</h1>
        <button onClick={load} disabled={loading} style={{ padding: "6px 10px" }}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por id / url / estado..."
          style={{ flex: 1, padding: "6px 10px" }}
        />
      </div>

      {/* === NUEVO: Alta por URLs === */}
      <div style={{ border: "1px solid #333", padding: 12, borderRadius: 8, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Agregar nuevas URLs (crea item + offers por presentación)</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>proveedor_id</span>
            <input
              type="number"
              value={proveedorId}
              onChange={(e) => setProveedorId(Number(e.target.value))}
              style={{ padding: "6px 10px", width: 140 }}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>motor_id</span>
            <input
              type="number"
              value={motorId}
              onChange={(e) => setMotorId(Number(e.target.value))}
              style={{ padding: "6px 10px", width: 140 }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
            <button onClick={runPreview} disabled={previewLoading} style={{ padding: "6px 10px" }}>
              {previewLoading ? "Preview..." : "Preview"}
            </button>

            <button
              onClick={commitCreate}
              disabled={commitLoading}
              style={{ padding: "6px 10px" }}
              title="Crea item (si no existe) y offers por presentación en app.offers"
            >
              {commitLoading ? "Creando..." : "Crear items + offers"}
            </button>
          </div>
        </div>

        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder={"Pegá URLs (una por línea)\nEj:\nhttps://puraquimica.com.ar/producto/.../"}
          rows={6}
          style={{ width: "100%", padding: 10, fontFamily: "ui-monospace, monospace" }}
        />

        {previewErr && <div style={{ color: "#ff8080" }}>Preview error: {previewErr}</div>}
        {commitErr && <div style={{ color: "#ff8080" }}>Create error: {commitErr}</div>}
        {commitOkMsg && <div style={{ color: "#7CFC90" }}>{commitOkMsg}</div>}

        {previewRows.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, opacity: 0.9 }}>
              Preview: OK/WARN={previewOkCount} · ERROR={previewErrCount}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    {["status", "url", "presentaciones (extraídas)", "warnings/errors"].map((h) => (
                      <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, idx) => (
                    <tr key={`${r.url}-${idx}`}>
                      <td style={{ borderBottom: "1px solid #222" }}>{r.status}</td>
                      <td style={{ borderBottom: "1px solid #222", maxWidth: 520, wordBreak: "break-all" }}>
                        {r.url}
                      </td>
                      <td style={{ borderBottom: "1px solid #222" }}>
                        {(r.prices ?? [])
                          .map((p) => `${p.presentacion}: $${p.priceArs}`)
                          .join(" · ")}
                      </td>
                      <td style={{ borderBottom: "1px solid #222" }}>
                        {r.warnings?.length ? `W: ${r.warnings.join(" | ")}` : ""}
                        {r.errors?.length ? ` E: ${r.errors.join(" | ")}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Nota: esto guarda *todas* las presentaciones que el motor encuentre (no elegís una).
            </div>
          </div>
        )}
      </div>

      {/* Errores list */}
      {err && (
        <div style={{ padding: 10, border: "1px solid #c00" }}>
          <b>Error:</b> {err}
        </div>
      )}

      {/* Tabla items */}
      {loading ? (
        <div>Cargando.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {[
                  "item_id",
                  "proveedor_id",
                  "motor_id",
                  "estado",
                  "seleccionado",
                  "url_canonica",
                  "updated_at",
                  "last_job_id",
                  "last_job_estado",
                ].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.map((it) => (
                <tr key={it.item_id}>
                  <td style={{ borderBottom: "1px solid #222" }}>
                    <Link
                      href={`/items/${it.item_id}`}
                      style={{ textDecoration: "underline", color: "inherit" }}
                      title={`Ver detalle / histórico de item ${it.item_id}`}
                    >
                      {it.item_id}
                    </Link>
                  </td>

                  <td style={{ borderBottom: "1px solid #222" }}>{it.proveedor_id}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{it.motor_id}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{it.estado}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{it.seleccionado ? "true" : "false"}</td>

                  <td style={{ borderBottom: "1px solid #222", maxWidth: 520, wordBreak: "break-all" }}>
                    {it.url_canonica}
                  </td>

                  <td style={{ borderBottom: "1px solid #222" }}>{it.updated_at}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{it.last_job_id ?? ""}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{it.last_job_estado ?? ""}</td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 12 }}>
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
