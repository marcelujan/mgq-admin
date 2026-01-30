import Link from "next/link";

import ItemsClient from "./items-client";

export default function ItemsPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Items</h1>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Lista operativa</div>
        </div>

        <Link
          href="/items/new"
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          Cargar items
        </Link>
      </div>

      <ItemsClient />
    </div>
  );
}
