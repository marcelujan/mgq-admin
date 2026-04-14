"use client";
import { useParams } from "next/navigation";
import CatalogoForm from "../../_components/vnext/catalogo-form";
export default function ItemEtiquetaEditPage() {
  const params = useParams<{ item_etiqueta_id: string }>();
  return <CatalogoForm kind="etiqueta" itemId={Number(params?.item_etiqueta_id)} />;
}
