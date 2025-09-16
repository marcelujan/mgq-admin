// =============================================
// app/ventas/components/SalesItemForm.tsx (V2)
// =============================================
"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Tipos de búsqueda (precio/presentación) — ajusta si tu API devuelve otros campos
export type PriceRow = {
  product_id: number;
  product_presentation_id: number;
  nombre: string;            // Nombre de producto + proveedor
  qty: number | null;        // Presentación proveedor
  chosen_uom?: string | null; // UN | GR | ML
  prov_pres_fmt?: string | null; // (no lo usamos para el formato)
};

export type SalesItem = {
  id: number;
  product_id: number;
  supplier_presentation_id: number | null;
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

// Para formulados (líneas de componentes)
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

  // Catálogos
  const [uoms, setUoms] = useState<string[]>([]);

  // Buscador (solo create)
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<PriceRow[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Estado base
  const [productId, setProductId] = useState<number | null>(initial?.product_id ?? null);
  const [productPresentationId, setProductPresentationId] = useState<number | null>(
    (initial as any)?.product_presentation_id ?? initial?.supplier_presentation_id ?? null
  );
  const [nombreProducto, setNombreProducto] = useState<string>("");

  const [sku, setSku] = useState<string>(initial?.sku ?? "");
  const [vendPres, setVendPres] = useState<string>(
    initial?.vend_pres != null ? String(initial.vend_pres) : ""
  );
  const [vendUom, setVendUom] = useState<string>(initial?.vend_uom ?? "");
  const [lote, setLote] = useState<string>(initial?.vend_lote ?? "");
  const [vence, setVence] = useState<string>(initial?.vend_vence ?? "");
  const [grado, setGrado] = useState<string>(initial?.vend_grado ?? "");
  const [origen, setOrigen] = useState<string>(initial?.vend_origen ?? "");
  const [obs, setObs] = useState<string>(initial?.vend_obs ?? "");
  const [enabled, setEnabled] = useState<boolean>(initial?.is_enabled ?? true);

  // Formulado
  const [isFormula, setIsFormula] = useState(false);
  const [lines, setLines] = useState<FormulaLine[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar UOMs
  useEffect(() => {
    let cancelled = false;
    fetch("/api/uoms")
      .then((r) => r.json())
      .then((codes) => {
        if (!cancelled) setUoms(Array.isArray(codes) ? codes : []);
      })
      .catch(() => !cancelled && setUoms([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // Buscar productos/presentaciones (solo create)
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

  // Helper para traer detalles de proveedor de la presentación elegida
  async function fetchProvPreset(presId: number) {
    const urls = [
      "/api/presentation?id=" + presId,
      "/api/presentation?presentationId=" + presId,
      "/api/presentation/" + presId,
      "/api/sales-items/" + presId + "/prov-pres",
    ];
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (!r.ok) continue;
        const j = await r.json();
        // des-encapsular formatos comunes: {item}, {presentation}, {rows[0]}, o el objeto plano
        const src = j?.item ?? j?.presentation ?? j?.rows?.[0] ?? j;
        return {
          lote:   src?.lote   ?? src?.vend_lote   ?? src?.etiqueta_auto_lote   ?? "",
          vence:  src?.vence  ?? src?.vend_vence  ?? src?.etiqueta_auto_vence  ?? "",
          grado:  src?.grado  ?? src?.vend_grado  ?? src?.etiqueta_auto_grado  ?? "",
          origen: src?.origen ?? src?.vend_origen ?? src?.etiqueta_auto_origen ?? "",
          obs:    src?.obs    ?? src?.vend_obs    ?? src?.etiqueta_auto_obs    ?? "",
          vend_uom:  src?.vend_uom ?? src?.uom ?? src?.chosen_uom ?? null,
          vend_pres: src?.vend_pres ?? src?.qty ?? null,
        };
      } catch {
        // probar siguiente URL
      }
    }
    return null;
  }

  // Elegir una opción autocompleta
  async function chooseOption(p: PriceRow) {
    setProductId(p.product_id);
    setProductPresentationId(p.product_presentation_id);
    setNombreProducto(p.nombre);
    setVendPres(p.qty != null ? String(p.qty) : "");
    setVendUom(p.chosen_uom ?? "");

    // Precarga de campos desde proveedor
    const prov = await fetchProvPreset(p.product_presentation_id);
    if (prov) {
      setLote(prov.lote ?? "");
      setVence(prov.vence ?? "");
      setGrado(prov.grado ?? "");
      setOrigen(prov.origen ?? "");
      setObs(prov.obs ?? "");
      if (prov.vend_uom) setVendUom(prov.vend_uom);
      if (prov.vend_pres != null) setVendPres(String(prov.vend_pres));
    }
  }

  // Formulado — helpers
  function addLine() {
    const key = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
    setLines((xs) => [
      ...xs,
      { key, product_id: null, product_presentation_id: null, mode: "pct" },
    ]);
  }
  function removeLine(key: string) {
    setLines((xs) => xs.filter((l) => l.key !== key));
  }
  function updateLine(key: string, patch: Partial<FormulaLine>) {
    setLines((xs) => xs.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        if (!productId || !productPresentationId) {
          throw new Error("Elegí un producto/presentación");
        }
        const body: any = {
          product_id: productId,
          supplier_presentation_id: productPresentationId,
          sku: sku?.trim() || null,
          vend_pres: vendPres?.trim() === "" ? null : Number(vendPres),
          vend_lote: lote?.trim() || null,
          vend_vence: vence?.trim() || null,
          vend_grado: grado?.trim() || null,
          vend_origen: origen?.trim() || null,
          vend_obs: obs?.trim() || null,
          vend_uom: vendUom || null,
          is_enabled: !!enabled,
          // Formulado opcional
          is_formula: isFormula || undefined,
          formula: isFormula
            ? lines.map((l) => ({
                product_id: l.product_id,
                product_presentation_id: l.product_presentation_id,
                qty: l.qty ?? null,
                uom: l.uom ?? null,
                mode: l.mode,
              }))
            : undefined,
        };
        const res = await fetch("/api/sales-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`POST /api/sales-items → ${res.status}`);
        const { item } = (await res.json()) as { item: SalesItem };

        // Si el usuario eligió UOM, aplicarla a la presentación
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

      // EDIT
      if (!initial?.id) throw new Error("Falta id para editar");
      const patch: any = {
        sku: sku?.trim() || null,
        vend_pres: vendPres?.trim() === "" ? null : Number(vendPres),
        vend_lote: lote?.trim() || null,
        vend_vence: vence?.trim() || null,
        vend_grado: grado?.trim() || null,
        vend_origen: origen?.trim() || null,
        vend_obs: obs?.trim() || null,
        vend_uom: vendUom || null,
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

  // Render de opción con “formato proveedor” pero con cantidades limpias
  function fmtQty(q: any) {
    if (q == null) return "";
    const n = Number(q);
    if (!Number.isFinite(n)) return String(q);
    // entero → sin decimales; si no, hasta 3 dec y sin ceros de cola
    return Number.isInteger(n) ? String(n) : String(+n.toFixed(3)).replace(/\.?0+$/,"");
  }

  function OptionRow({ p, onClick }: { p: PriceRow; onClick: () => void }) {
    // Siempre formateamos nosotros: qty + UOM
    const provTxt = [fmtQty(p.qty), p.chosen_uom ?? ""].filter(Boolean).join(" ");
    return (
      <button type="button" onClick={onClick} className="w-full text-left p-2 hover:bg-zinc-900/10">
        <div className="text-sm font-medium truncate">{p.nombre}</div>
        <pre className="text-[11px] text-zinc-500 whitespace-pre-wrap leading-tight">
          {"Prov Pres  │ " + provTxt}
        </pre>
        <div className="text-[10px] text-zinc-500">
          {"prod " + p.product_id + " · pres " + p.product_presentation_id}
        </div>
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
              <OptionRow
                key={`${p.product_id}-${p.product_presentation_id}`}
                p={p}
                onClick={() => chooseOption(p)}
              />
            ))}
          </div>
          {productPresentationId && (
            <div className="text-xs text-zinc-500">
              Seleccionado: {nombreProducto} (prod {productId} / pres {productPresentationId})
            </div>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">SKU</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Habilitado</label>
          <label className="inline-flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
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
          <select
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={vendUom}
            onChange={(e) => setVendUom(e.target.value)}
          >
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
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={lote}
            onChange={(e) => setLote(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Vence</label>
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={vence}
            onChange={(e) => setVence(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Grado</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={grado}
            onChange={(e) => setGrado(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Origen</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium">Observaciones</label>
          <textarea
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            rows={3}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </div>
      </div>

      {/* Formulado */}
      <div className="border rounded-lg p-3 space-y-3">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isFormula}
            onChange={(e) => setIsFormula(e.target.checked)}
          />
          <span className="font-medium">Es un producto formulado</span>
        </label>
        {isFormula && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-400">
              Cargá componentes (en % o cantidades). Las densidades se heredan del proveedor.
            </div>
            {lines.map((l) => (
              <div key={l.key} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                <div className="md:col-span-5">
                  <input
                    placeholder="Buscar componente… (abrirá lista arriba)"
                    className="w-full border rounded-md px-3 py-2 bg-transparent"
                    onFocus={() => setQ("")}
                    onChange={() => {}}
                  />
                  {l.nombre && (
                    <div className="text-[11px] text-zinc-500 truncate">{l.nombre}</div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <select
                    className="w-full border rounded-md px-2 py-2 bg-transparent"
                    value={l.mode}
                    onChange={(e) => updateLine(l.key, { mode: e.target.value as any })}
                  >
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
                    onChange={(e) =>
                      updateLine(l.key, {
                        qty: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <select
                    className="w-full border rounded-md px-2 py-2 bg-transparent"
                    value={l.uom ?? ""}
                    onChange={(e) => updateLine(l.key, { uom: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {uoms.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-12">
                  <button
                    type="button"
                    className="text-xs text-red-500"
                    onClick={() => removeLine(l.key)}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="px-3 py-2 border rounded-md" onClick={addLine}>
              + Agregar componente
            </button>
          </div>
        )}
      </div>

      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="px-4 py-2 border rounded-md">
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          disabled={saving}
          className="px-4 py-2 border rounded-md"
          onClick={() => router.back()}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// =============================================
// Nota: No se muestran campos de URL ni Densidad en el formulario (Densidad se hereda).
// Los campos Lote/Vence/Grado/Origen/Obs se precargan al elegir la presentación.
