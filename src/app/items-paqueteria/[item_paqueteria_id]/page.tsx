"use client";
import { useParams } from "next/navigation";
import CatalogoForm from "../../_components/vnext/catalogo-form";
export default function ItemPaqueteriaEditPage() {
  const params = useParams<{ item_paqueteria_id: string }>();
  return <CatalogoForm kind="paqueteria" itemId={Number(params?.item_paqueteria_id)} />;
}
