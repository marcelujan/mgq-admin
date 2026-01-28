"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ItemRow = {
  item_id: number;
  proveedor_id: number;
  proveedor_codigo?: string | null;
  proveedor_nombre?: string | null;
  motor_id: number;
  url_original: string;
  url_canonica: string;
  seleccionado: boolean;
  estado: string;
  updated_at: string;
  created_at: string;
  ultimo_job_id?: number | null;
  ultimo_job_estado?: string | null;

  // compat (por si tu API usa estos nombres)
  last_job_id?: number | null;
  last_job_estado?: string | null;
};

type PreviewRow = {
  url: string;
  status: "OK" | "WARNING" | "ERROR";
  title?: string | null;
  sku?: string | null;
  prices?: Array<{ presentacion: number; priceArs: number }>;
  warnings?: string[];
  errors?: string[];
};

function splitUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ItemsPage() {
  // list
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [q, setQ] = useState("");

  // bulk add
  const [proveedorId, setProveedorId] = useState<number>(0);
  const [motorId, setMotorId] = useState<number>(0);
  const [urlsText, setUrlsText] = useState<string>("");

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  const [commitLoading, setCommitLoading] = useState(false);
  const [commitErr, setCommitErr] = useState<string | null>(null);
  const [commitOkMsg, setCommitOkMsg] = useState<string | null>(null);

  // ===== Helpers: infer providers list from current items =====
  const providers = useMemo(() => {
    const map = new Map<
      number,
      { proveedor_id: number; proveedor_nombre: string; proveedor_codigo?: string | null; motor_id: number }
    >();

    for (const it of items) {
      const pid = Number(it.proveedor_id);
      if (!Number.isFinite(pid)) continue;

      const nombre = String(it.proveedor_nombre ?? it.proveedor_codigo ?? `Proveedor ${pid}`);
      const motor = Number(it.motor_id);

      if (!map.has(pid)) {
        map.set(pid, {
          proveedor_id: pid,
          proveedor_nombre: nombre,
          proveedor_codigo: it.proveedor_codigo ?? null,
          motor_id: Number.isFinite(motor) ? motor : 0,
        });
      } else {
        // si ya existe, pero el motor_id estaba en 0 y encontramos uno válido, lo completamos
        const cur = map.get(pid)!;
        if ((!cur.motor_id || cur.motor_id === 0) && Number.isFinite(motor) && motor > 0) {
          cur.motor_id = motor;
          map.set(pid, cur);
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.proveedor_nombre.localeCompare(b.proveedor_nombre));
  }, [items]);

  const providerById = useMemo(() => {
    const m = new Map<number, { motor_id: number; proveedor_nombre: string; proveedor_codigo?: string | null }>();
    for (const p of providers) m.set(p.proveedor_id, p);
    return m;
  }, [providers]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/items?limit=200&offset=0`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setItems((data.items ?? []) as ItemRow[]);
    } catch (e: any) {
      setErr(e?.message || "Error cargando items");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Inicializar proveedorId/motorId en base a lo que haya en items
  useEffect(() => {
    if (proveedorId > 0) return;
    if (providers.length === 0) return;
    const first = providers[0];
    setProveedorId(first.proveedor_id);
    setMotorId(first.motor_id || 0);
  }, [providers, proveedorId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;

    return items.filter((it) => {
      const proveedorNombre = (it.proveedor_nombre ?? "").toLowerCase();
      const proveedorCodigo = (it.proveedor_codigo ?? "").toLowerCase();
      const estado = (it.estado ?? "").toLowerCase();
      const uo = (it.url_original ?? "").toLowerCase();
      const uc = (it.url_canonica ?? "").toLowerCase();

      return (
        String(it.item_id).includes(needle) ||
        uo.includes(needle) ||
        uc.includes(needle) ||
        String(it.proveedor_id).includes(needle) ||
        proveedorNombre.includes(needle) ||
        proveedorCodigo.includes(needle) ||
        String(it.motor_id).includes(needle) ||
        estado.includes(needle)
      );
    });
  }, [items, q]);

  async function runPreview() {
    setPreviewErr(null);
    setCommitErr(null);
    setCommitOkMsg(null);
    setPreviewRows([]);

    const urls = splitUrls(urlsText);
    if (urls.length === 0) {
      setPreviewErr("Pegá al menos 1 URL (una por línea).");
      return;
    }

    const inferredMotor = providerById.get(proveedorId)?.motor_id ?? motorId;

    if (!proveedorId || !inferredMotor) {
      setPreviewErr("Seleccioná un proveedor (y que tenga motor asociado).");
      return;
    }

    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/ofertas/bulk/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proveedor_id: proveedorId,
          motor_id: inferredMotor,
          urls,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setPreviewRows((data.previews ?? data.rows ?? []) as PreviewRow[]);
    } catch (e: any) {
      setPreviewErr(e?.message || "Error en preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function commitCreate() {
    setCommitErr(null);
    setCommitOkMsg(null);

    const urls = splitUrls(urlsText);
    if (urls.length === 0) {
      setCommitErr("Pegá al menos 1 URL.");
      return;
    }

    const inferredMotor = providerById.get(proveedorId)?.motor_id ?? motorId;

    if (!proveedorId || !inferredMotor) {
      setCommitErr("Seleccioná un proveedor (y que tenga motor asociado).");
      return;
    }

    setCommitLoading(true);
    try {
      const res = await fetch(`/api/ofertas/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proveedor_id: proveedorId,
          motor_id: inferredMotor,
          urls,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setCommitOkMsg(
        `OK. items_creados=${data.items_created ?? "?"}, offers_creadas=${data.offers_created ?? "?"}`
      );

      await load();
    } catch (e: any) {
      setCommitErr(e?.message || "Error creando items/offers");
    } finally {
      setCommitLoading(false);
    }
  }

  const previewOkCount = previewRows.filter((r) => r.status === "OK" || r.status === "WARNING").length;
  const previewErrCount = previewRows.filter((r) => r.status === "ERROR").length;

  const selectedProvider = proveedorId ? providerById.get(proveedorId) : null;
  const effectiveMotorId = selectedProvider?.motor_id ?? motorId;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Items</h1>
        <button onClick={load} disabled={loading} style={{ padding: "6px 10px" }}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por id / url / proveedor / estado..."
          style={{ flex: 1, padding: "6px 10px" }}
        />
      </div>

      {/* === Alta por URLs (provider friendly) === */}
      <div style={{ border: "1px solid #333", padding: 12, borderRadius: 8, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Agregar nuevas URLs (crea item + offers por presentación)</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4, minWidth: 260 }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>Proveedor</span>
            <select
              value={proveedorId || ""}
              onChange={(e) => {
                const pid = Number(e.target.value);
                setProveedorId(pid);
                const m = providerById.get(pid)?.motor_id ?? 0;
                if (m) setMotorId(m);
              }}
              style={{ padding: "6px 10px" }}
            >
              {providers.length === 0 ? (
                <option value="">(No hay proveedores en la lista todavía)</option>
              ) : (
                providers.map((p) => (
                  <option key={p.proveedor_id} value={p.proveedor_id}>
                    {p.proveedor_nombre}
                  </option>
                ))
              )}
            </select>
          </label>

          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>motor_id (auto)</span>
            <input
              value={effectiveMotorId || ""}
              readOnly
              style={{
                padding: "6px 10px",
                width: 140,
                opacity: 0.9,
                background: "transparent",
                border: "1px solid #333",
                color: "inherit",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
            <button onClick={runPreview} disabled={previewLoading} style={{ padding: "6px 10px" }}>
              {previewLoading ? "Preview..." : "Preview"}
            </button>

            <button
              onClick={commitCreate}
              disabled={commitLoading}
              style={{ padding: "6px 10px" }}
              title="Crea item (si no existe) y offers por presentación en app.offers"
            >
              {commitLoading ? "Creando..." : "Crear items + offers"}
            </button>
          </div>
        </div>

        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder={"Pegá URLs (una por línea)\nEj:\nhttps://puraquimica.com.ar/producto/.../"}
          rows={6}
          style={{ width: "100%", padding: 10, fontFamily: "ui-monospace, monospace" }}
        />

        {previewErr && <div style={{ color: "#ff8080" }}>Preview error: {previewErr}</div>}
        {commitErr && <div style={{ color: "#ff8080" }}>Create error: {commitErr}</div>}
        {commitOkMsg && <div style={{ color: "#7CFC90" }}>{commitOkMsg}</div>}

        {previewRows.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, opacity: 0.9 }}>
              Preview: OK/WARN={previewOkCount} · ERROR={previewErrCount}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    {["status", "url", "presentaciones (extraídas)", "warnings/errors"].map((h) => (
                      <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, idx) => (
                    <tr key={`${r.url}-${idx}`}>
                      <td style={{ borderBottom: "1px solid #222" }}>{r.status}</td>
                      <td style={{ borderBottom: "1px solid #222", maxWidth: 520, wordBreak: "break-all" }}>
                        {r.url}
                      </td>
                      <td style={{ borderBottom: "1px solid #222" }}>
                        {(r.prices ?? []).map((p) => `${p.presentacion}: $${p.priceArs}`).join(" · ")}
                      </td>
                      <td style={{ borderBottom: "1px solid #222" }}>
                        {r.warnings?.length ? `W: ${r.warnings.join(" | ")}` : ""}
                        {r.errors?.length ? ` E: ${r.errors.join(" | ")}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Nota: el commit guarda *todas* las presentaciones que el motor encuentre (no elegís una).
            </div>
          </div>
        )}

        {providers.length === 0 && (
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Importante: este selector arma la lista de proveedores a partir de los items ya existentes. Si querés cargar
            un proveedor “nuevo” que todavía no aparece, necesitás un endpoint de “proveedores” para poblar el dropdown.
          </div>
        )}
      </div>

      {/* Errores list */}
      {err && (
        <div style={{ padding: 10, border: "1px solid #c00" }}>
          <b>Error:</b> {err}
        </div>
      )}

      {/* Tabla items */}
      {loading ? (
        <div>Cargando.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {[
                  "item_id",
                  "proveedor",
                  "motor_id",
                  "estado",
                  "seleccionado",
                  "url_canonica",
                  "updated_at",
                  "último_job_id",
                  "último_job_estado",
                ].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.map((it) => {
                const ultimoJobId = it.ultimo_job_id ?? it.last_job_id ?? null;
                const ultimoJobEstado = it.ultimo_job_estado ?? it.last_job_estado ?? null;

                return (
                  <tr key={it.item_id}>
                    <td style={{ borderBottom: "1px solid #222" }}>
                      <Link
                        href={`/items/${it.item_id}`}
                        style={{ textDecoration: "underline", color: "inherit" }}
                        title={`Ver detalle / histórico de item ${it.item_id}`}
                      >
                        {it.item_id}
                      </Link>
                    </td>

                    <td style={{ borderBottom: "1px solid #222" }}>
                      {it.proveedor_nombre ?? it.proveedor_codigo ?? it.proveedor_id}
                    </td>

                    <td style={{ borderBottom: "1px solid #222" }}>{it.motor_id}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{it.estado}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{it.seleccionado ? "true" : "false"}</td>

                    <td style={{ borderBottom: "1px solid #222", maxWidth: 520, wordBreak: "break-all" }}>
                      {it.url_canonica}
                    </td>

                    <td style={{ borderBottom: "1px solid #222" }}>{it.updated_at}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{ultimoJobId ?? ""}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{ultimoJobEstado ?? ""}</td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 12 }}>
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
