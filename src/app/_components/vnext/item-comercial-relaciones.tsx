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

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n));
}

function numOrEmpty(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

export default function ItemComercialRelaciones({ itemComercialId, kind }: { itemComercialId: number; kind: Kind }) {
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
        cantidad: next.cantidad ?? prev[id]?.cantidad ?? numOrEmpty(r.cantidad) || "1",
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
        <div style={{ fontSize: 12, opacity: 0.7 }}>{loading ? "Cargando..." : `${rows.length} asociado(s)`}</div>
      </div>

      {err ? (
        <div style={{ padding: 10, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,90,90,0.08)", fontSize: 12, whiteSpace: "pre-wrap" }}>{err}</div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: kind === "etiquetas" ? "minmax(0,1fr) 96px 86px auto" : "minmax(0,1fr) 96px 86px auto", gap: 10, alignItems: "end" }}>
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
        <div style={{ fontSize: 12, opacity: 0.72 }}>
          Ref: {selectedOption.uom ?? ""} {fmtNum(selectedOption.cantidad_referencia, 3)} · ARS {fmtNum(selectedOption.costo_ars, 2)}
          {kind === "etiquetas" && Number.isFinite(Number(selectedOption.ancho_mm)) && Number.isFinite(Number(selectedOption.largo_mm)) ? ` · ${Number(selectedOption.ancho_mm)} x ${Number(selectedOption.largo_mm)} mm` : ""}
        </div>
      ) : null}

      <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
              <th style={{ textAlign: "left", padding: "5px 10px", width: 90 }}>Item #</th>
              <th style={{ textAlign: "left", padding: "5px 10px" }}>Nombre</th>
              {kind === "etiquetas" ? <th style={{ textAlign: "left", padding: "5px 10px", width: 110 }}>Medidas</th> : null}
              <th style={{ textAlign: "right", padding: "5px 10px", width: 96 }}>Cantidad</th>
              <th style={{ textAlign: "left", padding: "5px 10px", width: 90 }}>Oblig.</th>
              <th style={{ textAlign: "left", padding: "5px 10px", width: 100 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const assocId = rowAssocId(r);
              const patch = dirty[assocId];
              const qty = patch?.cantidad ?? (numOrEmpty(r.cantidad) || "1");
              const req = patch?.obligatorio ?? Boolean(r.obligatorio);
              const changed = patch !== undefined;
              const itemId = Number((r[cfg.itemIdKey] as number) ?? 0);
              return (
                <tr key={assocId} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 10px", opacity: 0.85, whiteSpace: "nowrap" }}>{itemId}</td>
                  <td style={{ padding: "5px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.nombre ?? ""}>{r.nombre ?? ""}</td>
                  {kind === "etiquetas" ? <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>{Number.isFinite(Number(r.ancho_mm)) && Number.isFinite(Number(r.largo_mm)) ? `${Number(r.ancho_mm)} x ${Number(r.largo_mm)}` : ""}</td> : null}
                  <td style={{ padding: "5px 10px", textAlign: "right" }}>
                    <input value={qty} onChange={(e) => touchRow(r, { cantidad: e.target.value })} inputMode="decimal" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "4px 8px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.92)", outline: "none", width: 82, textAlign: "right" }} />
                  </td>
                  <td style={{ padding: "5px 10px" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <input type="checkbox" checked={req} onChange={(e) => touchRow(r, { obligatorio: e.target.checked })} /> {req ? "Sí" : "No"}
                    </label>
                  </td>
                  <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                      <button type="button" onClick={() => void saveRow(r)} disabled={!changed || busyId === assocId} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: !changed || busyId === assocId ? "default" : "pointer", opacity: !changed || busyId === assocId ? 0.5 : 0.9 }}>
                        {busyId === assocId ? "…" : "Guardar"}
                      </button>
                      <button type="button" onClick={() => void removeRow(r)} disabled={busyId === assocId} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: busyId === assocId ? "default" : "pointer", opacity: busyId === assocId ? 0.5 : 0.9 }}>
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={kind === "etiquetas" ? 6 : 5} style={{ padding: "8px 10px", opacity: 0.7 }}>Sin asociaciones.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
