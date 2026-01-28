"use client";

import { useMemo, useState } from "react";

type PreviewResp = {
  ok: boolean;
  error?: string;
  proveedor_id?: string;
  motor_id?: string;
  url_canonica?: string;
  sourceUrl?: string;
  prices?: Array<{ presentacion: number; priceArs: number }>;
};

type BulkResp = {
  ok: boolean;
  error?: string;
  urls_in?: number;
  urls_ok?: number;
  urls_fail?: number;
  inserted_created?: number;
  inserted_updated?: number;
  results?: Array<any>;
};

function uniqUrlsFromText(text: string): string[] {
  const lines = text
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);

  // dedupe manteniendo orden
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of lines) {
    const key = u.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

export default function OfferBulkForm({ itemId }: { itemId: number }) {
  const [proveedorCodigo, setProveedorCodigo] = useState<string>("PQ"); // default
  const [text, setText] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);

  const [bulk, setBulk] = useState<BulkResp | null>(null);

  const urls = useMemo(() => uniqUrlsFromText(text), [text]);

  async function doPreview() {
    setBulk(null);
    setPreview(null);

    const u = urls[0];
    if (!u) {
      setPreview({ ok: false, error: "Pegá al menos 1 URL (una por línea)." });
      return;
    }

    setBusy(true);
    setPreviewUrl(u);
    try {
      const r = await fetch("/api/ofertas/bulk/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proveedor_codigo: proveedorCodigo, url: u }),
        cache: "no-store",
      });
      const data = (await r.json()) as PreviewResp;
      setPreview(data);
    } catch (e: any) {
      setPreview({ ok: false, error: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function doSave() {
    setPreview(null);
    setBulk(null);

    if (!urls.length) {
      setBulk({ ok: false, error: "Pegá al menos 1 URL (una por línea)." });
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/ofertas/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          proveedor_codigo: proveedorCodigo,
          urls,
        }),
        cache: "no-store",
      });

      const data = (await r.json()) as BulkResp;
      setBulk(data);

      // si OK, limpiamos textarea opcionalmente
      // if (data?.ok) setText("");
    } catch (e: any) {
      setBulk({ ok: false, error: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  const previewPrices = preview?.prices ?? [];
  const previewSorted = [...previewPrices].sort((a, b) => Number(a.presentacion) - Number(b.presentacion));

  return (
    <div style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18, marginBottom: 8 }}>Cargar URLs del proveedor</h2>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>Proveedor (código)</span>
          <input
            value={proveedorCodigo}
            onChange={(e) => setProveedorCodigo(e.target.value.toUpperCase())}
            placeholder="PQ"
            style={{ width: 90 }}
          />
        </label>

        <div style={{ opacity: 0.8 }}>
          URLs detectadas: <b>{urls.length}</b>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Pegá 1 URL por línea..."
        rows={6}
        style={{ width: "100%", maxWidth: 980 }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={doPreview} disabled={busy || urls.length === 0}>
          Preview (1ra URL)
        </button>
        <button onClick={doSave} disabled={busy || urls.length === 0}>
          Guardar en BD (todas)
        </button>
      </div>

      {/* Preview */}
      {preview && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: 16, marginBottom: 6 }}>Preview</h3>
          {!preview.ok ? (
            <div style={{ color: "salmon" }}>{preview.error ?? "Error"}</div>
          ) : (
            <div style={{ opacity: 0.95 }}>
              <div style={{ marginBottom: 6 }}>
                URL: <code>{previewUrl}</code>
              </div>
              <div style={{ marginBottom: 6 }}>
                sourceUrl: <code>{preview.sourceUrl}</code>
              </div>
              <div style={{ marginBottom: 6 }}>
                motor_id: <b>{preview.motor_id}</b> — proveedor_id: <b>{preview.proveedor_id}</b>
              </div>

              {previewSorted.length === 0 ? (
                <div style={{ color: "salmon" }}>No se detectaron presentaciones/precios.</div>
              ) : (
                <table style={{ borderCollapse: "collapse", marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid #444" }}>
                        Presentación
                      </th>
                      <th style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid #444" }}>
                        Precio ARS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewSorted.map((p, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: "6px 10px" }}>{p.presentacion}</td>
                        <td style={{ padding: "6px 10px" }}>{p.priceArs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bulk result */}
      {bulk && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: 16, marginBottom: 6 }}>Resultado Guardado</h3>
          {!bulk.ok ? (
            <div style={{ color: "salmon" }}>{bulk.error ?? "Error"}</div>
          ) : (
            <div>
              <div>
                urls_in: <b>{bulk.urls_in}</b> — ok: <b>{bulk.urls_ok}</b> — fail: <b>{bulk.urls_fail}</b>
              </div>
              <div>
                inserted_created: <b>{bulk.inserted_created}</b> — inserted_updated: <b>{bulk.inserted_updated}</b>
              </div>

              {Array.isArray(bulk.results) && bulk.results.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary>Ver detalle por URL</summary>
                  <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(bulk.results, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
