import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import FxForm from "../fx-form";

function isValidDateKey(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export default async function DolarHistoricoEditPage({ params }: { params: Promise<{ fecha: string }> }) {
  const { fecha } = await params;
  const fechaKey = decodeURIComponent(fecha || "");
  if (!isValidDateKey(fechaKey)) return notFound();

  const sql = db();
  const rows: any[] = (await sql.query(
    `
    SELECT fecha::text as fecha, valor::float8 as valor
    FROM app.fx
    WHERE fecha = $1::date
    LIMIT 1
    `,
    [fechaKey]
  )) as any[];

  const row = Array.isArray(rows) ? rows[0] : Array.isArray((rows as any)?.rows) ? (rows as any).rows[0] : null;
  if (!row) return notFound();

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Editar</h1>
      <FxForm mode="edit" initialFecha={String(row.fecha)} initialValor={Number(row.valor)} />
    </div>
  );
}
