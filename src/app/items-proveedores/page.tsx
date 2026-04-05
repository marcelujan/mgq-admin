"use client";

import Link from "next/link";

import ItemsNewClient from "../items/new/items-new-client";

const headerLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  fontSize: 13,
  lineHeight: 1.2,
  textDecoration: "none",
} as const;

export default function ItemsProveedoresPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Items Proveedores</h1>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/items-proveedores/cron" style={headerLinkStyle}>
            Cron
          </Link>
          <Link href="/items-proveedores/items" style={headerLinkStyle}>
            Items
          </Link>
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          padding: 14,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <ItemsNewClient forcedTab="PROVEEDOR" hideTabs backHref="/items-proveedores" />
      </div>
    </div>
  );
}
