import PriceHistoryChart from "./PriceHistoryChart";

type ItemParams = { item_id?: string };

export default async function ItemPage({
  params,
}: {
  // Compat: Next puede entregar params como objeto o como Promise (según versión).
  params: ItemParams | Promise<ItemParams>;
}) {
  const p = await Promise.resolve(params);

  const raw = p?.item_id;
  const itemId = raw !== undefined ? Number(raw) : NaN;

  if (!Number.isFinite(itemId) || itemId <= 0) {
    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Item inválido</h1>
        <div style={{ opacity: 0.9 }}>
          item_id=<code>{String(raw)}</code>
        </div>

        <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.4 }}>
          Verificá:
          <ul style={{ marginTop: 8 }}>
            <li>
              Que el folder sea exactamente <code>/items/[item_id]/</code> (mismo nombre de key).
            </li>
            <li>
              Que navegás a una URL tipo <code>/items/9</code> (no <code>/items</code>).
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Item {itemId}</h1>

      <div style={{ fontSize: 14, opacity: 0.85 }}>
        Histórico diario por presentación (tabla: <code>app.item_price_daily_pres</code>)
      </div>

      <PriceHistoryChart itemId={itemId} />
    </div>
  );
}
