"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ComercialRow = {
  item_comercial_id: number;
  nombre: string | null;
  cantidad: number | null;
  unidad: string | null;
  origen_tipo: string | null;
  origen_ref_id: number | null;
  origen_label: string | null;
  origen_uom: string | null;
  densidad_g_ml: number | null;
  bulk_saldo: number;
  bulk_requerido: number | null;
  bulk_faltante: number;
  estado: "BORRADOR" | "OFERTABLE" | "BLOQUEADO";
  warnings_envases: number;
  warnings_etiquetas: number;
  warnings_detalle: string[];
};

type CompraRow = {
  key: string;
  item_tipo: string;
  item_ref_id: number;
  nombre: string;
  label: string;
  uom: string | null;
  saldo: number;
  faltante_total: number;
  comerciales_afectados: number;
  comerciales_labels: string[];
};

type EstadoFiltro = "" | "BORRADOR" | "OFERTABLE" | "BLOQUEADO" | "CON_ADVERTENCIAS";

function fmt(v: number | null | undefined, digits = 3) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(Number(v));
}

function colorOf(estado: ComercialRow["estado"]) {
  if (estado === "OFERTABLE") return "#22c55e";
  if (estado === "BLOQUEADO") return "#ef4444";
  return "#9ca3af";
}

export default function StockFaltantesClient() {
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<EstadoFiltro>("");
  const [comerciales, setComerciales] = useState<ComercialRow[]>([]);
  const [compras, setCompras] = useState<CompraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const qp = new URLSearchParams();
        if (search.trim()) qp.set("search", search.trim());
        if (estado) qp.set("estado", estado);
        const r = await fetch(`/api/stock-faltantes?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) {
          setComerciales((j.comerciales ?? []) as ComercialRow[]);
          setCompras((j.compras ?? []) as CompraRow[]);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(String(e?.message || e));
          setComerciales([]);
          setCompras([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [search, estado]);

  const summary = useMemo(() => {
    const borrador = comerciales.filter((x) => x.estado === "BORRADOR").length;
    const ofertable = comerciales.filter((x) => x.estado === "OFERTABLE").length;
    const bloqueado = comerciales.filter((x) => x.estado === "BLOQUEADO").length;
    const advertencias = comerciales.filter((x) => x.warnings_envases > 0 || x.warnings_etiquetas > 0).length;
    return { borrador, ofertable, bloqueado, advertencias };
  }, [comerciales]);

  const actionLink: React.CSSProperties = { textDecoration: "none", color: "inherit", fontSize: 12, opacity: 0.92, whiteSpace: "nowrap" };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar comercial o componente..." style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", outline: "none", width: 280 }} />
        <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoFiltro)} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", color: "inherit" }}>
          <option value="">Todos</option>
          <option value="BORRADOR">Borrador</option>
          <option value="OFERTABLE">Ofertable</option>
          <option value="BLOQUEADO">Bloqueado</option>
          <option value="CON_ADVERTENCIAS">Con advertencias</option>
        </select>
        <div style={{ fontSize: 12, opacity: 0.75 }}>{loading ? "Cargando..." : `${comerciales.length} comercial(es) · ${compras.length} faltante(s)`}</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/stock" style={actionLink}>Volver a Stock</Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, opacity: 0.8 }}>
        <div>Borrador: <b>{summary.borrador}</b></div>
        <div>Ofertable: <b>{summary.ofertable}</b></div>
        <div>Bloqueado: <b>{summary.bloqueado}</b></div>
        <div>Con advertencias: <b>{summary.advertencias}</b></div>
      </div>

      {err ? <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,90,90,0.08)", fontSize: 12 }}>{err}</div> : null}

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Faltantes / Compras</div>
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ maxHeight: 34 + 10 * 29, overflowY: "auto", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <th style={{ textAlign: "left", padding: "5px 8px", width: 95 }}>Tipo</th>
                  <th style={{ textAlign: "left", padding: "5px 8px", width: 80 }}>Item #</th>
                  <th style={{ textAlign: "left", padding: "5px 8px" }}>Nombre</th>
                  <th style={{ textAlign: "left", padding: "5px 8px", width: 70 }}>UOM</th>
                  <th style={{ textAlign: "right", padding: "5px 8px", width: 110 }}>Saldo</th>
                  <th style={{ textAlign: "right", padding: "5px 8px", width: 120 }}>Faltante</th>
                  <th style={{ textAlign: "right", padding: "5px 8px", width: 110 }}>Comerciales</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((r) => (
                  <tr key={r.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }} title={r.comerciales_labels.join("\n")}>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{r.item_tipo}</td>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{r.item_ref_id}</td>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.label}>{r.label}</td>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{r.uom ?? ""}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmt(r.saldo)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap", color: "#fbbf24" }}>{fmt(r.faltante_total)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{r.comerciales_afectados}</td>
                  </tr>
                ))}
                {!loading && compras.length === 0 ? <tr><td colSpan={7} style={{ padding: "8px 10px", opacity: 0.7 }}>Sin faltantes detectados.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Items Comerciales</div>
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ maxHeight: 34 + 10 * 29, overflowY: "auto", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <th style={{ textAlign: "left", padding: "5px 8px", width: 42 }}></th>
                  <th style={{ textAlign: "left", padding: "5px 8px", width: 80 }}>Item #</th>
                  <th style={{ textAlign: "left", padding: "5px 8px" }}>Nombre</th>
                  <th style={{ textAlign: "left", padding: "5px 8px", width: 220 }}>Bulk</th>
                  <th style={{ textAlign: "right", padding: "5px 8px", width: 110 }}>Req. bulk</th>
                  <th style={{ textAlign: "right", padding: "5px 8px", width: 110 }}>Saldo bulk</th>
                  <th style={{ textAlign: "center", padding: "5px 8px", width: 90 }}>Advert.</th>
                  <th style={{ textAlign: "left", padding: "5px 8px", width: 62 }}></th>
                </tr>
              </thead>
              <tbody>
                {comerciales.map((r) => {
                  const hasWarn = r.warnings_envases > 0 || r.warnings_etiquetas > 0;
                  const detail = [
                    r.estado === "BORRADOR" ? "Falta estructura mínima o densidad." : null,
                    r.bulk_faltante > 0 ? `Bulk insuficiente: faltan ${fmt(r.bulk_faltante)} ${r.origen_uom ?? ""}` : null,
                    ...r.warnings_detalle,
                  ].filter(Boolean).join("\n");
                  return (
                    <tr key={r.item_comercial_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }} title={detail}>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: colorOf(r.estado), verticalAlign: "middle" }} />
                      </td>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{r.item_comercial_id}</td>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.nombre ?? ""}</td>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.origen_label ?? ""}>{r.origen_label ?? "—"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmt(r.bulk_requerido)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap", color: r.bulk_faltante > 0 ? "#fbbf24" : undefined }}>{fmt(r.bulk_saldo)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", whiteSpace: "nowrap" }}>{hasWarn ? `E:${r.warnings_envases} · T:${r.warnings_etiquetas}` : "—"}</td>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}><Link href={`/items-comerciales/${r.item_comercial_id}`} style={{ textDecoration: "none", color: "inherit" }}>↗</Link></td>
                    </tr>
                  );
                })}
                {!loading && comerciales.length === 0 ? <tr><td colSpan={8} style={{ padding: "8px 10px", opacity: 0.7 }}>Sin resultados.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
