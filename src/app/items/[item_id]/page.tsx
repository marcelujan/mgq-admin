import PriceHistoryChart from "./PriceHistoryChart";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ item_id: string }>;
}) {
  const { item_id } = await params;
  const itemId = Number(item_id);

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
        Item {itemId}
      </h1>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
        Histórico de precios
      </h2>

      <PriceHistoryChart itemId={itemId} />
    </div>
  );
}
