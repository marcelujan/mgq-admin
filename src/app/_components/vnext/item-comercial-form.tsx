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
  ref_uom?: string | null;
  ref_cantidad?: number | null;
  costo_ref_ars?: number | null;
  densidad_g_ml?: number | null;
  ref_presentacion?: number | null;
  producto_id?: number | null;
};

function numOrEmpty(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
}

function fmtNum(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(Number(v));
}

function familyOfUom(uom?: string | null): "mass" | "volume" | "unit" | null {
  const x = String(uom ?? "").trim().toUpperCase();
  if (x === "GR") return "mass";
  if (x === "ML") return "volume";
  if (x === "UN") return "unit";
  return null;
}

function normalizeToRefUnit(cantidad: number, unidad: Uom, refUom?: string | null, densidad?: number | null): number | null {
  const ru = String(refUom ?? "").toUpperCase();
  if (!["GR", "ML", "UN"].includes(ru)) return null;
  if (unidad === ru) return cantidad;
  if (unidad === "UN" || ru === "UN") return null;
  const d = Number(densidad ?? NaN);
  if (!Number.isFinite(d) || d <= 0) return null;
  if (unidad === "ML" && ru === "GR") return cantidad * d;
  if (unidad === "GR" && ru === "ML") return cantidad / d;
  return null;
}

function estimateBulkCost(cantidad: string, unidad: Uom, origin: OriginOption | null, densidadOverride: number | null): number | null {
  if (!origin) return null;
  const qty = Number(cantidad);
  const refQty = Number(origin.ref_cantidad ?? NaN);
  const refCost = Number(origin.costo_ref_ars ?? NaN);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (!Number.isFinite(refQty) || refQty <= 0) return null;
  if (!Number.isFinite(refCost) || refCost < 0) return null;
  const dens = Number.isFinite(Number(densidadOverride)) ? densidadOverride : origin.densidad_g_ml ?? null;
  const qtyInRef = normalizeToRefUnit(qty, unidad, origin.ref_uom ?? null, dens);
  if (qtyInRef === null || !Number.isFinite(qtyInRef) || qtyInRef <= 0) return null;
  return (qtyInRef / refQty) * refCost;
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

const buttonGhost: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.03)",
  cursor: "pointer",
  color: "inherit",
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
  const [densidadInput, setDensidadInput] = useState("");

  const [envasesSubtotal, setEnvasesSubtotal] = useState(0);
  const [etiquetasSubtotal, setEtiquetasSubtotal] = useState(0);

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
          setOriginSearch(String(row.proveedor_item_id));
        } else if (row.formulado_item_formulado_id != null) {
          setOriginType("FORMULADO");
          setOriginId(String(row.formulado_item_formulado_id));
          setOriginSearch(String(row.formulado_item_formulado_id));
        } else {
          setOriginType("MANUAL");
          const v = row.manual_cost_option_id != null ? String(row.manual_cost_option_id) : "";
          setOriginId(v);
          setOriginSearch(v);
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
        qp.set("search", originSearch.trim());
        qp.set("limit", originSearch.trim() === "" ? "1000" : "120");
        const r = await fetch(`/api/origenes-tecnicos?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (cancelled) return;
        setOriginOptions(
          ((j.items ?? []) as any[]).map((x) => ({
            id: Number(x.id),
            label: String(x.label ?? ""),
            ref_uom: x.ref_uom ?? null,
            ref_cantidad: x.ref_cantidad ?? null,
            costo_ref_ars: x.costo_ref_ars ?? null,
            densidad_g_ml: x.densidad_g_ml ?? null,
            ref_presentacion: x.ref_presentacion ?? null,
            producto_id: x.producto_id ?? null,
          }))
        );
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
  }, [originType, originSearch]);

  useEffect(() => {
    setOriginId("");
    setDensidadInput("");
  }, [originType]);

  const selectedOrigin = useMemo(() => {
    const id = Number(originId);
    return originOptions.find((o) => Number(o.id) === id) ?? null;
  }, [originOptions, originId]);

  useEffect(() => {
    if (!selectedOrigin) {
      setDensidadInput("");
      return;
    }
    setDensidadInput(numOrEmpty(selectedOrigin.densidad_g_ml) || "");
  }, [selectedOrigin?.id]);

  const needsDensity = useMemo(() => {
    const fromFamily = familyOfUom(selectedOrigin?.ref_uom ?? null);
    const toFamily = familyOfUom(unidad);
    return !!fromFamily && !!toFamily && fromFamily !== toFamily && fromFamily !== "unit" && toFamily !== "unit";
  }, [selectedOrigin, unidad]);

  const densityValue = useMemo(() => {
    const n = Number(densidadInput);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [densidadInput]);

  const baseCost = useMemo(() => estimateBulkCost(cantidad, unidad, selectedOrigin, densityValue), [cantidad, unidad, selectedOrigin, densityValue]);
  const totalCost = useMemo(() => {
    const base = Number.isFinite(baseCost as number) ? Number(baseCost) : 0;
    return base + envasesSubtotal + etiquetasSubtotal;
  }, [baseCost, envasesSubtotal, etiquetasSubtotal]);

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
    if (!Number.isFinite(oid) || oid <= 0) throw new Error("Seleccioná un bulk/origen técnico válido.");
    if (originType === "PROVEEDOR") body.proveedor_item_id = oid;
    else if (originType === "MANUAL") body.manual_cost_option_id = oid;
    else body.formulado_item_formulado_id = oid;

    if (!Number.isFinite(body.cantidad) || body.cantidad <= 0) throw new Error("Cantidad inválida.");
    if (unidad === "UN" && !Number.isInteger(body.cantidad)) throw new Error("UN requiere cantidad entera.");
    if (needsDensity && !densityValue) throw new Error("Ingresá una densidad válida para convertir entre GR y ML.");

    return body;
  }

  async function persistDensityIfNeeded() {
    if (!needsDensity || !densityValue || !selectedOrigin) return;
    const payload: any = { tipo: originType, id: selectedOrigin.id, densidad_g_ml: densityValue };
    if (originType === "PROVEEDOR") payload.ref_presentacion = selectedOrigin.ref_presentacion;
    if (originType === "FORMULADO") payload.producto_id = selectedOrigin.producto_id;
    const r = await fetch(`/api/origenes-tecnicos/densidad`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  }

  async function save() {
    setErr(null);
    try {
      if (!nombre.trim()) throw new Error("Nombre requerido.");
      const body = buildBody();
      setSaving(true);
      await persistDensityIfNeeded();
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
            <button onClick={remove} disabled={deleting || saving || loading} style={{ ...buttonGhost, cursor: deleting || saving || loading ? "default" : "pointer", opacity: deleting || saving || loading ? 0.7 : 1 }}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </button>
          ) : null}
          <button onClick={() => void save()} disabled={saving || deleting || loading} style={{ ...buttonGhost, cursor: saving || deleting || loading ? "default" : "pointer", opacity: saving || deleting || loading ? 0.7 : 1 }}>
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

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.02)" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre comercial" style={inputStyle} />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Descripción (opcional)</label>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Cantidad</label>
              <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Unidad</label>
              <select value={unidad} onChange={(e) => setUnidad(e.target.value as Uom)} style={inputStyle}>
                <option value="GR">GR</option>
                <option value="ML">ML</option>
                <option value="UN">UN</option>
              </select>
            </div>
            {needsDensity ? (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>Densidad (g/mL)</label>
                <input value={densidadInput} onChange={(e) => setDensidadInput(e.target.value)} inputMode="decimal" placeholder="Ej. 1.05" style={inputStyle} />
              </div>
            ) : null}
          </div>
          {needsDensity ? (
            <div style={{ fontSize: 12, opacity: 0.72 }}>
              La unidad del comercial difiere de la unidad de referencia del origen. Se usará esta densidad para convertir entre GR y ML y, al guardar, se actualizará en el origen técnico correspondiente.
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>Tipo bulk</label>
                <select value={originType} onChange={(e) => setOriginType(e.target.value as OriginType)} style={inputStyle}>
                  <option value="MANUAL">MANUAL</option>
                  <option value="PROVEEDOR">PROVEEDOR</option>
                  <option value="FORMULADO">FORMULADO</option>
                </select>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>Buscar bulk</label>
                <input value={originSearch} onChange={(e) => setOriginSearch(e.target.value)} placeholder="Filtrar por palabra o ID..." style={inputStyle} />
              </div>
            </div>

            <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "90px minmax(0,1fr) 130px 140px 100px", gap: 0, padding: "6px 10px", fontSize: 12, opacity: 0.68, background: "rgba(255,255,255,0.03)" }}>
                <div>Item #</div>
                <div>Nombre</div>
                <div>Ref.</div>
                <div>Costo ref.</div>
                <div></div>
              </div>
              <div style={{ display: "grid", maxHeight: 228, overflowY: "auto" }}>
                {originLoading ? (
                  <div style={{ padding: 10, fontSize: 12, opacity: 0.7 }}>Buscando...</div>
                ) : originOptions.length ? originOptions.map((o) => {
                  const isSelected = String(o.id) === originId;
                  return (
                    <div key={`${originType}-${o.id}`} style={{ display: "grid", gridTemplateColumns: "90px minmax(0,1fr) 130px 140px 100px", gap: 0, alignItems: "center", padding: "7px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", background: isSelected ? "rgba(255,255,255,0.05)" : "transparent", fontSize: 13 }}>
                      <div>{o.id}</div>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={o.label}>{o.label}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{o.ref_uom ? `${fmtNum(o.ref_cantidad, 3)} ${o.ref_uom}` : "—"}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{Number.isFinite(Number(o.costo_ref_ars)) ? `ARS ${fmtMoney(o.costo_ref_ars)}` : "—"}</div>
                      <div style={{ textAlign: "right" }}>
                        <button type="button" onClick={() => setOriginId(String(o.id))} style={{ ...buttonGhost, padding: "6px 8px" }}>{isSelected ? "Elegido" : "Elegir"}</button>
                      </div>
                    </div>
                  );
                }) : (
                  <div style={{ padding: 10, fontSize: 12, opacity: 0.7 }}>Sin resultados.</div>
                )}
              </div>
            </div>

            <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "8px 10px", fontSize: 12, background: "rgba(255,255,255,0.03)" }}>
                <div style={{ fontWeight: 700, opacity: 0.9 }}>Bulk seleccionado</div>
                {selectedOrigin ? (
                  <div style={{ opacity: 0.68 }}>
                    {needsDensity ? "Completá densidad si necesitás convertir GR ↔ ML." : ""}
                  </div>
                ) : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "90px minmax(0,1fr) 130px 140px 110px", gap: 0, padding: "6px 10px", fontSize: 12, opacity: 0.68, background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div>Item #</div>
                <div>Nombre</div>
                <div>Ref.</div>
                <div>Costo ref.</div>
                <div>Densidad</div>
              </div>
              <div style={{ display: "grid" }}>
                <div style={{ display: "grid", gridTemplateColumns: "90px minmax(0,1fr) 130px 140px 110px", gap: 0, alignItems: "center", padding: "7px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 13 }}>
                  <div>{selectedOrigin?.id ?? "—"}</div>
                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={selectedOrigin?.label ?? ""}>{selectedOrigin?.label ?? "—"}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{selectedOrigin?.ref_uom ? `${fmtNum(selectedOrigin.ref_cantidad, 3)} ${selectedOrigin.ref_uom}` : "—"}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{selectedOrigin && Number.isFinite(Number(selectedOrigin.costo_ref_ars)) ? `ARS ${fmtMoney(selectedOrigin.costo_ref_ars)}` : "—"}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{selectedOrigin && Number.isFinite(Number(densityValue ?? selectedOrigin.densidad_g_ml)) ? fmtNum(densityValue ?? selectedOrigin.densidad_g_ml, 4) : "—"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {editing ? (
        <>
          <ItemComercialRelaciones itemComercialId={Number(itemId)} kind="envases" onSubtotalChange={setEnvasesSubtotal} />
          <ItemComercialRelaciones itemComercialId={Number(itemId)} kind="etiquetas" onSubtotalChange={setEtiquetasSubtotal} />
        </>
      ) : (
        <div style={{ border: "1px dashed rgba(255,255,255,0.14)", borderRadius: 14, padding: 14, fontSize: 12, opacity: 0.72 }}>
          Guardá primero el Item Comercial para asociar envases y etiquetas.
        </div>
      )}

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.02)", display: "grid", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Costeo</div>
        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 180px", gap: 0, padding: "6px 10px", fontSize: 12, opacity: 0.68, background: "rgba(255,255,255,0.03)" }}>
            <div>Concepto</div>
            <div style={{ textAlign: "right" }}>Costo (ARS)</div>
          </div>
          {[
            ["Bulk", Number.isFinite(Number(baseCost)) ? `ARS ${fmtMoney(baseCost)}` : "—"],
            ["Envases", `ARS ${fmtMoney(envasesSubtotal)}`],
            ["Etiquetas", `ARS ${fmtMoney(etiquetasSubtotal)}`],
            ["Total parcial", `ARS ${fmtMoney(totalCost)}`],
          ].map(([label, value], idx) => (
            <div key={String(label)} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 180px", gap: 0, padding: "8px 10px", borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.06)", fontSize: label === "Total parcial" ? 14 : 13, fontWeight: label === "Total parcial" ? 700 : 500 }}>
              <div>{label}</div>
              <div style={{ textAlign: "right" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
