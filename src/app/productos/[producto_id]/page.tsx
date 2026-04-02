import ProductoClient from "./producto-client";

type ParamsShape = { producto_id: string };

export default async function ProductoPage({
  params,
}: {
  params: ParamsShape | Promise<ParamsShape>;
}) {
  const resolvedParams: ParamsShape =
    typeof (params as any)?.then === "function"
      ? await (params as Promise<ParamsShape>)
      : (params as ParamsShape);

  const productoId = Number(resolvedParams.producto_id);

  if (!Number.isFinite(productoId)) {
    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Item Formulado #{resolvedParams.producto_id}
          </h1>
          <div style={{ fontSize: 12, color: "tomato" }}>
            producto_id inválido (URL)
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <ProductoClient productoId={productoId} />
    </div>
  );
}
