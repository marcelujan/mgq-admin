"use client";
import React from "react";
import ProveedorMinView from "./ProveedorMinView";
import VentasView from "./VentasView";

type TabKey = "proveedor" | "compras" | "productos" | "ventas";

const labels: Record<TabKey, string> = {
  proveedor: "Proveedor",
  compras: "Compras",
  productos: "Productos",
  ventas: "Ventas",
};

export default function HomeTabs({
  active,
  onChange,
}: {
  active: TabKey;
  onChange?: (k: TabKey) => void;
}) {
  const { tab, change } = useHashTab(active || "proveedor");

  React.useEffect(() => {
    if (onChange) onChange(tab);
  }, [tab, onChange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(labels) as TabKey[]).map(k => (
          <button
            key={k}
            onClick={() => change(k)}
            className={`px-4 py-2 rounded-2xl border shadow-sm hover:shadow ${tab===k ? "bg-gray-100" : ""}`}
          >
            {labels[k]}
          </button>
        ))}
      </div>

      {tab === "proveedor" && <ProveedorMinView />}
      {tab === "compras" && <Placeholder title="Compras" />}
      {tab === "productos" && <Placeholder title="Productos" />}
      {tab === "ventas" && <VentasView />}
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return <div className="p-4 text-sm opacity-80">{title} — (pendiente de definir)</div>;
}

function useHashTab(initial: TabKey) {
  const [tab, setTab] = React.useState<TabKey>(initial);
  React.useEffect(() => {
    const h = window.location.hash.replace("#", "") as TabKey;
    if (h && ["proveedor", "compras", "productos", "ventas"].includes(h)) setTab(h);
  }, []);
  React.useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "") as TabKey;
      if (h && ["proveedor", "compras", "productos", "ventas"].includes(h)) setTab(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const change = (k: TabKey) => {
    if (typeof window !== "undefined") window.location.hash = k;
    setTab(k);
  };
  return { tab, change };
}