"use client";
import SalesItemForm from "../components/SalesItemForm";

export default function NuevaVentaPage() {
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Nuevo artículo de venta</h1>
      <SalesItemForm mode="create" />
    </div>
  );
}
