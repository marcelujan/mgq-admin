import ItemComercialPricingPanel from "@/app/_components/vnext/item-comercial-pricing-panel";

type Props = {
  params: Promise<{ item_comercial_id: string }>;
};

export default async function ItemComercialPricingPage({ params }: Props) {
  const { item_comercial_id } = await params;
  const itemComercialId = Number(item_comercial_id);

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Pricing por canal</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Item Comercial #{Number.isFinite(itemComercialId) ? itemComercialId : item_comercial_id}
        </div>
      </div>

      <ItemComercialPricingPanel
        itemComercialId={Number.isFinite(itemComercialId) ? itemComercialId : null}
        disabled={!Number.isFinite(itemComercialId)}
      />
    </div>
  );
}
