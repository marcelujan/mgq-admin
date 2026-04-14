"use client";
import { useParams } from "next/navigation";
import ItemComercialForm from "../../_components/vnext/item-comercial-form";
export default function ItemComercialEditPage() {
  const params = useParams<{ item_comercial_id: string }>();
  return <ItemComercialForm itemId={Number(params?.item_comercial_id)} />;
}
