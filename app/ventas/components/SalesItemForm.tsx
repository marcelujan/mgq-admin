// =============================================
// app/ventas/components/SalesItemForm.tsx (V3)
// Artículo de VENTA independiente (con nombre propio),
// precarga desde proveedor y soporte para formulados
// =============================================
"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ===== Tipos =====
export type PriceRow = {
  product_id: number;
  product_presentation_id: number;
  nombre: string; // etiqueta legible (producto + proveedor + presentaciones)
  qty: number | null; // presentación del proveedor
  chosen_uom?: string | null; // UN | GR | ML
};

export type SalesItem = {
  id: number;
  product_id: number;
  supplier_presentation_id: number | null;
  vend_name: string; // << nombre de venta propio
  sku: string | null;
  vend_pres: number | null;
  vend_uom?: string | null;
  vend_lote?: string | null;
  vend_vence?: string | null; // YYYY-MM-DD
  vend_grado?: string | null;
  vend_origen?: string | null;
  vend_obs?: string | null;
  is_enabled: boolean;
};

export type FormulaLine = {
  key: string; // uid local
  product_id: number | null;
  product_presentation_id: number | null;
  nombre?: string;
  qty?: number | null; // cantidad o % (según modo)
  uom?: string | null; // UN/GR/ML si aplica
  mode: "pct" | "qty"; // modo de carga
};

export type SalesItemFormProps = {
  mode: "create" | "edit";
  initial?: Partial<SalesItem> & { id?: number };
  onSaved?: (item: SalesItem) => void;
};

export default function SalesItemForm({ mode, initial, onSaved }: SalesItemFormProps) {
  const router = useRouter();

  // === Catálogos ===
  const [uoms, setUoms] = useState<string[]>([]);

  // === Buscador (solo create) ===
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<PriceRow[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // === Estado base del artículo de venta ===
  const [productId, setProductId] = useState<number | null>(initial?.product_id ?? null);
  const [productPresentationId, setProductPresentationId] = useState<number | null>(
    (initial as any)?.product_presentation_id ?? initial?.supplier_presentation_id ?? null
  );

  const [vendName, setVendName] = useState<string>(initial?.vend_name ?? ""); // nombre propio del artículo de venta
  const [sku, setSku] = useState<string>(initial?.sku ?? "");
  const [vendPres, setVendPres] = useState<string>(
    initial?.vend_pres != null ? String(initial.vend_pres) : ""
  );
  const [vendUom, setVendUom] = useState<string>(initial?.vend_uom ?? "");
  const [lote, setLote] = useState<string>(initial?.vend_lote ?? "");
  const [vence, setVence] = useState<string>(initial?.vend_vence ?? ""); // YYYY-MM-DD
  const [grado, setGrado] = useState<string>(initial?.vend_grado ?? "");
  const [origen, setOrigen] = useState<string>(initial?.vend_origen ?? "");
  const [obs, setObs] = useState<string>(initial?.vend_obs ?? "");
  const [enabled, setEnabled] = useState<boolean>(initial?.is_enabled ?? true);

  // === Formulado ===
  const [isFormula, setIsFormula] = useState(false);
  const [lines, setLines] = useState<FormulaLine[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ===== Utilidades =====
  function toYMD(dmy: string) {
    // convierte dd/mm/aaaa -> aaaa-mm-dd si aplica
    const m = dmy?.match?.(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : dmy;
  }

  function fmtQty(q: any) {
    // 500.0000 -> 500 ; 1000.50 -> 1000.5
    const n = Number(q);
    if (!Number.isFinite(n)) return String(q ?? "");
    if (Number.isInteger(n)) return String(n);
    let s = n.toFixed(4);
    s = s.replace(/(\.\d*?[1-9])0+$|\.0+$/g, "$1");
    return s;
  }

  // ===== Carga de catálogos =====
  useEffect(() => {
    let cancelled = false;
    fetch("/api/uoms")
      .then((r) => r.json())
      .then((codes) => !cancelled && setUoms(Array.isArray(codes) ? codes : []))
      .catch(() => !cancelled && setUoms([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // ===== Búsqueda de presentaciones (solo create) =====
  useEffect(() => {
    if (mode !== "create") return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoadingOptions(true);
      try {
        const res = await fetch(`/api/price-list?q=${encodeURIComponent(q)}&show_all=1&limit=30`, {
          signal: ctl.signal,
          cache: "no-store",
        });
        const data = (await res.json()) as PriceRow[];
        setOptions(Array.isArray(data) ? data : []);
      } catch (e) {
        if ((e as any)?.name !== "AbortError") console.error(e);
      } finally {
        setLoadingOptions(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, mode]);

  // ===== Detalles proveedor para precarga =====
  async function fetchProvPreset(presId: number) {
    // principal (como está en tu deploy)
    try {
      const r = await fetch(`/api/sales-items/${presId}/prov-pres`, { cache: "no-store" });
      if (!r.ok) return null;
      const o = await r.json();
      return {
        lote: o?.lote ?? o?.vend_lote ?? o?.etiqueta_auto_lote ?? "",
        vence: toYMD(o?.vence ?? o?.vend_vence ?? o?.etiqueta_auto_vence ?? ""),
        grado: o?.grado ?? o?.vend_grado ?? o?.etiqueta_auto_grado ?? "",
        origen: o?.origen ?? o?.vend_origen ?? o?.etiqueta_auto_origen ?? "",
        obs: o?.obs ?? o?.vend_obs ?? o?.etiqueta_auto_obs ?? "",
        uom: o?.vend_uom ?? o?.uom ?? o?.chosen_uom ?? null,
        qty: o?.vend_pres ?? o?.qty ?? null,
      } as const;
    } catch {
      return null;
    }
  }

  // ===== Cuando el usuario elige una presentación =====
  async function chooseOption(p: PriceRow) {
    setProductId(p.product_id);
    setProductPresentationId(p.product_presentation_id);

    // Proponemos un nombre de venta editable desde el inicio
    setVendName(p.nombre);

    // Precarga cantidad/UOM base
    setVendPres(p.qty != null ? String(p.qty) : "");
    setVendUom(p.chosen_uom ?? "");

    // Precarga campos del proveedor
    const prov = await fetchProvPreset(p.product_presentation_id);
    if (prov) {
      setLote(prov.lote);
      setVence(prov.vence);
      setGrado(prov.grado);
      setOrigen(prov.origen);
      setObs(prov.obs);
      if (prov.uom) setVendUom(prov.uom);
      if (prov.qty != null) setVendPres(String(prov.qty));
    }
  }

  // ===== Formulado helpers =====
  function addLine() {
    setLines((xs) => [
      ...xs,
      { key: crypto.randomUUID(), product_id: null, product_presentation_id: null, mode: "pct" },
    ]);
  }
  function removeLine(key: string) {
    setLines((xs) => xs.filter((l) => l.key !== key));
  }
  function updateLine(key: string, patch: Partial<FormulaLine>) {
    setLines((xs) => xs.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // ===== Guardar =====
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        if (!productId || !productPresentationId) throw new Error("Elegí un producto/presentación");
        if (!vendName.trim()) throw new Error("Ingresá el nombre de venta");

        const body: any = {
          product_id: productId,
          supplier_presentation_id: productPresentationId,
          vend_name: vendName.trim(), // << nombre propio
          sku: sku?.trim() || null,
          vend_pres: vendPres?.trim() === "" ? null : Number(vendPres),
          vend_lote: lote?.trim() || null,
          vend_vence: vence?.trim() || null, // YYYY-MM-DD
          vend_grado: grado?.trim() || null,
          vend_origen: origen?.trim() || null,
          vend_obs: obs?.trim() || null,
          is_enabled: !!enabled,
          // vend_uom INTENCIONALMENTE NO se envía aquí (se setea con /api/uom-choice)
        };

        const res = await fetch("/api/sales-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`POST /api/sales-items → ${res.status}`);
        const { item } = (await res.json()) as { item: SalesItem };

        // si el usuario eligió UOM, aplicarla a la presentación
        if (vendUom && productPresentationId) {
          await fetch("/api/uom-choice", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productPresentationId, codigo: vendUom }),
          }).catch(console.error);
        }

        onSaved?.(item);
        router.push("/ventas");
        return;
      }

      // EDITAR
      if (!initial?.id) throw new Error("Falta id para editar");
      const patch: any = {
        vend_name: vendName.trim() || null, // << permitir editar el nombre de venta
        sku: sku?.trim() || null,
        vend_pres: vendPres?.trim() === "" ? null : Number(vendPres),
        vend_lote: lote?.trim() || null,
        vend_vence: vence?.trim() || null,
        vend_grado: grado?.trim() || null,
        vend_origen: origen?.trim() || null,
        vend_obs: obs?.trim() || null,
        is_enabled: !!enabled,
      };

      const r = await fetch(`/api/sales-items/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`PATCH /api/sales-items/${initial.id} → ${r.status}`);
      const data = (await r.json()) as { item: SalesItem };

      // UOM (si cambió) → aplicar a la presentación
      if (vendUom && (initial as any)?.supplier_presentation_id) {
        await fetch("/api/uom-choice", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productPresentationId: (initial as any).supplier_presentation_id, codigo: vendUom }),
        }).catch(console.error);
      }

      onSaved?.(data.item);
      router.push("/ventas");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  // ===== UI =====
  function OptionRow({ p, onClick }: { p: PriceRow; onClick: () => void }) {
    const provTxt = [fmtQty(p.qty), p.chosen_uom ?? ""].filter(Boolean).join(" ");
    return (
      <button type="button" onClick={onClick} className="w-full text-left p-2 hover:bg-zinc-900/10">
        <div className="text-sm font-medium truncate">{p.nombre}</div>
        <pre className="text-[11px] text-zinc-500 whitespace-pre-wrap leading-tight">{`Prov Pres  │ ${provTxt}`}</pre>
        <div className="text-[10px] text-zinc-500">{`prod ${p.product_id} · pres ${p.product_presentation_id}`}</div>
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
      {mode === "create" ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Producto / presentación</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            placeholder="Buscar por nombre o ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="border rounded-md divide-y max-h-72 overflow-auto">
            {loadingOptions && <div className="p-2 text-sm text-zinc-500">Buscando…</div>}
            {!loadingOptions && options.length === 0 && (
              <div className="p-2 text-sm text-zinc-500">Sin resultados</div>
            )}
            {options.map((p) => (
              <OptionRow key={`${p.product_id}-${p.product_presentation_id}`} p={p} onClick={() => chooseOption(p)} />
            ))}
          </div>
          {productPresentationId && (
            <div className="text-xs text-zinc-500">
              {`Seleccionado: prod ${productId} / pres ${productPresentationId}`}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium">Nombre de venta</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            placeholder="Ej: Alcohol Etílico 96° x 1 L (MGQ)"
            value={vendName}
            onChange={(e) => setVendName(e.target.value)}
          />
          <div className="text-[11px] text-zinc-500 mt-1">Este es el nombre que verá el cliente. Podés partir del sugerido y editarlo.</div>
        </div>

        <div>
          <label className="block text-sm font-medium">SKU</label>
          <input className="w-full border rounded-md px-3 py-2 bg-transparent" value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Habilitado</label>
          <label className="inline-flex items-center gap-2 mt-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="text-sm">Activo</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium">Presentación de venta</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            inputMode="decimal"
            value={vendPres}
            onChange={(e) => setVendPres(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">UOM de venta</label>
          <select className="w-full border rounded-md px-3 py-2 bg-transparent" value={vendUom} onChange={(e) => setVendUom(e.target.value)}>
            <option value="">—</option>
            {uoms.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Densidad removida: se hereda de proveedor */}
        <div>
          <label className="block text-sm font-medium">Lote</label>
          <input className="w-full border rounded-md px-3 py-2 bg-transparent" value={lote} onChange={(e) => setLote(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Vence</label>
          <input type="date" className="w-full border rounded-md px-3 py-2 bg-transparent" value={vence} onChange={(e) => setVence(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Grado</label>
          <input className="w-full border rounded-md px-3 py-2 bg-transparent" value={grado} onChange={(e) => setGrado(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Origen</label>
          <input className="w-full border rounded-md px-3 py-2 bg-transparent" value={origen} onChange={(e) => setOrigen(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium">Observaciones</label>
          <textarea className="w-full border rounded-md px-3 py-2 bg-transparent" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
      </div>

      {/* Formulado */}
      <div className="border rounded-lg p-3 space-y-3">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={isFormula} onChange={(e) => setIsFormula(e.target.checked)} />
          <span className="font-medium">Es un producto formulado</span>
        </label>
        {isFormula && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-400">Cargá componentes (en % o cantidades). Las densidades se heredan del proveedor.</div>
            {lines.map((l) => (
              <div key={l.key} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                <div className="md:col-span-5">
                  <input
                    placeholder="Buscar componente… (usá el buscador superior)"
                    className="w-full border rounded-md px-3 py-2 bg-transparent"
                    onFocus={() => setQ("")}
                    onChange={() => {}}
                  />
                  {l.nombre && <div className="text-[11px] text-zinc-500 truncate">{l.nombre}</div>}
                </div>
                <div className="md:col-span-2">
                  <select className="w-full border rounded-md px-2 py-2 bg-transparent" value={l.mode} onChange={(e) => updateLine(l.key, { mode: e.target.value as any })}>
                    <option value="pct">%</option>
                    <option value="qty">Cant.</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <input
                    inputMode="decimal"
                    placeholder={l.mode === "pct" ? "%" : "Cantidad"}
                    className="w-full border rounded-md px-3 py-2 bg-transparent text-right"
                    value={l.qty ?? ""}
                    onChange={(e) => updateLine(l.key, { qty: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="md:col-span-2">
                  <select className="w-full border rounded-md px-2 py-2 bg-transparent" value={l.uom ?? ""} onChange={(e) => updateLine(l.key, { uom: e.target.value || null })}>
                    <option value="">—</option>
                    {uoms.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-12">
                  <button type="button" className="text-xs text-red-500" onClick={() => removeLine(l.key)}>Quitar</button>
                </div>
              </div>
            ))}
            <button type="button" className="px-3 py-2 border rounded-md" onClick={addLine}>+ Agregar componente</button>
          </div>
        )}
      </div>

      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="px-4 py-2 border rounded-md">
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" disabled={saving} className="px-4 py-2 border rounded-md" onClick={() => router.back()}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// Notas:
// - No se solicitan campos de URL ni Densidad (esta última se hereda de proveedor).
// - Los campos Lote/Vence/Grado/Origen/Obs se precargan al elegir la presentación.
// - "vend_uom" no se envía en el POST de creación (se aplica vía PATCH /api/uom-choice).
