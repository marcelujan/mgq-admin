"use client";

import { useEffect, useMemo, useState } from "react";
import StockTargetPicker from "./stock-target-picker";

type Item = { item_tipo: any; item_ref_id: number; label: string; nombre: string; uom: string | null; saldo?: number | null; densidad_g_ml?: number | null };
type Line = { key: string; item: Item; cantidad: string; sugerido?: boolean };

function formatDateTimeInput(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtNum(v: any, max = 4) {
  if (v === null || v === undefined || v === "") return "";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: max }).format(Number(v));
}

export default function StockProduccionForm({ operationId }: { operationId?: number }) {
  const [output, setOutput] = useState<Item | null>(null);
  const [cantidadObtenida, setCantidadObtenida] = useState("");
  const [fecha, setFecha] = useState("");
  const [picker, setPicker] = useState<Item | null>(null);
  const [consumos, setConsumos] = useState<Line[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(!!operationId);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!operationId) return;
    let cancelled = false;
    async function load() {
      setLoadingDetail(true);
      setErr(null);
      try {
        const r = await fetch(`/api/stock-operaciones/${operationId}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        const op = j.operacion;
        const movimientos = Array.isArray(op?.movimientos) ? op.movimientos : [];
        const out = movimientos.find((m: any) => String(m.item_tipo) === "FORMULADO" && Number(m.delta_cantidad) > 0) ?? null;
        const ins = movimientos.filter((m: any) => Number(m.delta_cantidad) < 0);
        if (!cancelled) {
          setFecha(formatDateTimeInput(op?.fecha));
          if (out) {
            setOutput({
              item_tipo: out.item_tipo,
              item_ref_id: Number(out.item_ref_id),
              label: out.label,
              nombre: out.nombre,
              uom: out.uom,
              saldo: out.saldo,
              densidad_g_ml: out.densidad_g_ml,
            });
            setCantidadObtenida(String(Math.abs(Number(out.delta_cantidad ?? 0))));
          }
          setConsumos(ins.map((m: any) => ({
            key: String(m.stock_movimiento_id ?? `${m.item_tipo}:${m.item_ref_id}`),
            item: {
              item_tipo: m.item_tipo,
              item_ref_id: Number(m.item_ref_id),
              label: m.label,
              nombre: m.nombre,
              uom: m.uom,
              saldo: m.saldo,
              densidad_g_ml: m.densidad_g_ml,
            },
            cantidad: String(Math.abs(Number(m.delta_cantidad ?? 0))),
          })));
        }
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [operationId]);

  useEffect(() => {
    if (!output || operationId) return;
    let cancelled = false;
    async function loadSuggestion() {
      setLoadingSuggestion(true);
      try {
        const qp = new URLSearchParams({ formulado_item_formulado_id: String(output.item_ref_id) });
        const r = await fetch(`/api/stock-operaciones/produccion/sugerencia?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) {
          setConsumos((j.consumos ?? []).map((x: any, idx: number) => ({
            key: `${x.item_tipo}:${x.item_ref_id}:${idx}`,
            item: {
              item_tipo: x.item_tipo,
              item_ref_id: Number(x.item_ref_id),
              label: x.label,
              nombre: x.nombre,
              uom: x.uom,
              saldo: x.saldo,
              densidad_g_ml: x.densidad_g_ml,
            },
            cantidad: String(x.cantidad ?? ""),
            sugerido: true,
          })));
        }
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingSuggestion(false);
      }
    }
    void loadSuggestion();
    return () => {
      cancelled = true;
    };
  }, [output, operationId]);

  function addConsumo() {
    if (!picker) return;
    setConsumos((prev) => [...prev, { key: `${picker.item_tipo}:${picker.item_ref_id}:${Date.now()}`, item: picker, cantidad: "1" }]);
    setPicker(null);
  }

  async function submit() {
    if (!output) {
      setErr("Seleccioná el formulado obtenido.");
      return;
    }
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const body = {
        tipo: "PRODUCCION",
        formulado_item_formulado_id: output.item_ref_id,
        cantidad_obtenida: Number(cantidadObtenida),
        fecha: fecha || null,
        consumos: consumos.map((x) => ({ item_tipo: x.item.item_tipo, item_ref_id: x.item.item_ref_id, cantidad: Number(x.cantidad) })),
      };
      const url = operationId ? `/api/stock-operaciones/${operationId}` : `/api/stock-operaciones/produccion`;
      const method = operationId ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setMsg(`Operación #${j.stock_operacion_id ?? operationId} registrada.`);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  const outputRows = useMemo(() => (output ? [{ key: `${output.item_tipo}:${output.item_ref_id}`, item: output, cantidad: cantidadObtenida }] : []), [output, cantidadObtenida]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <StockTargetPicker allowedTypes={["FORMULADO"]} value={output} onChange={setOutput} label="Formulado obtenido" placeholder="Buscar formulado..." />

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Producto obtenido</div>
        <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 80 }}>Item #</th>
                <th style={{ textAlign: "left", padding: "5px 8px" }}>Formulado</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 120 }}>Cantidad real</th>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 52 }}>UOM</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 64 }}>Dens.</th>
              </tr>
            </thead>
            <tbody>
              {outputRows.map((line) => (
                <tr key={line.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{line.item.item_ref_id}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={line.item.label}>{line.item.label}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
                      <input value={line.cantidad} onChange={(e) => setCantidadObtenida(e.target.value)} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "4px 8px", background: "rgba(255,255,255,0.03)", color: "inherit", textAlign: "right" }} />
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{line.item.uom ?? ""}</div>
                    </div>
                  </td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{line.item.uom ?? ""}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtNum(line.item.densidad_g_ml)}</td>
                </tr>
              ))}
              {!output ? <tr><td colSpan={5} style={{ padding: "8px", opacity: 0.7 }}>Seleccioná un formulado.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,220px)", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Fecha</div>
          <input value={fecha} onChange={(e) => setFecha(e.target.value)} type="datetime-local" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Componentes utilizados {loadingSuggestion ? <span style={{ fontSize: 12, opacity: 0.7 }}>· sugiriendo fórmula…</span> : null}</div>
        <StockTargetPicker allowedTypes={["MANUAL", "PROVEEDOR", "FORMULADO"]} value={picker} onChange={setPicker} label="Agregar componente" placeholder="Buscar componente..." />
        <div><button type="button" onClick={addConsumo} disabled={!picker} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: !picker ? "default" : "pointer", opacity: 0.95, fontSize: 16 }}>+</button></div>
        <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 80 }}>Item #</th>
                <th style={{ textAlign: "left", padding: "5px 8px" }}>Componente</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 132 }}>Cantidad real</th>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 52 }}>UOM</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 64 }}>Dens.</th>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 42 }}></th>
              </tr>
            </thead>
            <tbody>
              {consumos.map((line) => (
                <tr key={line.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{line.item.item_ref_id}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={line.item.label}>{line.item.label}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
                      <input value={line.cantidad} onChange={(e) => setConsumos((prev) => prev.map((x) => x.key === line.key ? { ...x, cantidad: e.target.value } : x))} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "4px 8px", background: "rgba(255,255,255,0.03)", color: "inherit", textAlign: "right" }} />
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{line.item.uom ?? ""}</div>
                    </div>
                  </td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{line.item.uom ?? ""}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtNum(line.item.densidad_g_ml)}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}><button type="button" onClick={() => setConsumos((prev) => prev.filter((x) => x.key !== line.key))} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: "pointer", opacity: 0.9 }}>✕</button></td>
                </tr>
              ))}
              {consumos.length === 0 ? <tr><td colSpan={6} style={{ padding: "8px", opacity: 0.7 }}>Sin componentes cargados.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {err ? <div style={{ fontSize: 12, color: "#ffb4b4" }}>{err}</div> : null}
      {msg ? <div style={{ fontSize: 12, color: "#b8f2c8" }}>{msg}</div> : null}
      {loadingDetail ? <div style={{ fontSize: 12, opacity: 0.7 }}>Cargando...</div> : null}

      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <button type="button" onClick={() => void submit()} disabled={saving || loadingDetail} style={{ border: "none", background: "transparent", padding: 0, color: "inherit", cursor: saving || loadingDetail ? "default" : "pointer", fontSize: 12.5, opacity: 0.95 }}>
          {saving ? "Guardando..." : operationId ? "Guardar cambios" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
