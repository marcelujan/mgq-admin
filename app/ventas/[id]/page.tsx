"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SalesItemForm, { SalesItem } from "../components/SalesItemForm";

export default function EditVentaPage() {
  const params = useParams();
  const id = Number(params?.id);
  const [item, setItem] = useState<SalesItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    fetch(`/api/sales-items/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setItem(data.item as SalesItem))
      .catch((e) => setError(String(e)));
  }, [id]);

  if (!Number.isFinite(id)) return <div className="p-4">ID inválido</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
  if (!item) return <div className="p-4">Cargando…</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Editar artículo #{id}</h1>
      <SalesItemForm mode="edit" initial={item} />
    </div>
  );
}
