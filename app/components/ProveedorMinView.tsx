"use client";
import { useEffect, useState } from "react";

type Row = {
  ["Prov Artículo"]: string;
  ["Prov Pres"]: string;
  ["Prov UOM"]: string;
  ["Prov Costo"]: number | null;
  ["Prov CostoUn"]: string | null;
  ["Prov Act"]: boolean;
  ["Prov URL"]: string | null;
  ["Prov Desc"]: string | null;
  ["Prov [g/mL]"]: number | null;
};

export default function ProveedorMinView() {
  const [q, setQ] = useState("");
  const [activos, setActivos] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (activos) p.set("activos", "true");
    const res = await fetch(`/api/proveedor?${p.toString()}`);
    const data = await res.json();
    setRows(data);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <input
          className="border rounded-xl px-3 py-2 w-full"
          placeholder="Buscar (Artículo / Descripción)"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={activos} onChange={e => setActivos(e.target.checked)} />
          Activos
        </label>
        <button
          onClick={load}
          className="px-4 py-2 rounded-xl shadow border hover:shadow-md"
          disabled={loading}
        >
          {loading ? "Cargando…" : "Actualizar"}
        </button>
      </div>

      <div className="overflow-auto rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Prov Artículo</th>
              <th className="text-right p-3">Prov Pres</th>
              <th className="text-left p-3">Prov UOM</th>
              <th className="text-right p-3">Prov Costo</th>
              <th className="text-right p-3">Prov CostoUn</th>
              <th className="text-center p-3">Prov Act</th>
              <th className="text-left p-3">Prov URL</th>
              <th className="text-left p-3">Prov Desc</th>
              <th className="text-right p-3">Prov [g/mL]</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                <td className="p-3">{r["Prov Artículo"]}</td>
                <td className="p-3 text-right">{r["Prov Pres"]}</td>
                <td className="p-3">{r["Prov UOM"]}</td>
                <td className="p-3 text-right">{r["Prov Costo"] ?? ""}</td>
                <td className="p-3 text-right">{r["Prov CostoUn"] ?? ""}</td>
                <td className="p-3 text-center">{r["Prov Act"] ? "✔︎" : ""}</td>
                <td className="p-3">
                  {r["Prov URL"] ? (
                    <a className="underline" href={r["Prov URL"]!} target="_blank" rel="noreferrer">link</a>
                  ) : ""}
                </td>
                <td className="p-3">{r["Prov Desc"] ?? ""}</td>
                <td className="p-3 text-right">{r["Prov [g/mL]"] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}