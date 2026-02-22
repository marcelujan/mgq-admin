import Link from "next/link";
import ItemsClient from "./items-client";

export default function ItemsPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Items</h1>
        </div>
      </div>

      <ItemsClient />
    </div>
  );
}