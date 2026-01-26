import PriceHistoryChart from "./PriceHistoryChart";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ item_id: string }>;
}) {
  const { item_id } = await params;
  const itemId = Number(item_id);

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Item {itemId}</h1>

      <div style={{ fontSize: 14, opacity: 0.85 }}>
        Histórico diario por presentación (tabla: <code>app.item_price_daily_pres</code>)
      </div>

      <PriceHistoryChart itemId={itemId} />
    </div>
  );
}
