"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Publicacion = {
  publicacion_id?: number;
  item_comercial_id: string;
  canal: string;
  titulo: string;
  descripcion: string;
  precio_venta_ars: string;
  activa_manual: boolean;
  canal_external_id: string;
  estado_publicacion: string;
};

type ItemComercial = {
  item_comercial_id: number;
  nombre?: string | null;
};

type PricingContext = {
  costo_referencia_ars: number | null;
  precios: {
    DIRECTO: number | null;
    WEB: number | null;
    MERCADO_LIBRE: number | null;
  };
};

function money(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
}

export default function PublicacionForm({ publicacionId }: { publicacionId?: number }) {
  const router = useRouter();
  const [form, setForm] = useState<Publicacion>({
    item_comercial_id: "",
    canal: "DIRECTO",
    titulo: "",
    descripcion: "",
    precio_venta_ars: "",
    activa_manual: false,
    canal_external_id: "",
    estado_publicacion: "BORRADOR",
  });
  const [items, setItems] = useState<ItemComercial[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ctx, setCtx] = useState<PricingContext | null>(null);

  useEffect(() => {
    let done = false;
    async function loadItems() {
      try {
        const r = await fetch("/api/items-comerciales", { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!done) setItems(Array.isArray(j.items) ? j.items : []);
      } catch {
        if (!done) setItems([]);
      }
    }
    loadItems();
    return () => {
      done = true;
    };
  }, []);

  useEffect(() => {
    let done = false;
    async function loadOne() {
      if (!publicacionId) {
        setLoading(false);
        return;
      }
      try {
        const r = await fetch(`/api/publicaciones/${publicacionId}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        const it = j.item;
        if (done) return;
        setForm({
          item_comercial_id: String(it.item_comercial_id ?? ""),
          canal: it.canal ?? "DIRECTO",
          titulo: it.titulo ?? "",
          descripcion: it.descripcion ?? "",
          precio_venta_ars: it.precio_venta_ars == null ? "" : String(it.precio_venta_ars),
          activa_manual: !!it.activa_manual,
          canal_external_id: it.canal_external_id ?? "",
          estado_publicacion: it.estado_publicacion ?? "BORRADOR",
        });
      } catch (e: any) {
        if (!done) setErr(String(e?.message || "error"));
      } finally {
        if (!done) setLoading(false);
      }
    }
    loadOne();
    return () => {
      done = true;
    };
  }, [publicacionId]);

  useEffect(() => {
    let done = false;
    async function loadPricingContext() {
      if (!form.item_comercial_id) {
        setCtx(null);
        return;
      }
      try {
        const sp = new URLSearchParams({
          item_comercial_id: String(form.item_comercial_id),
          canal: form.canal,
        });
        const r = await fetch(`/api/publicaciones/pricing-context?${sp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!done) setCtx(j.context || null);
      } catch {
        if (!done) setCtx(null);
      }
    }
    loadPricingContext();
    return () => {
      done = true;
    };
  }, [form.item_comercial_id, form.canal]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 100);
    return items.filter((it) => `${it.item_comercial_id} ${it.nombre || ""}`.toLowerCase().includes(needle)).slice(0, 100);
  }, [items, q]);

  const selectedItem = useMemo(() => {
    if (!form.item_comercial_id) return null;
    return items.find((it) => String(it.item_comercial_id) === String(form.item_comercial_id)) ?? null;
  }, [items, form.item_comercial_id]);

  const marginPct = useMemo(() => {
    const precio = Number(form.precio_venta_ars);
    const costo = Number(ctx?.costo_referencia_ars);
    if (!Number.isFinite(precio) || !Number.isFinite(costo) || costo <= 0) return null;
    return ((precio - costo) / costo) * 100;
  }, [form.precio_venta_ars, ctx?.costo_referencia_ars]);

  const grossGainArs = useMemo(() => {
    const precio = Number(form.precio_venta_ars);
    const costo = Number(ctx?.costo_referencia_ars);
    if (!Number.isFinite(precio) || !Number.isFinite(costo)) return null;
    return precio - costo;
  }, [form.precio_venta_ars, ctx?.costo_referencia_ars]);

  function chooseItem(it: ItemComercial) {
    setForm((f) => ({
      ...f,
      item_comercial_id: String(it.item_comercial_id),
      titulo: f.titulo.trim() ? f.titulo : it.nombre ?? `Item Comercial #${it.item_comercial_id}`,
    }));
  }

  function copyPriceFrom(channel: keyof PricingContext["precios"]) {
    const v = ctx?.precios?.[channel];
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return;
    setForm((f) => ({ ...f, precio_venta_ars: String(v) }));
  }

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const body: any = {
        item_comercial_id: Number(form.item_comercial_id),
        canal: form.canal,
        titulo: form.titulo,
        descripcion: form.descripcion,
        precio_venta_ars: form.precio_venta_ars === "" ? null : Number(form.precio_venta_ars),
        activa_manual: form.activa_manual,
        canal_external_id: form.canal_external_id,
        estado_publicacion: form.estado_publicacion,
      };

      const r = await fetch(publicacionId ? `/api/publicaciones/${publicacionId}` : "/api/publicaciones", {
        method: publicacionId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      const id = publicacionId || j.publicacion_id;
      router.push(`/publicaciones/${id}`);
      router.refresh();
    } catch (e: any) {
      setErr(String(e?.message || "error"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!publicacionId) return;
    if (!confirm("¿Eliminar canal de venta?")) return;
    setSaving(true);
    setErr("");
    try {
      const r = await fetch(`/api/publicaciones/${publicacionId}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      router.push("/publicaciones");
      router.refresh();
    } catch (e: any) {
      setErr(String(e?.message || "error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 980 }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1.3fr 1fr 1fr", alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Item Comercial</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar item comercial..."
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13 }}
          />
          <div style={{ marginTop: 6, maxHeight: 180, overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {filtered.map((it) => {
                  const selected = form.item_comercial_id === String(it.item_comercial_id);
                  return (
                    <tr key={it.item_comercial_id} style={{ background: selected ? "rgba(255,255,255,0.10)" : "transparent", outline: selected ? "1px solid rgba(255,255,255,0.18)" : "none" }}>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>#{it.item_comercial_id}</td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>{it.nombre || `Item Comercial #${it.item_comercial_id}`}</td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid rgba(255,255,255,0.06)", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => chooseItem(it)}
                          style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 12, cursor: "pointer" }}
                        >
                          Elegir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", fontSize: 12.5 }}>
            {selectedItem ? (
              <span>
                Seleccionado: <strong>#{selectedItem.item_comercial_id}</strong> · {selectedItem.nombre || `Item Comercial #${selectedItem.item_comercial_id}`}
              </span>
            ) : (
              <span style={{ opacity: 0.7 }}>Ningún item comercial seleccionado.</span>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Canal</div>
            <select value={form.canal} onChange={(e) => setForm((f) => ({ ...f, canal: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13 }}>
              <option value="DIRECTO">DIRECTO</option>
              <option value="WEB">WEB</option>
              <option value="MERCADO_LIBRE">MERCADO_LIBRE</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Estado</div>
            <select value={form.estado_publicacion} onChange={(e) => setForm((f) => ({ ...f, estado_publicacion: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13 }}>
              <option value="BORRADOR">BORRADOR</option>
              <option value="LISTA">LISTA</option>
              <option value="PUBLICADA">PUBLICADA</option>
              <option value="PAUSADA">PAUSADA</option>
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={form.activa_manual} onChange={(e) => setForm((f) => ({ ...f, activa_manual: e.target.checked }))} />
            Activa manual
          </label>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Precio final ARS</div>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>Este valor pertenece al canal de venta seleccionado.</div>
            <input value={form.precio_venta_ars} onChange={(e) => setForm((f) => ({ ...f, precio_venta_ars: e.target.value }))} inputMode="decimal" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Canal external id</div>
            <input value={form.canal_external_id} onChange={(e) => setForm((f) => ({ ...f, canal_external_id: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13 }} />
          </div>
        </div>
      </div>

      <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Referencia de pricing</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Costo actual</div>
            <div style={{ fontSize: 13 }}>{money(ctx?.costo_referencia_ars)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>DIRECTO</div>
            <div style={{ fontSize: 13 }}>{money(ctx?.precios?.DIRECTO)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>WEB</div>
            <div style={{ fontSize: 13 }}>{money(ctx?.precios?.WEB)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>ML</div>
            <div style={{ fontSize: 13 }}>{money(ctx?.precios?.MERCADO_LIBRE)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Ganancia bruta estimada</div>
            <div style={{ fontSize: 13 }}>{grossGainArs == null ? "—" : money(grossGainArs)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Margen bruto estimado</div>
            <div style={{ fontSize: 13 }}>{marginPct == null ? "—" : `${marginPct.toFixed(2)} %`}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => copyPriceFrom("DIRECTO")}
            disabled={ctx?.precios?.DIRECTO == null}
            style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 12.5, cursor: ctx?.precios?.DIRECTO == null ? "not-allowed" : "pointer", opacity: ctx?.precios?.DIRECTO == null ? 0.5 : 1 }}
          >
            Copiar desde DIRECTO
          </button>
          <button
            type="button"
            onClick={() => copyPriceFrom("WEB")}
            disabled={ctx?.precios?.WEB == null}
            style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 12.5, cursor: ctx?.precios?.WEB == null ? "not-allowed" : "pointer", opacity: ctx?.precios?.WEB == null ? 0.5 : 1 }}
          >
            Copiar desde WEB
          </button>
          <button
            type="button"
            onClick={() => copyPriceFrom("MERCADO_LIBRE")}
            disabled={ctx?.precios?.MERCADO_LIBRE == null}
            style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 12.5, cursor: ctx?.precios?.MERCADO_LIBRE == null ? "not-allowed" : "pointer", opacity: ctx?.precios?.MERCADO_LIBRE == null ? 0.5 : 1 }}
          >
            Copiar desde ML
          </button>
        </div>

        {ctx?.precios?.DIRECTO == null && ctx?.precios?.WEB == null && ctx?.precios?.MERCADO_LIBRE == null ? (
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Todavía no hay otros canales guardados para este item comercial. Guardá un canal con precio y luego vas a poder reutilizarlo.
          </div>
        ) : null}
      </div>

      <div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Título</div>
        <input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13 }} />
      </div>

      <div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Descripción</div>
        <textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} rows={8} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13, resize: "vertical" }} />
      </div>

      {err ? <div style={{ color: "#ff8a80", fontSize: 13 }}>{err}</div> : null}

      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ opacity: 0.7, fontSize: 12 }}>{publicacionId ? `Canal de venta #${publicacionId}` : "Nuevo canal de venta"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {publicacionId ? (
            <button type="button" onClick={remove} disabled={saving} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13, cursor: "pointer" }}>
              Eliminar
            </button>
          ) : null}
          <button type="button" onClick={save} disabled={saving || loading} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13, cursor: "pointer" }}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
