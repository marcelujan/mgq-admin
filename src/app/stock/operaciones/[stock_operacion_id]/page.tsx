import Link from "next/link";
import StockOperacionEdit from "@/app/_components/stock/stock-operacion-edit";

export default async function StockOperacionEditPage({ params }: { params: Promise<{ stock_operacion_id: string }> }) {
  const { stock_operacion_id: stockOperacionIdStr } = await params;
  const stock_operacion_id = Number(stockOperacionIdStr);
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Stock · Editar operación #{stock_operacion_id}</h1>
        <Link href="/stock" style={{ textDecoration: "none", color: "inherit", fontSize: 12.5, opacity: 0.92 }}>Volver a Stock</Link>
      </div>
      <StockOperacionEdit operationId={stock_operacion_id} />
    </div>
  );
}
