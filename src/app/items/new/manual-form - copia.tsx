"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CreateManualPayload = {
  tipo: "MANUAL_PRESENTACION";
  activo: boolean;
  manual_nombre: string;
  manual_uom: string;
  manual_cantidad: number;
  manual_costo_ars: number;
};

export default function ManualForm() {
  const router = useRouter();

  const [nombre, setNombre] = useState("");
  const [uom, setUom] = useState("u"); // o "ML"/"GR" según tu convención
  const [cantidad, setCantidad] = useState<string>("1");
  const [costoArs, setCostoArs] = useState<string>("0");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSave = useMemo(() => {
    const c = Number(cantidad);
    const p = Number(costoArs);
    return nombre.trim().length > 0 && Number.isFinite(c) && c > 0 && Number.isFinite(p) && p >= 0;
  }, [nombre, cantidad, costoArs]);

  async function onSubmit() {
    if (!canSave || saving) return;

    setSaving(true);
    setErr(null);

    const payload: CreateManualPayload = {
      tipo: "MANUAL_PRESENTACION",
      activo: true,
      manual_nombre: nombre.trim(),
      manual_uom: uom.trim(),
      manual_cantidad: Number(cantidad),
      manual_costo_ars: Number(costoArs),
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

      // Esperado: el POST devuelve cost_option_id (ajustar si tu API responde distinto)
      const id = j?.cost_option_id ?? j?.id ?? null;
      if (!id) {
        // si no devuelve id, al menos volvemos al listado
        router.push("/items");
        router.refresh();
        return;
      }

      router.push(`/items/mopt:${id}`);
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
          <label style={{ fontSize: 12, opacity: 0.8 }}>Unidad (uom)</label>
          <input
            value={uom}
            onChange={(e) => setUom(e.target.value)}
            placeholder="ML / GR / u"
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

      {err ? (
        <div style={{ fontSize: 12, color: "#ff6b6b" }}>
          Error: {err}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={onSubmit}
          disabled={!canSave || saving}
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "10px 12px",
            background: saving ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.9)",
            cursor: !canSave || saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Guardando…" : "Crear manual"}
        </button>

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Crea el ítem y debería quedar con gráfico desde hoy.
        </div>
      </div>
    </div>
  );
}