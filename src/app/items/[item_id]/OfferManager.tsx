"use client";

import { useEffect, useMemo, useState } from "react";

type PreviewPrice = { presentacion: number; priceArs: number };
type OfferRow = {
  offer_id: number;
  item_id: number;
  proveedor_id: number;
  motor_id: number;
  url_original: string;
  url_canonica: string;
  presentacion: number;
  estado: string;
  updated_at?: string | null;
};

export default function OfferManager(props: { itemId: number; defaultProveedorCodigo?: string }) {
  const { itemId, defaultProveedorCodigo = "TD" } = props;

  const [proveedorCodigo, setProveedorCodigo] = useState(defaultProveedorCodigo);
  const [url, setUrl] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [preview, setPreview] = useState<{
    url_canonica: string;
    sourceUrl: string;
    proveedor_id: string;
    motor_id: string;
    prices: PreviewPrice[];
  } | null>(null);

  const [selectedPres, setSelectedPres] = useState<number | null>(null);

  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);

  const sortedPreviewPrices = useMemo(() => {
    const arr = preview?.prices ?? [];
    return [...arr].sort((a, b) => a.presentacion - b.presentacion);
  }, [preview]);

  async function loadOffers() {
    setLoadingOffers(true);
    try {
      const res = await fetch(`/api/offers?item_id=${itemId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setOffers(data.offers ?? []);
    } catch (e: any) {
      setErr(e?.message || "Error cargando offers");
    } finally {
      setLoadingOffers(false);
    }
  }

  useEffect(() => {
    loadOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  async function doPreview() {
    setErr(null);
    setPreview(null);
    setSelectedPres(null);
    setLoadingPreview(true);

    try {
      const res = await fetch(`/api/offers/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proveedor_codigo: proveedorCodigo, url }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const prices = Array.isArray(data?.prices) ? data.prices : [];
      if (prices.length === 0) throw new Error("El motor no devolvió presentaciones/precios");

      setPreview({
        url_canonica: String(data.url_canonica),
        sourceUrl: String(data.sourceUrl),
        proveedor_id: String(data.proveedor_id),
        motor_id: String(data.motor_id),
        prices,
      });

      // default: primera presentacion
      const first = prices
        .map((p: any) => Number(p?.presentacion))
        .filter((n: number) => Number.isFinite(n))
        .sort((a: number, b: number) => a - b)[0];

      setSelectedPres(Number.isFinite(first) ? first : null);
    } catch (e: any) {
      setErr(e?.message || "Error en preview");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function doSave() {
    if (!preview) return;
    if (!selectedPres || !Number.isFinite(selectedPres)) {
      setErr("Seleccioná una presentación");
      return;
    }

    setLoadingSave(true);
    setErr(null);

    try {
      const res = await fetch(`/api/offers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          proveedor_codigo: proveedorCodigo,
          url,
          presentacion: selectedPres,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setUrl("");
      setPreview(null);
      setSelectedPres(null);
      await loadOffers();
    } catch (e: any) {
      setErr(e?.message || "Error guardando offer");
    } finally {
      setLoadingSave(false);
    }
  }

  return (
    <div style={{ border: "1px solid #333", padding: 12, borderRadius: 8, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Agregar oferta (URL proveedor)</h3>

      {err && (
        <div style={{ border: "1px solid #c00", padding: 10, marginBottom: 10 }}>
          <b>Error:</b> {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          Proveedor:
          <input
            value={proveedorCodigo}
            onChange={(e) => setProveedorCodigo(e.target.value)}
            style={{ width: 90, padding: "6px 8px" }}
            placeholder="TD"
          />
        </label>

        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ flex: 1, minWidth: 320, padding: "6px 8px" }}
          placeholder="https://puraquimica.com.ar/producto/..."
        />

        <button onClick={doPreview} disabled={loadingPreview || !url.trim()} style={{ padding: "6px 10px" }}>
          {loadingPreview ? "Probando..." : "Probar motor"}
        </button>
      </div>

      {preview && (
        <div style={{ marginTop: 12, borderTop: "1px solid #222", paddingTop: 12 }}>
          <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 8 }}>
            <div>motor_id: {preview.motor_id} | proveedor_id: {preview.proveedor_id}</div>
            <div style={{ wordBreak: "break-all" }}>URL canónica: {preview.url_canonica}</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              Presentación:
              <select
                value={selectedPres ?? ""}
                onChange={(e) => setSelectedPres(Number(e.target.value))}
                style={{ padding: "6px 8px" }}
              >
                {sortedPreviewPrices.map((p) => (
                  <option key={p.presentacion} value={p.presentacion}>
                    {p.presentacion} — ARS {Number(p.priceArs).toLocaleString("es-AR")}
                  </option>
                ))}
              </select>
            </label>

            <button onClick={doSave} disabled={loadingSave} style={{ padding: "6px 10px" }}>
              {loadingSave ? "Guardando..." : "Guardar oferta"}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h4 style={{ margin: 0 }}>Offers del item</h4>
          <button onClick={loadOffers} disabled={loadingOffers} style={{ padding: "4px 8px" }}>
            {loadingOffers ? "..." : "Refrescar"}
          </button>
        </div>

        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["offer_id", "estado", "presentacion", "motor_id", "url_canonica", "updated_at"].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.offer_id}>
                  <td style={{ borderBottom: "1px solid #222" }}>{o.offer_id}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{o.estado}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{o.presentacion}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{o.motor_id}</td>
                  <td style={{ borderBottom: "1px solid #222", maxWidth: 520, wordBreak: "break-all" }}>
                    {o.url_canonica}
                  </td>
                  <td style={{ borderBottom: "1px solid #222" }}>{o.updated_at ?? ""}</td>
                </tr>
              ))}
              {offers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 10 }}>
                    No hay offers aún.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
          Nota: el cron diario toma <code>app.offers</code> con <code>estado = 'OK'</code>.
        </div>
      </div>
    </div>
  );
}
