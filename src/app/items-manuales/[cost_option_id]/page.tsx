"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type ManualUom = "GR" | "ML" | "UN";

type CostOption = {
  cost_option_id: number;
  tipo: string;
  manual_nombre: string | null;
  manual_uom: string | null;
  manual_cantidad: number | null;
  manual_costo_ars: number | null;
  densidad_g_ml: number | null;
  activo: boolean;
};

function numOrEmpty(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

export default function ItemManualEditPage() {
  const params = useParams<{ cost_option_id: string }>();
  const router = useRouter();

  const id = useMemo(() => Number(params?.cost_option_id), [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [uom, setUom] = useState<ManualUom>("UN");
  const [cantidad, setCantidad] = useState("1");
  const [costoArs, setCostoArs] = useState("");
  const [densidad, setDensidad] = useState("");
  const [activo, setActivo] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      if (!Number.isFinite(id) || id <= 0) {
        setErr("ID inválido.");
        setLoading(false);
        return;
      }

      try {
        const r = await fetch(`/api/cost-options/${id}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

        const co = j.cost_option as CostOption;
        if (!co || co.tipo !== "MANUAL_PRESENTACION") throw new Error("El registro no es MANUAL_PRESENTACION.");

        if (cancelled) return;
        setNombre(co.manual_nombre ?? "");
        setUom(((co.manual_uom ?? "UN").toUpperCase() as ManualUom) || "UN");
        setCantidad(numOrEmpty(co.manual_cantidad) || "1");
        setCostoArs(numOrEmpty(co.manual_costo_ars) || "");
        setDensidad(numOrEmpty(co.densidad_g_ml) || "");
        setActivo(Boolean(co.activo));
      } catch (e: any) {
        if (cancelled) return;
        setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save() {
    setErr(null);
    if (!Number.isFinite(id) || id <= 0) {
      setErr("ID inválido.");
      return;
    }
    if (!nombre.trim()) {
      setErr("Nombre requerido.");
      return;
    }

    const body: any = {
      manual_nombre: nombre.trim(),
      manual_uom: uom,
      manual_cantidad: Number(cantidad),
      manual_costo_ars: Number(costoArs),
      activo,
    };

    if (densidad.trim() !== "") body.densidad_g_ml = Number(densidad);

    if (!Number.isFinite(body.manual_cantidad) || body.manual_cantidad <= 0) {
      setErr("Cantidad inválida.");
      return;
    }
    if (!Number.isFinite(body.manual_costo_ars) || body.manual_costo_ars < 0) {
      setErr("Costo inválido.");
      return;
    }
    if (body.densidad_g_ml !== undefined && (!Number.isFinite(body.densidad_g_ml) || body.densidad_g_ml <= 0)) {
      setErr("Densidad inválida.");
      return;
    }

    setSaving(true);
    try {
      const r = await fetch(`/api/cost-options/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      router.push("/items-manuales");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setErr(null);
    if (!Number.isFinite(id) || id <= 0) {
      setErr("ID inválido.");
      return;
    }

    const ok = confirm(
      `Eliminar definitivamente este ITEM MANUAL?\n\n` +
        `Esto borra: cost_option MANUAL_PRESENTACION y snapshots históricos asociados.\n` +
        `Acción irreversible.`
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const r = await fetch(`/api/cost-options/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        if (r.status === 409 && j?.error === "manual_item_in_use") {
          const count = Number(j?.details?.formula_lineas_v2_count ?? 0);
          throw new Error(`No se puede eliminar: el item manual está usado en ${count} línea(s) de fórmula.`);
        }
        throw new Error(j?.error || `HTTP ${r.status}`);
      }

      router.push("/items-manuales");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Editar Item Manual</h1>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            cost_option_id: <code>{Number.isFinite(id) ? id : "?"}</code>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href="/items-manuales" style={{ textDecoration: "none", opacity: 0.9 }}>
            Volver
          </Link>
          <button
            onClick={remove}
            disabled={deleting || saving || loading}
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.03)",
              cursor: deleting || saving || loading ? "default" : "pointer",
              opacity: deleting || saving || loading ? 0.7 : 1,
            }}
          >
            {deleting ? "Eliminando..." : "Eliminar"}
          </button>
          <button
            onClick={save}
            disabled={saving || deleting || loading}
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.03)",
              cursor: saving || deleting || loading ? "default" : "pointer",
              opacity: saving || deleting || loading ? 0.7 : 1,
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,90,90,0.08)" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
          <div style={{ fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>{err}</div>
        </div>
      ) : null}

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.02)", maxWidth: 720 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Botella PET 250ml"
              style={{
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 10,
                padding: "8px 10px",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.92)",
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>UOM</label>
              <select
                value={uom}
                onChange={(e) => setUom(e.target.value as ManualUom)}
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "rgba(255,255,255,0.03)",
                  color: "rgba(255,255,255,0.92)",
                  outline: "none",
                }}
              >
                <option value="UN">UN</option>
                <option value="GR">GR</option>
                <option value="ML">ML</option>
              </select>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Cantidad</label>
              <input
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                inputMode="decimal"
                placeholder="1"
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "rgba(255,255,255,0.03)",
                  color: "rgba(255,255,255,0.92)",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Costo (ARS)</label>
              <input
                value={costoArs}
                onChange={(e) => setCostoArs(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "rgba(255,255,255,0.03)",
                  color: "rgba(255,255,255,0.92)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Densidad (g/ml) (opcional)</label>
              <input
                value={densidad}
                onChange={(e) => setDensidad(e.target.value)}
                inputMode="decimal"
                placeholder="1.000"
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "rgba(255,255,255,0.03)",
                  color: "rgba(255,255,255,0.92)",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, opacity: 0.9 }}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activo
          </label>
        </div>
      </div>
    </div>
  );
}
