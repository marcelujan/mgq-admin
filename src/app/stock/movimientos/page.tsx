import StockOperacionesClient from "@/app/_components/stock/stock-operaciones-client";

export default function StockMovimientosPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Stock · Movimientos</h1>
      <StockOperacionesClient />
    </div>
  );
}
