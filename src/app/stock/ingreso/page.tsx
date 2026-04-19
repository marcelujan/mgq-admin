import Link from "next/link";
import StockMovimientoForm from "@/app/_components/stock/stock-movimiento-form";

export default function StockIngresoPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Stock · Ingreso</h1>
        <Link href="/stock" style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "6px 10px", background: "rgba(255,255,255,0.03)", color: "inherit", textDecoration: "none" }}>Volver a Stock</Link>
      </div>
      <StockMovimientoForm mode="ingreso" />
    </div>
  );
}
