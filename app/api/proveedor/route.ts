// app/api/proveedor/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const onlyAct = searchParams.get("activos") === "true";
  const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
  const offset = Math.max(Number(searchParams.get("offset") || "0"), 0);

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(`("Prov Artículo" ILIKE $${params.length} OR "Prov Desc" ILIKE $${params.length})`);
  }
  if (onlyAct) where.push(`"Prov Act" = true`);

  const sql = `
    SELECT "Prov Artículo","Prov Pres","Prov UOM","Prov Costo","Prov CostoUn",
           "Prov Act","Prov URL","Prov Desc","Prov [g/mL]"
    FROM app.v_prov_min
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY "Prov Artículo" ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const rows = await db(sql, params);
  return NextResponse.json(rows);
}
