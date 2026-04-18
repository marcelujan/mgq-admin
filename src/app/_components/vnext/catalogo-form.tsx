"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CatalogoKind = "envases" | "etiqueta" | "paqueteria";

type CatalogoRecord = {
  item_envase_id?: number;
  item_etiqueta_id?: number;
  item_paqueteria_id?: number;
  nombre: string | null;
  uom: string | null;
  cantidad_referencia: number | null;
  costo_ars: number | null;
  ancho_mm?: number | null;
  largo_mm?: number | null;
};

const API_BASE: Record<CatalogoKind, string> = {
  envases: "/api/items-envases",
  etiqueta: "/api/items-etiqueta",
  paqueteria: "/api/items-paqueteria",
};

const BACK_BASE: Record<CatalogoKind, string> = {
  envases: "/items-envases",
  etiqueta: "/items-etiqueta",
  paqueteria: "/items-paqueteria",
};

const LABEL_SINGULAR: Record<CatalogoKind, string> = {
  envases: "Item Envase",
  etiqueta: "Item Etiqueta",
  paqueteria: "Item Paquetería",
};

function numOrEmpty(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

export default function CatalogoForm({ kind, itemId }: { kind: CatalogoKind; itemId?: number }) {
  const router = useRouter();
  const editing = Number.isFinite(itemId as number) && Number(itemId) > 0;

  const [loading, setLoading] = useState(Boolean(editing));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [uom, setUom] = useState<"GR" | "ML" | "UN">("UN");
  const [cantidadReferencia, setCantidadReferencia] = useState("1");
  const [costoArs, setCostoArs] = useState("");
  const [anchoMm, setAnchoMm] = useState("");
  const [largoMm, setLargoMm] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!editing) return;
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`${API_BASE[kind]}/${itemId}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        const row = (j.item ?? {}) as CatalogoRecord;
        if (cancelled) return;
        setNombre(row.nombre ?? "");
        setUom(((row.uom ?? "UN").toUpperCase() as "GR" | "ML" | "UN") || "UN");
        setCantidadReferencia(numOrEmpty(row.cantidad_referencia) || "1");
        setCostoArs(numOrEmpty(row.costo_ars) || "");
        setAnchoMm(numOrEmpty(row.ancho_mm) || "");
        setLargoMm(numOrEmpty(row.largo_mm) || "");
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [editing, itemId, kind]);

  const title = useMemo(() => `${editing ? "Editar" : "Nuevo"} ${LABEL_SINGULAR[kind]}`, [editing, kind]);

  async function save() {
    setErr(null);
    try {
      const body: any = {
        nombre: nombre.trim(),
        uom,
        cantidad_referencia: Number(cantidadReferencia),
        costo_ars: Number(costoArs),
      };
      if (!body.nombre) throw new Error("Nombre requerido.");
      if (!Number.isFinite(body.cantidad_referencia) || body.cantidad_referencia <= 0) throw new Error("Cantidad inválida.");
      if (uom === "UN" && body.cantidad_referencia !== Math.trunc(body.cantidad_referencia)) throw new Error("La cantidad debe ser entera para UN.");
      if (!Number.isFinite(body.costo_ars) || body.costo_ars < 0) throw new Error("Costo inválido.");
      if (kind === "etiqueta") {
        body.ancho_mm = Number(anchoMm);
        body.largo_mm = Number(largoMm);
        if (!Number.isFinite(body.ancho_mm) || body.ancho_mm <= 0 || body.ancho_mm !== Math.trunc(body.ancho_mm)) throw new Error("Ancho (mm) inválido.");
        if (!Number.isFinite(body.largo_mm) || body.largo_mm <= 0 || body.largo_mm !== Math.trunc(body.largo_mm)) throw new Error("Largo (mm) inválido.");
      }

      setSaving(true);
      const r = await fetch(editing ? `${API_BASE[kind]}/${itemId}` : API_BASE[kind], {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      router.push(BACK_BASE[kind]);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    const ok = confirm(`Eliminar definitivamente este ${LABEL_SINGULAR[kind].toLowerCase()}?\n\nAcción irreversible.`);
    if (!ok) return;
    setErr(null);
    setDeleting(true);
    try {
      const r = await fetch(`${API_BASE[kind]}/${itemId}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      router.push(BACK_BASE[kind]);
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
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{title}</h1>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {editing ? <>ID: <code>{itemId}</code></> : <>Alta manual con costo y lote de referencia.</>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push(BACK_BASE[kind])} style={{ border: "none", background: "transparent", padding: 0, color: "inherit", cursor: "pointer", opacity: 0.9 }}>Volver</button>
          {editing ? (
            <button onClick={remove} disabled={deleting || saving || loading} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", cursor: deleting || saving || loading ? "default" : "pointer", opacity: deleting || saving || loading ? 0.7 : 1 }}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </button>
          ) : null}
          <button onClick={() => void save()} disabled={saving || deleting || loading} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", cursor: saving || deleting || loading ? "default" : "pointer", opacity: saving || deleting || loading ? 0.7 : 1 }}>
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

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.02)", maxWidth: 780 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: kind === "etiqueta" ? "repeat(5, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>UOM</label>
              <select value={uom} onChange={(e) => setUom(e.target.value as "GR" | "ML" | "UN")} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none" }}>
                <option value="GR">GR</option>
                <option value="ML">ML</option>
                <option value="UN">UN</option>
              </select>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Cantidad referencia</label>
              <input value={cantidadReferencia} onChange={(e) => setCantidadReferencia(e.target.value)} inputMode="decimal" placeholder="1" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none" }} />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Costo (ARS)</label>
              <input value={costoArs} onChange={(e) => setCostoArs(e.target.value)} inputMode="decimal" placeholder="0" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none" }} />
            </div>

            {kind === "etiqueta" ? (
              <>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>Ancho (mm)</label>
                <input value={anchoMm} onChange={(e) => setAnchoMm(e.target.value)} inputMode="numeric" placeholder="100" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none" }} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>Largo (mm)</label>
                <input value={largoMm} onChange={(e) => setLargoMm(e.target.value)} inputMode="numeric" placeholder="50" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none" }} />
              </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
