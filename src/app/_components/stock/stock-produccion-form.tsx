"use client";

import { useEffect, useMemo, useState } from "react";
import StockTargetPicker, { type StockTargetItem } from "./stock-target-picker";

type Line = {
  key: string;
  item: StockTargetItem;
  cantidad: string;
  sugerido?: boolean;
  pct_peso?: number | null;
  cantidad_necesaria?: number | null;
  volumen_eq_ml?: number | null;
};

function formatDateInput(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayDateInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtNum(v: any, max = 4) {
  if (v === null || v === undefined || v === "") return "";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: max }).format(Number(v));
}

function parsePositive(v: string) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function StockProduccionForm({ operationId }: { operationId?: number }) {
  const [fecha, setFecha] = useState(todayDateInput());
  const [loteObjetivo, setLoteObjetivo] = useState("");
  const [output, setOutput] = useState<StockTargetItem | null>(null);
  const [cantidadObtenida, setCantidadObtenida] = useState("");
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
          setFecha(formatDateInput(op?.fecha) || todayDateInput());
          if (out) {
            const nextOutput: StockTargetItem = {
              item_tipo: out.item_tipo,
              item_ref_id: Number(out.item_ref_id),
              label: out.label ?? out.nombre,
              nombre: out.nombre,
              uom: out.uom,
              saldo: out.saldo,
              densidad_g_ml: out.densidad_g_ml,
            };
            const cantidadReal = String(Math.abs(Number(out.delta_cantidad ?? 0)));
            setOutput(nextOutput);
            setCantidadObtenida(cantidadReal);
            setLoteObjetivo(cantidadReal);
          }
          setConsumos(ins.map((m: any) => ({
            key: String(m.stock_movimiento_id ?? `${m.item_tipo}:${m.item_ref_id}`),
            item: {
              item_tipo: m.item_tipo,
              item_ref_id: Number(m.item_ref_id),
              label: m.label ?? m.nombre,
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

  const selectedFormuladoId = output?.item_ref_id ?? null;
  useEffect(() => {
    if (!selectedFormuladoId || operationId) return;
    let cancelled = false;
    async function loadSuggestion() {
      setLoadingSuggestion(true);
      try {
        const qp = new URLSearchParams({ formulado_item_formulado_id: String(selectedFormuladoId) });
        const lote = parsePositive(loteObjetivo);
        if (lote) qp.set("lote_objetivo", String(lote));
        const r = await fetch(`/api/stock-operaciones/produccion/sugerencia?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) {
          if (!lote && j.lote_objetivo_g != null) setLoteObjetivo(String(j.lote_objetivo_g));
          if (j.lote_objetivo_g != null) setCantidadObtenida((prev) => prev || String(j.lote_objetivo_g));
          setConsumos((j.consumos ?? []).map((x: any, idx: number) => ({
            key: `${x.item_tipo}:${x.item_ref_id}:${idx}`,
            item: {
              item_tipo: x.item_tipo,
              item_ref_id: Number(x.item_ref_id),
              label: x.label ?? x.nombre,
              nombre: x.nombre,
              uom: x.uom,
              saldo: x.saldo,
              densidad_g_ml: x.densidad_g_ml,
            },
            cantidad: String(x.cantidad ?? ""),
            sugerido: true,
            pct_peso: x.pct_peso ?? null,
            cantidad_necesaria: x.cantidad_necesaria ?? null,
            volumen_eq_ml: x.volumen_eq_ml ?? null,
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
  }, [selectedFormuladoId, loteObjetivo, operationId]);

  function addConsumoItem(item: StockTargetItem | null) {
    if (!item) return;
    setConsumos((prev) => {
      const prefix = `${item.item_tipo}:${item.item_ref_id}`;
      if (prev.some((x) => x.key.startsWith(prefix))) return prev;
      return [...prev, { key: `${prefix}:${Date.now()}`, item: { ...item, label: item.label ?? item.nombre }, cantidad: "1" }];
    });
  }

  async function submit() {
    if (!output) {
      setErr("Seleccioná el formulado obtenido.");
      return;
    }
    if (!fecha) {
      setErr("La fecha es obligatoria.");
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
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,220px) minmax(0,220px)", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Fecha</div>
          <input value={fecha} onChange={(e) => setFecha(e.target.value)} type="date" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }} />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Tamaño del lote</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
            <input value={loteObjetivo} onChange={(e) => setLoteObjetivo(e.target.value)} placeholder="Cantidad" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", textAlign: "right" }} />
            <div style={{ fontSize: 12, opacity: 0.8, minWidth: 28, textAlign: "right" }}>{output?.uom ?? ""}</div>
          </div>
        </div>
      </div>

      <StockTargetPicker
        allowedTypes={["FORMULADO"]}
        value={output}
        onChange={(item) => {
          const next = item ? { ...item, label: item.label ?? item.nombre } : null;
          setOutput(next);
          if (!next) {
            setCantidadObtenida("");
            setConsumos([]);
          }
        }}
        label=""
        placeholder="Buscar formulado..."
      />

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Producto obtenido</div>
        <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 80 }}>Item #</th>
                <th style={{ textAlign: "left", padding: "5px 8px" }}>Formulado</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 70 }}>Dens.</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 180 }}>Cantidad real</th>
              </tr>
            </thead>
            <tbody>
              {outputRows.map((line) => (
                <tr key={line.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{line.item.item_ref_id}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={line.item.label}>{line.item.label}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtNum(line.item.densidad_g_ml)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
                      <input value={line.cantidad} onChange={(e) => setCantidadObtenida(e.target.value)} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "4px 8px", background: "rgba(255,255,255,0.03)", color: "inherit", textAlign: "right" }} />
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{line.item.uom ?? ""}</div>
                    </div>
                  </td>
                </tr>
              ))}
              {!output ? <tr><td colSpan={4} style={{ padding: "8px", opacity: 0.7 }}>Seleccioná un formulado.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Componentes utilizados {loadingSuggestion ? <span style={{ fontSize: 12, opacity: 0.7 }}>· sugiriendo fórmula…</span> : null}</div>
        <StockTargetPicker
          allowedTypes={["MANUAL", "PROVEEDOR", "FORMULADO"]}
          value={null}
          onChange={addConsumoItem}
          label=""
          placeholder="Buscar componente..."
          maxVisibleRows={4}
        />
        <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 80 }}>Item #</th>
                <th style={{ textAlign: "left", padding: "5px 8px" }}>Componente</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 70 }}>% p/p</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 140 }}>Cant. necesaria</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 70 }}>Dens.</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 130 }}>Vol. eq.</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: 150 }}>Cantidad real</th>
                <th style={{ textAlign: "left", padding: "5px 8px", width: 42 }}></th>
              </tr>
            </thead>
            <tbody>
              {consumos.map((line) => (
                <tr key={line.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{line.item.item_ref_id}</td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={line.item.label}>{line.item.label}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtNum(line.pct_peso, 3)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{line.cantidad_necesaria != null ? `${fmtNum(line.cantidad_necesaria)} ${line.item.uom ?? ""}` : ""}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtNum(line.item.densidad_g_ml)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{line.volumen_eq_ml != null ? `${fmtNum(line.volumen_eq_ml)} ML` : ""}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
                      <input value={line.cantidad} onChange={(e) => setConsumos((prev) => prev.map((x) => x.key === line.key ? { ...x, cantidad: e.target.value } : x))} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "4px 8px", background: "rgba(255,255,255,0.03)", color: "inherit", textAlign: "right" }} />
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{line.item.uom ?? ""}</div>
                    </div>
                  </td>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}><button type="button" onClick={() => setConsumos((prev) => prev.filter((x) => x.key !== line.key))} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: "pointer", opacity: 0.9 }}>✕</button></td>
                </tr>
              ))}
              {consumos.length === 0 ? <tr><td colSpan={8} style={{ padding: "8px", opacity: 0.7 }}>Sin componentes cargados.</td></tr> : null}
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
