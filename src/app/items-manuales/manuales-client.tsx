"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CostOption = {
  cost_option_id: number;
  tipo: string;
  manual_nombre: string | null;
  manual_uom: string | null;
  manual_cantidad: number | null;
  manual_costo_ars: number | null;
  densidad_g_ml: number | null;
  activo: boolean;
};

function fmtNum(n: number | null | undefined, digits: number): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n));
}

export default function ManualesClient() {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CostOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const qp = new URLSearchParams();
        qp.set("solo_seleccionados", "false");
        qp.set("limit", "800");
        if (search.trim()) qp.set("search", search.trim());

        const r = await fetch(`/api/cost-options?${qp.toString()}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

        const all = (j.cost_options_extra ?? []) as CostOption[];
        const manuales = all.filter((x) => x.tipo === "MANUAL_PRESENTACION" && x.activo === true);
        if (cancelled) return;
        setRows(manuales);
      } catch (e: any) {
        if (cancelled) return;
        setErr(String(e?.message || e));
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [search]);

  const count = rows.length;

  const headerRight = useMemo(() => {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.03)",
            color: "rgba(255,255,255,0.92)",
            outline: "none",
            width: 260,
          }}
        />
        <div style={{ fontSize: 12, opacity: 0.7 }}>{loading ? "Cargando..." : `${count} manual(es)`}</div>
      </div>
    );
  }, [search, loading, count]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Listado</h2>
        {headerRight}
      </div>

      {err ? (
        <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,90,90,0.08)" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
          <div style={{ fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>{err}</div>
        </div>
      ) : null}

      <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
              <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>ID</th>
              <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Nombre</th>
              <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>UOM</th>
              <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Cantidad</th>
              <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Costo (ARS)</th>
              <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Densidad</th>
              <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cost_option_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "10px 12px", opacity: 0.85 }}>{r.cost_option_id}</td>
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.manual_nombre ?? ""}</td>
                <td style={{ padding: "10px 12px", opacity: 0.85 }}>{r.manual_uom ?? ""}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", opacity: 0.9 }}>{fmtNum(r.manual_cantidad, 2)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", opacity: 0.9 }}>{fmtNum(r.manual_costo_ars, 2)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", opacity: 0.9 }}>{fmtNum(r.densidad_g_ml, 3)}</td>
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link
                      href={`/items/${encodeURIComponent(`mopt:${r.cost_option_id}`)}`}
                      style={{ textDecoration: "none", opacity: 0.9 }}
                      title="Ver detalle (gráficos) en Items"
                    >
                      Ver
                    </Link>
                    <Link href={`/items-manuales/${r.cost_option_id}`} style={{ textDecoration: "none", opacity: 0.9 }} title="Editar manual">
                      Editar
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "12px", opacity: 0.7 }}>
                  Sin resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
