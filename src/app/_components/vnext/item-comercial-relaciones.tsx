"use client";

import { useEffect, useMemo, useState } from "react";

type Kind = "envases" | "etiquetas";

type Option = {
  id: number;
  nombre: string | null;
  uom: string | null;
  cantidad_referencia: number | null;
  costo_ars: number | null;
  ancho_mm?: number | null;
  largo_mm?: number | null;
};

type AssocRow = {
  item_comercial_envase_id?: number;
  item_comercial_etiqueta_id?: number;
  item_envase_id?: number;
  item_etiqueta_id?: number;
  nombre: string | null;
  cantidad: number | null;
  obligatorio: boolean;
  uom?: string | null;
  cantidad_referencia?: number | null;
  costo_ars?: number | null;
  ancho_mm?: number | null;
  largo_mm?: number | null;
};

const CFG = {
  envases: {
    title: "Envases asociados",
    optionApi: "/api/items-envases",
    assocApi: (id: number) => `/api/items-comerciales/${id}/envases`,
    assocIdKey: "item_comercial_envase_id" as const,
    itemIdKey: "item_envase_id" as const,
    itemPayloadKey: "item_envase_id" as const,
  },
  etiquetas: {
    title: "Etiquetas asociadas",
    optionApi: "/api/items-etiqueta",
    assocApi: (id: number) => `/api/items-comerciales/${id}/etiquetas`,
    assocIdKey: "item_comercial_etiqueta_id" as const,
    itemIdKey: "item_etiqueta_id" as const,
    itemPayloadKey: "item_etiqueta_id" as const,
  },
};

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
}

function fmtNum(n: number | null | undefined, digits = 3): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(Number(n));
}

function numOrEmpty(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

function calcLineCost(cantidad: number | null | undefined, refCantidad: number | null | undefined, costoRef: number | null | undefined): number {
  const qty = Number(cantidad ?? NaN);
  const refQty = Number(refCantidad ?? NaN);
  const refCost = Number(costoRef ?? NaN);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  if (!Number.isFinite(refQty) || refQty <= 0) return 0;
  if (!Number.isFinite(refCost) || refCost < 0) return 0;
  return (qty / refQty) * refCost;
}

export default function ItemComercialRelaciones({ itemComercialId, kind, onSubtotalChange }: { itemComercialId: number; kind: Kind; onSubtotalChange?: (subtotal: number) => void }) {
  const cfg = CFG[kind];
  const [rows, setRows] = useState<AssocRow[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [obligatorio, setObligatorio] = useState(true);
  const [dirty, setDirty] = useState<Record<number, { cantidad: string; obligatorio: boolean }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      const [rAssoc, rOpt] = await Promise.all([
        fetch(cfg.assocApi(itemComercialId), { cache: "no-store" }),
        fetch(`${cfg.optionApi}?search=`, { cache: "no-store" }),
      ]);
      const [jAssoc, jOpt] = await Promise.all([rAssoc.json().catch(() => null), rOpt.json().catch(() => null)]);
      if (!rAssoc.ok || !jAssoc?.ok) throw new Error(jAssoc?.error || `HTTP ${rAssoc.status}`);
      if (!rOpt.ok || !jOpt?.ok) throw new Error(jOpt?.error || `HTTP ${rOpt.status}`);
      setRows((jAssoc.items ?? []) as AssocRow[]);
      setOptions(
        ((jOpt.items ?? []) as any[]).map((x) => ({
          id: Number(x[cfg.itemIdKey]),
          nombre: x.nombre ?? null,
          uom: x.uom ?? null,
          cantidad_referencia: x.cantidad_referencia ?? null,
          costo_ars: x.costo_ars ?? null,
          ancho_mm: x.ancho_mm ?? null,
          largo_mm: x.largo_mm ?? null,
        }))
      );
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemComercialId, kind]);

  const selectedOption = useMemo(() => {
    const id = Number(selectedId);
    return options.find((o) => Number(o.id) === id) ?? null;
  }, [options, selectedId]);

  const selectedLineCost = useMemo(() => {
    if (!selectedOption) return 0;
    return calcLineCost(Number(cantidad), selectedOption.cantidad_referencia, selectedOption.costo_ars);
  }, [cantidad, selectedOption]);

  const subtotal = useMemo(() => rows.reduce((acc, r) => acc + calcLineCost(r.cantidad, r.cantidad_referencia, r.costo_ars), 0), [rows]);

  useEffect(() => {
    onSubtotalChange?.(subtotal);
  }, [onSubtotalChange, subtotal]);

  function rowAssocId(r: AssocRow): number {
    return Number(r[cfg.assocIdKey] as number);
  }

  async function addAssoc() {
    setErr(null);
    try {
      const itemId = Number(selectedId);
      const qty = Number(cantidad);
      if (!Number.isFinite(itemId) || itemId <= 0) throw new Error("Seleccioná un ítem válido.");
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad inválida.");
      setSaving(true);
      const r = await fetch(cfg.assocApi(itemComercialId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [cfg.itemPayloadKey]: itemId, cantidad: qty, obligatorio }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setSelectedId("");
      setCantidad("1");
      setObligatorio(true);
      await loadAll();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  function touchRow(r: AssocRow, next: Partial<{ cantidad: string; obligatorio: boolean }>) {
    const id = rowAssocId(r);
    setDirty((prev) => ({
      ...prev,
      [id]: {
        cantidad: next.cantidad ?? prev[id]?.cantidad ?? (numOrEmpty(r.cantidad) || "1"),
        obligatorio: next.obligatorio ?? prev[id]?.obligatorio ?? Boolean(r.obligatorio),
      },
    }));
  }

  async function saveRow(r: AssocRow) {
    const id = rowAssocId(r);
    const snapshot = dirty[id];
    if (!snapshot) return;
    setErr(null);
    try {
      const qty = Number(snapshot.cantidad);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad inválida.");
      setBusyId(id);
      const r0 = await fetch(`${cfg.assocApi(itemComercialId)}/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cantidad: qty, obligatorio: snapshot.obligatorio }),
      });
      const j0 = await r0.json().catch(() => null);
      if (!r0.ok || !j0?.ok) throw new Error(j0?.error || `HTTP ${r0.status}`);
      setDirty((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      await loadAll();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  async function removeRow(r: AssocRow) {
    const id = rowAssocId(r);
    const ok = confirm("Eliminar relación definitivamente?");
    if (!ok) return;
    setErr(null);
    try {
      setBusyId(id);
      const r0 = await fetch(`${cfg.assocApi(itemComercialId)}/${id}`, { method: "DELETE" });
      const j0 = await r0.json().catch(() => null);
      if (!r0.ok || !j0?.ok) throw new Error(j0?.error || `HTTP ${r0.status}`);
      setDirty((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      await loadAll();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.02)", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{cfg.title}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{loading ? "Cargando..." : `${rows.length} asociado(s) · subtotal ARS ${fmtMoney(subtotal)}`}</div>
      </div>

      {err ? (
        <div style={{ padding: 10, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,90,90,0.08)", fontSize: 12, whiteSpace: "pre-wrap" }}>{err}</div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px 86px auto", gap: 10, alignItems: "end" }}>
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>{kind === "envases" ? "Item Envase" : "Item Etiqueta"}</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none", width: "100%", minWidth: 0 }}>
            <option value="">Seleccionar...</option>
            {options.map((o) => {
              const extra = kind === "etiquetas" && Number.isFinite(Number(o.ancho_mm)) && Number.isFinite(Number(o.largo_mm)) ? ` · ${Number(o.ancho_mm)} x ${Number(o.largo_mm)}` : "";
              return <option key={o.id} value={String(o.id)}>{`${o.nombre ?? ""}${extra}`}</option>;
            })}
          </select>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Cantidad</label>
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none", width: "100%" }} />
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.85, minHeight: 36 }}>
          <input type="checkbox" checked={obligatorio} onChange={(e) => setObligatorio(e.target.checked)} /> Obligatorio
        </label>
        <button type="button" onClick={() => void addAssoc()} disabled={saving} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1, whiteSpace: "nowrap" }}>{saving ? "Agregando..." : "Agregar"}</button>
      </div>

      {selectedOption ? (
        <div style={{ fontSize: 12, opacity: 0.72, display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div>Ref: {selectedOption.uom ?? ""} {fmtNum(selectedOption.cantidad_referencia, 3)}</div>
          <div>Costo ref.: ARS {fmtMoney(selectedOption.costo_ars)}</div>
          <div>Costo línea: ARS {fmtMoney(selectedLineCost)}</div>
          {kind === "etiquetas" && Number.isFinite(Number(selectedOption.ancho_mm)) && Number.isFinite(Number(selectedOption.largo_mm)) ? (
            <div>Medidas: {Number(selectedOption.ancho_mm)} x {Number(selectedOption.largo_mm)}</div>
          ) : null}
        </div>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <th style={{ padding: "4px 8px" }}>Item #</th>
              <th style={{ padding: "4px 8px" }}>Nombre</th>
              {kind === "etiquetas" ? <th style={{ padding: "4px 8px" }}>Medidas</th> : null}
              <th style={{ padding: "4px 8px" }}>Costo ref.</th>
              <th style={{ padding: "4px 8px" }}>Cantidad</th>
              <th style={{ padding: "4px 8px" }}>Costo línea</th>
              <th style={{ padding: "4px 8px" }}>Oblig.</th>
              <th style={{ padding: "4px 8px" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={kind === "etiquetas" ? 8 : 7} style={{ padding: "8px 10px", opacity: 0.65 }}>Sin asociaciones.</td>
              </tr>
            ) : rows.map((r) => {
              const assocId = rowAssocId(r);
              const current = dirty[assocId] ?? { cantidad: numOrEmpty(r.cantidad) || "1", obligatorio: Boolean(r.obligatorio) };
              const lineCost = calcLineCost(Number(current.cantidad), r.cantidad_referencia, r.costo_ars);
              return (
                <tr key={assocId} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{kind === "envases" ? r.item_envase_id : r.item_etiqueta_id}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 380 }} title={r.nombre ?? undefined}>{r.nombre ?? ""}</td>
                  {kind === "etiquetas" ? <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{Number.isFinite(Number(r.ancho_mm)) && Number.isFinite(Number(r.largo_mm)) ? `${Number(r.ancho_mm)} x ${Number(r.largo_mm)}` : "—"}</td> : null}
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap", fontSize: 12, opacity: 0.8 }}>{`ARS ${fmtMoney(r.costo_ars)} · ${fmtNum(r.cantidad_referencia, 3)} ${r.uom ?? ""}`}</td>
                  <td style={{ padding: "5px 8px", width: 96 }}>
                    <input value={current.cantidad} onChange={(e) => touchRow(r, { cantidad: e.target.value })} inputMode="decimal" style={{ width: "100%", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "5px 8px", background: "rgba(255,255,255,0.03)", color: "inherit" }} />
                  </td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{`ARS ${fmtMoney(lineCost)}`}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input type="checkbox" checked={current.obligatorio} onChange={(e) => touchRow(r, { obligatorio: e.target.checked })} /> {current.obligatorio ? "Sí" : "No"}
                    </label>
                  </td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                    <button type="button" onClick={() => void saveRow(r)} disabled={busyId === assocId} style={{ border: "none", background: "transparent", padding: 0, color: "inherit", cursor: "pointer", marginRight: 8, opacity: busyId === assocId ? 0.7 : 0.9 }}>Guardar</button>
                    <button type="button" onClick={() => void removeRow(r)} disabled={busyId === assocId} style={{ border: "none", background: "transparent", padding: 0, color: "inherit", cursor: "pointer", opacity: busyId === assocId ? 0.7 : 0.9 }}>🗑️</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
