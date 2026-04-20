"use client";

import { useEffect, useMemo, useState } from "react";

type Pricing = {
  item_comercial_pricing_id?: number;
  item_comercial_id?: number;
  costo_referencia_ars?: number | null;
  margen_referencia_pct?: number | null;
  precio_sin_impuestos?: number | null;
  precio_directo?: number | null;
  precio_web?: number | null;
  precio_ml?: number | null;
  updated_at?: string | null;
} | null;

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "";
  return String(v);
}

export default function ItemComercialPricingPanel({
  itemComercialId,
  disabled = false,
}: {
  itemComercialId: number | null | undefined;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pricing, setPricing] = useState<Pricing>(null);
  const [suggestedCost, setSuggestedCost] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

  const [costoReferencia, setCostoReferencia] = useState<string>("");
  const [margenRef, setMargenRef] = useState<string>("");
  const [precioSinImp, setPrecioSinImp] = useState<string>("");
  const [precioDirecto, setPrecioDirecto] = useState<string>("");
  const [precioWeb, setPrecioWeb] = useState<string>("");
  const [precioMl, setPrecioMl] = useState<string>("");

  useEffect(() => {
    if (!itemComercialId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/items-comerciales/${itemComercialId}/pricing`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j?.ok) throw new Error(j?.error || "error");
        const p = (j?.pricing || null) as Pricing;
        setPricing(p);
        setSuggestedCost(j?.suggested?.costo_referencia_ars ?? null);
        setCostoReferencia(fmtMoney(p?.costo_referencia_ars ?? j?.suggested?.costo_referencia_ars ?? null));
        setMargenRef(fmtMoney(p?.margen_referencia_pct ?? null));
        setPrecioSinImp(fmtMoney(p?.precio_sin_impuestos ?? null));
        setPrecioDirecto(fmtMoney(p?.precio_directo ?? null));
        setPrecioWeb(fmtMoney(p?.precio_web ?? null));
        setPrecioMl(fmtMoney(p?.precio_ml ?? null));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemComercialId]);

  const updatedText = useMemo(() => {
    if (!pricing?.updated_at) return "";
    try {
      return new Date(pricing.updated_at).toLocaleString();
    } catch {
      return "";
    }
  }, [pricing?.updated_at]);

  async function save() {
    if (!itemComercialId || disabled) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/items-comerciales/${itemComercialId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          costo_referencia_ars: costoReferencia === "" ? null : Number(costoReferencia),
          margen_referencia_pct: margenRef === "" ? null : Number(margenRef),
          precio_sin_impuestos: precioSinImp === "" ? null : Number(precioSinImp),
          precio_directo: precioDirecto === "" ? null : Number(precioDirecto),
          precio_web: precioWeb === "" ? null : Number(precioWeb),
          precio_ml: precioMl === "" ? null : Number(precioMl),
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setPricing(j?.pricing || null);
    } catch (e: any) {
      setError(e?.message || "error");
    } finally {
      setSaving(false);
    }
  }

  function field(label: string, value: string, setValue: (v: string) => void, placeholder = "") {
    return (
      <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 12, opacity: 0.8 }}>{label}</span>
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
            padding: "8px 10px",
            fontSize: 13,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.04)",
            color: "inherit",
            outline: "none",
          }}
        />
      </label>
    );
  }

  return (
    <section style={{ display: "grid", gap: 10, paddingTop: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Pricing por canal</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {loading ? "Cargando..." : updatedText ? `Actualizado: ${updatedText}` : ""}
        </div>
      </div>

      {error ? <div style={{ fontSize: 12, color: "#fca5a5" }}>{error}</div> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          minWidth: 0,
        }}
      >
        {field("Costo referencia ARS", costoReferencia, setCostoReferencia, suggestedCost != null ? String(suggestedCost) : "")}
        {field("Margen referencia %", margenRef, setMargenRef)}
        {field("Precio sin impuestos", precioSinImp, setPrecioSinImp)}
        {field("Precio directo", precioDirecto, setPrecioDirecto)}
        {field("Precio web", precioWeb, setPrecioWeb)}
        {field("Precio ML", precioMl, setPrecioMl)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {suggestedCost != null ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Sugerido desde costeo: <strong>{suggestedCost}</strong>
          </div>
        ) : null}
        <button
          onClick={save}
          disabled={disabled || saving || !itemComercialId}
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.05)",
            color: "inherit",
            fontSize: 12.5,
            padding: "7px 10px",
            borderRadius: 10,
            cursor: disabled || saving || !itemComercialId ? "not-allowed" : "pointer",
            opacity: disabled || saving || !itemComercialId ? 0.6 : 1,
          }}
        >
          {saving ? "Guardando..." : "Guardar pricing"}
        </button>
      </div>
    </section>
  );
}
