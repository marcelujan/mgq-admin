import ProductoClient from "./producto-client";

export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { producto_id: string } }) {
  return <ProductoClient productoId={Number(params.producto_id)} />;
}
