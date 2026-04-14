"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CatalogoKind = "envases" | "etiqueta" | "paqueteria";
type OriginType = "PROVEEDOR" | "MANUAL";

type CatalogoRecord = {
  item_envase_id?: number;
  item_etiqueta_id?: number;
  item_paqueteria_id?: number;
  nombre: string | null;
  descripcion?: string | null;
  material?: string | null;
  medidas?: string | null;
  proveedor_item_id?: number | null;
  manual_cost_option_id?: number | null;
  activo: boolean;
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

export default function CatalogoForm({ kind, itemId }: { kind: CatalogoKind; itemId?: number }) {
  const router = useRouter();
  const editing = Number.isFinite(itemId as number) && Number(itemId) > 0;

  const [loading, setLoading] = useState(Boolean(editing));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [material, setMaterial] = useState("");
  const [medidas, setMedidas] = useState("");
  const [originType, setOriginType] = useState<OriginType>("MANUAL");
  const [originId, setOriginId] = useState("");
  const [activo, setActivo] = useState(true);

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
        setDescripcion(row.descripcion ?? "");
        setMaterial(row.material ?? "");
        setMedidas(row.medidas ?? "");
        if (row.proveedor_item_id != null) {
          setOriginType("PROVEEDOR");
          setOriginId(String(row.proveedor_item_id));
        } else {
          setOriginType("MANUAL");
          setOriginId(row.manual_cost_option_id != null ? String(row.manual_cost_option_id) : "");
        }
        setActivo(Boolean(row.activo));
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

  const titleByKind = useMemo(() => {
    if (kind === "envases") return editing ? "Editar Item Envase" : "Nuevo Item Envase";
    if (kind === "etiqueta") return editing ? "Editar Item Etiqueta" : "Nuevo Item Etiqueta";
    return editing ? "Editar Item Paquetería" : "Nuevo Item Paquetería";
  }, [kind, editing]);

  function buildBody() {
    const body: any = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      activo,
      proveedor_item_id: null,
      manual_cost_option_id: null,
    };
    if (kind === "etiqueta") {
      body.material = material.trim() || null;
      body.medidas = medidas.trim();
    }
    const oid = Number(originId);
    if (!Number.isFinite(oid) || oid <= 0) throw new Error("Origen inválido.");
    if (originType === "PROVEEDOR") body.proveedor_item_id = oid;
    else body.manual_cost_option_id = oid;
    return body;
  }

  async function save() {
    setErr(null);
    try {
      if (!nombre.trim()) throw new Error("Nombre requerido.");
      if (kind === "etiqueta" && !medidas.trim()) throw new Error("Medidas requeridas.");
      const body = buildBody();
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
    const ok = confirm("Eliminar definitivamente este registro?\n\nAcción irreversible.");
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
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{titleByKind}</h1>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {editing ? <>ID: <code>{itemId}</code></> : <>Alta mínima del catálogo operativo.</>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push(BACK_BASE[kind])} style={{ border: "none", background: "transparent", padding: 0, color: "inherit", cursor: "pointer", opacity: 0.9 }}>Volver</button>
          {editing ? (
            <button onClick={remove} disabled={deleting || saving || loading} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", cursor: deleting || saving || loading ? "default" : "pointer", opacity: deleting || saving || loading ? 0.7 : 1 }}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </button>
          ) : null}
          <button onClick={() => { setSaving(true); void save(); }} disabled={saving || deleting || loading} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", cursor: saving || deleting || loading ? "default" : "pointer", opacity: saving || deleting || loading ? 0.7 : 1 }}>
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
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none" }} />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Descripción (opcional)</label>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none", resize: "vertical" }} />
          </div>

          {kind === "etiqueta" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>Material</label>
                <input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Papel térmico, BOPP..." style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none" }} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>Medidas</label>
                <input value={medidas} onChange={(e) => setMedidas(e.target.value)} placeholder="100 x 50" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none" }} />
              </div>
            </div>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "140px minmax(0, 1fr)", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Origen</label>
              <select value={originType} onChange={(e) => setOriginType(e.target.value as OriginType)} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none" }}>
                <option value="MANUAL">MANUAL</option>
                <option value="PROVEEDOR">PROVEEDOR</option>
              </select>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>{originType === "MANUAL" ? "manual_cost_option_id" : "proveedor_item_id"}</label>
              <input value={originId} onChange={(e) => setOriginId(e.target.value)} inputMode="numeric" placeholder="ID del origen técnico" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none" }} />
            </div>
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.85 }}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo
          </label>
        </div>
      </div>
    </div>
  );
}
