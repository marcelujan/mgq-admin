import Link from "next/link";
import ProductoClient from "./producto-client";

type ParamsShape = { producto_id: string };

export default async function ProductoPage({
  params,
}: {
  params: ParamsShape | Promise<ParamsShape>;
}) {
  const resolvedParams: ParamsShape =
    typeof (params as any)?.then === "function" ? await (params as Promise<ParamsShape>) : (params as ParamsShape);

  const productoId = Number(resolvedParams.producto_id);

  if (!Number.isFinite(productoId)) {
    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Producto #{resolvedParams.producto_id}
          </h1>
          <div style={{ fontSize: 12, color: "tomato" }}>producto_id inválido (URL)</div>
        </div>

        <Link
          href="/productos"
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.03)",
            width: "fit-content",
          }}
        >
          Volver a Productos
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Producto #{resolvedParams.producto_id}
          </h1>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Editor (base o fórmula) + ofertas + costeo</div>
        </div>

        <Link
          href="/productos"
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          Volver
        </Link>
      </div>

      <ProductoClient productoId={productoId} />
    </div>
  );
}
