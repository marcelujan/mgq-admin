"use client";

import React from "react";
import HomeTabs, { useHashTab } from "./components/HomeTabs";
import ProveedorView from "./components/ProveedorView";
import VentasView from "./components/VentasView";
import FormuladosView from "./components/FormuladosView";

export default function HomePage() {
  const { tab, change } = useHashTab("proveedor");

  return (
    <div className="max-w-7xl mx-auto p-4">
      <HomeTabs active={tab} onChange={change} />
      {tab === "proveedor" && <ProveedorView />}
      {tab === "ventas" && <VentasView />}
      {tab === "formulados" && <FormuladosView />}
    </div>
  );
}
