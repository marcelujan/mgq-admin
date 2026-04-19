import Link from "next/link";
import StockMovimientoForm from "@/app/_components/stock/stock-movimiento-form";

export default function StockIngresoPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Stock · Ingreso</h1>
        <Link href="/stock" style={{ textDecoration: "none", color: "inherit", fontSize: 12.5, opacity: 0.92 }}>Volver a Stock</Link>
      </div>
      <StockMovimientoForm mode="ingreso" />
    </div>
  );
}
