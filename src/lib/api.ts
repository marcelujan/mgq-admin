export function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

export function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function bool(v: any): boolean {
  return v === true || v === "true" || v === 1 || v === "1" || v === "t";
}