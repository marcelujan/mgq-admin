"use client";
import React from "react";

type TabKey = "proveedor" | "ventas" | "formulados";

const labels: Record<TabKey, string> = {
  proveedor: "Proveedor",
  ventas: "Ventas",
  formulados: "Formulados",
};

export default function HomeTabs({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {(Object.keys(labels) as TabKey[]).map((k) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={[
            "px-3 py-2 rounded-md border text-sm",
            active === k ? "bg-zinc-800 text-white" : "bg-transparent hover:bg-zinc-900/10",
          ].join(" ")}
        >
          {labels[k]}
        </button>
      ))}
    </div>
  );
}

export function useHashTab(initial: TabKey = "proveedor") {
  const [tab, setTab] = React.useState<TabKey>(() => {
    const h = (typeof window !== "undefined" && window.location.hash.replace("#", "")) || "";
    if (h === "ventas" || h === "formulados" || h === "proveedor") return h;
    return initial;
  });
  React.useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "ventas" || h === "formulados" || h === "proveedor") setTab(h);
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
