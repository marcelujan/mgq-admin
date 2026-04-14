"use client";
import { useParams } from "next/navigation";
import CatalogoForm from "../../_components/vnext/catalogo-form";
export default function ItemEnvaseEditPage() {
  const params = useParams<{ item_envase_id: string }>();
  return <CatalogoForm kind="envases" itemId={Number(params?.item_envase_id)} />;
}
