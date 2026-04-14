import Link from "next/link";
import CatalogoListClient from "../_components/vnext/catalogo-list-client";

export default function ItemsPaqueteriaPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Items Paquetería</h1>
        <Link href="/items-paqueteria/new" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "6px 10px", background: "rgba(255,255,255,0.03)", textDecoration: "none", color: "inherit", fontSize: 13, lineHeight: 1.15 }}>Nuevo</Link>
      </div>
      <CatalogoListClient kind="paqueteria" />
    </div>
  );
}
