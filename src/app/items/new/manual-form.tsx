"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ManualUom = "UN" | "ML" | "GR";

type CreateManualPayload = {
  tipo: "MANUAL_PRESENTACION";
  activo: boolean;
  manual_nombre: string;
  manual_uom: ManualUom;
  manual_cantidad: number;
  manual_costo_ars: number;
  densidad_g_ml: number | null;
};

export default function ManualForm() {
  const router = useRouter();

  const [nombre, setNombre] = useState("");
  const [uom, setUom] = useState<ManualUom>("UN");
  const [cantidad, setCantidad] = useState<string>("1");
  const [costoArs, setCostoArs] = useState<string>("0");
  const [densidad, setDensidad] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSave = useMemo(() => {
    const c = Number(String(cantidad).replace(",", "."));
    const p = Number(String(costoArs).replace(",", "."));
    const dRaw = String(densidad).trim();
    const d = dRaw === "" ? null : Number(String(densidad).replace(",", "."));
    return (
      nombre.trim().length > 0 &&
      Number.isFinite(c) &&
      c > 0 &&
      Number.isFinite(p) &&
      p >= 0 &&
      (d === null || (Number.isFinite(d) && d > 0))
    );
  }, [nombre, cantidad, costoArs, densidad]);

  async function onSubmit() {
    if (!canSave || saving) return;

    setSaving(true);
    setErr(null);

    const densidadRaw = String(densidad).trim();
    const payload: CreateManualPayload = {
      tipo: "MANUAL_PRESENTACION",
      activo: true,
      manual_nombre: nombre.trim(),
      manual_uom: uom,
      manual_cantidad: Number(String(cantidad).replace(",", ".")),
      manual_costo_ars: Number(String(costoArs).replace(",", ".")),
      densidad_g_ml:
        densidadRaw === ""
          ? null
          : Number(String(densidadRaw).replace(",", ".")),
    };

    try {
      const res = await fetch("/api/cost-options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok || !j?.ok) {
        throw new Error(j?.error ?? `http_${res.status}`);
      }

      const id = j?.cost_option_id ?? j?.id ?? null;
      if (!id) {
        router.push("/items-manuales");
        router.refresh();
        return;
      }

      router.push(`/items-manuales/${id}`);
      router.refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontSize: 12, opacity: 0.8 }}>Nombre</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Agua de red"
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "10px 10px",
            background: "rgba(255,255,255,0.03)",
            color: "rgba(255,255,255,0.9)",
            outline: "none",
          }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Unidad (UOM)</label>
          <select
            value={uom}
            onChange={(e) => setUom(e.target.value as ManualUom)}
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "10px 10px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.9)",
              outline: "none",
            }}
          >
            <option value="UN">UN</option>
            <option value="ML">ML</option>
            <option value="GR">GR</option>
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Cantidad</label>
          <input
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            inputMode="decimal"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "10px 10px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.9)",
              outline: "none",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Costo (ARS)</label>
          <input
            value={costoArs}
            onChange={(e) => setCostoArs(e.target.value)}
            inputMode="decimal"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "10px 10px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.9)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>
            Densidad (g/mL) (opcional)
          </label>
          <input
            value={densidad}
            onChange={(e) => setDensidad(e.target.value)}
            inputMode="decimal"
            placeholder="Ej: 1.000"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "10px 10px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.9)",
              outline: "none",
            }}
          />
        </div>
      </div>

      {err ? (
        <div style={{ fontSize: 12, color: "#ff6b6b" }}>Error: {err}</div>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onSubmit}
          disabled={!canSave || saving}
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "10px 12px",
            background: saving
              ? "rgba(255,255,255,0.02)"
              : "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.9)",
            cursor: !canSave || saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Guardando…" : "Crear item manual"}
        </button>

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Crea el costo manual y abre su edición para completar o ajustar datos.
        </div>
      </div>
    </div>
  );
}
