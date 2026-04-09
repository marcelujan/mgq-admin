export const APP_TZ = "America/Argentina/Cordoba";

export async function getPgAppDate(client: {
  query: (sql: string, params?: any[]) => Promise<any>;
}): Promise<string> {
  const q = await client.query(
    `select ((now() at time zone $1)::date)::text as d`,
    [APP_TZ]
  );
  const d = String(q?.rows?.[0]?.d ?? "").trim();
  if (!d) throw new Error("app_date_not_available");
  return d;
}
