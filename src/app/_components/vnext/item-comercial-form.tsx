"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import ItemComercialRelaciones from "./item-comercial-relaciones";

type OriginType = "PROVEEDOR" | "MANUAL" | "FORMULADO";
type Uom = "GR" | "ML" | "UN";

type Comercial = {
  item_comercial_id: number;
  nombre: string | null;
  descripcion?: string | null;
  cantidad: number | null;
  unidad: string | null;
  proveedor_item_id?: number | null;
  manual_cost_option_id?: number | null;
  formulado_item_formulado_id?: number | null;
  activo: boolean;
};

type OriginOption = {
  id: number;
  label: string;
};

function numOrEmpty(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

const inputStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.03)",
  color: "rgba(255,255,255,0.92)",
  outline: "none",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

export default function ItemComercialForm({ itemId }: { itemId?: number }) {
  const router = useRouter();
  const editing = Number.isFinite(itemId as number) && Number(itemId) > 0;

  const [loading, setLoading] = useState(Boolean(editing));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [unidad, setUnidad] = useState<Uom>("UN");
  const [originType, setOriginType] = useState<OriginType>("MANUAL");
  const [originSearch, setOriginSearch] = useState("");
  const [originOptions, setOriginOptions] = useState<OriginOption[]>([]);
  const [originLoading, setOriginLoading] = useState(false);
  const [originId, setOriginId] = useState("");
  const [activo, setActivo] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!editing) return;
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/items-comerciales/${itemId}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        const row = (j.item ?? {}) as Comercial;
        if (cancelled) return;
        setNombre(row.nombre ?? "");
        setDescripcion(row.descripcion ?? "");
        setCantidad(numOrEmpty(row.cantidad) || "1");
        setUnidad(((row.unidad ?? "UN").toUpperCase() as Uom) || "UN");
        if (row.proveedor_item_id != null) {
          setOriginType("PROVEEDOR");
          setOriginId(String(row.proveedor_item_id));
        } else if (row.formulado_item_formulado_id != null) {
          setOriginType("FORMULADO");
          setOriginId(String(row.formulado_item_formulado_id));
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
  }, [editing, itemId]);

  useEffect(() => {
    let cancelled = false;
    async function loadOrigins() {
      setOriginLoading(true);
      try {
        const qp = new URLSearchParams();
        qp.set("tipo", originType);
        const effectiveSearch = originSearch.trim() || (editing && originId ? originId : "");
        qp.set("search", effectiveSearch);
        const r = await fetch(`/api/origenes-tecnicos?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (cancelled) return;
        setOriginOptions(((j.items ?? []) as any[]).map((x) => ({ id: Number(x.id), label: String(x.label ?? "") })));
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setOriginLoading(false);
      }
    }
    void loadOrigins();
    return () => {
      cancelled = true;
    };
  }, [originType, originSearch, editing, originId]);

  const title = useMemo(() => (editing ? "Editar Item Comercial" : "Nuevo Item Comercial"), [editing]);

  function buildBody() {
    const body: any = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      cantidad: Number(cantidad),
      unidad,
      proveedor_item_id: null,
      manual_cost_option_id: null,
      formulado_item_formulado_id: null,
      activo,
    };

    const oid = Number(originId);
    if (!Number.isFinite(oid) || oid <= 0) throw new Error("Seleccioná un origen técnico válido.");
    if (originType === "PROVEEDOR") body.proveedor_item_id = oid;
    else if (originType === "MANUAL") body.manual_cost_option_id = oid;
    else body.formulado_item_formulado_id = oid;

    if (!Number.isFinite(body.cantidad) || body.cantidad <= 0) throw new Error("Cantidad inválida.");
    if (unidad === "UN" && !Number.isInteger(body.cantidad)) throw new Error("UN requiere cantidad entera.");

    return body;
  }

  async function save() {
    setErr(null);
    try {
      if (!nombre.trim()) throw new Error("Nombre requerido.");
      const body = buildBody();
      setSaving(true);
      const r = await fetch(editing ? `/api/items-comerciales/${itemId}` : "/api/items-comerciales", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const id = Number(j?.item_comercial_id ?? itemId ?? 0);
      router.push(id > 0 ? `/items-comerciales/${id}` : "/items-comerciales");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    const ok = confirm("Eliminar definitivamente este ITEM COMERCIAL?\n\nAcción irreversible.");
    if (!ok) return;
    setErr(null);
    setDeleting(true);
    try {
      const r = await fetch(`/api/items-comerciales/${itemId}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      router.push("/items-comerciales");
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
            {editing ? <>item_comercial_id: <code>{itemId}</code></> : <>Alta mínima del comercial vNext.</>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/items-comerciales")} style={{ border: "none", background: "transparent", padding: 0, color: "inherit", cursor: "pointer", opacity: 0.9 }}>Volver</button>
          {editing ? (
            <button onClick={remove} disabled={deleting || saving || loading} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", cursor: deleting || saving || loading ? "default" : "pointer", opacity: deleting || saving || loading ? 0.7 : 1 }}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </button>
          ) : null}
          <button onClick={() => void save()} disabled={saving || deleting || loading} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", cursor: saving || deleting || loading ? "default" : "pointer", opacity: saving || deleting || loading ? 0.7 : 1 }}>
            {saving ? "Guardando..." : editing ? "Guardar" : "Guardar y seguir"}
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,90,90,0.08)" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
          <div style={{ fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>{err}</div>
        </div>
      ) : null}

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.02)", maxWidth: 860 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre comercial" style={inputStyle} />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Descripción (opcional)</label>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Cantidad</label>
              <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" placeholder="1" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Unidad</label>
              <select value={unidad} onChange={(e) => setUnidad(e.target.value as Uom)} style={inputStyle}>
                <option value="UN">UN</option>
                <option value="GR">GR</option>
                <option value="ML">ML</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0,1fr)", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Origen</label>
              <select value={originType} onChange={(e) => { setOriginType(e.target.value as OriginType); setOriginId(""); }} style={inputStyle}>
                <option value="MANUAL">MANUAL</option>
                <option value="PROVEEDOR">PROVEEDOR</option>
                <option value="FORMULADO">FORMULADO</option>
              </select>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Buscar origen técnico</label>
              <input value={originSearch} onChange={(e) => setOriginSearch(e.target.value)} placeholder="Buscar por nombre o ID..." style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Origen seleccionado</label>
            <select value={originId} onChange={(e) => setOriginId(e.target.value)} style={inputStyle}>
              <option value="">{originLoading ? "Cargando..." : "Seleccionar..."}</option>
              {originOptions.map((o) => (
                <option key={o.id} value={String(o.id)}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {editing ? (
        <>
          <ItemComercialRelaciones itemComercialId={Number(itemId)} kind="envases" />
          <ItemComercialRelaciones itemComercialId={Number(itemId)} kind="etiquetas" />
        </>
      ) : null}
    </div>
  );
}
