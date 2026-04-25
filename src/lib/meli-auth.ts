import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";

export type MeliAuthRow = {
  meli_auth_id: number;
  site_id: string;
  user_id: number;
  nickname: string | null;
  access_token: string;
  refresh_token: string;
  token_type: string | null;
  scope: string | null;
  expires_at: string;
  connected_at: string;
  updated_at: string;
  is_active: boolean;
};

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function makeState(): string {
  return base64url(randomBytes(24));
}

export function makeCodeVerifier(): string {
  return base64url(randomBytes(48));
}

export function makeCodeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export function getMeliEnv() {
  return {
    appId: process.env.MELI_APP_ID || "",
    clientSecret: process.env.MELI_CLIENT_SECRET || "",
    redirectUri: process.env.MELI_REDIRECT_URI || "",
    usePkce: String(process.env.MELI_USE_PKCE || "true").toLowerCase() !== "false",
    siteAuthHost: process.env.MELI_AUTH_HOST || "https://auth.mercadolibre.com.ar",
    apiBase: process.env.MELI_API_BASE || "https://api.mercadolibre.com",
  };
}

export function assertMeliEnv() {
  const env = getMeliEnv();
  if (!env.appId) throw new Error("Falta MELI_APP_ID");
  if (!env.clientSecret) throw new Error("Falta MELI_CLIENT_SECRET");
  if (!env.redirectUri) throw new Error("Falta MELI_REDIRECT_URI");
  return env;
}

export async function upsertMeliAuth(input: {
  site_id?: string | null;
  user_id: number;
  nickname?: string | null;
  access_token: string;
  refresh_token: string;
  token_type?: string | null;
  scope?: string | null;
  expires_in: number;
}) {
  const sql = db();
  const r: any = await sql.query(
    `
    INSERT INTO app.meli_auth (
      site_id,
      user_id,
      nickname,
      access_token,
      refresh_token,
      token_type,
      scope,
      expires_at,
      connected_at,
      updated_at,
      is_active
    )
    VALUES (
      COALESCE($1, 'MLA'),
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      now() + make_interval(secs => $8::int),
      now(),
      now(),
      true
    )
    ON CONFLICT (user_id) DO UPDATE SET
      site_id = EXCLUDED.site_id,
      nickname = EXCLUDED.nickname,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      token_type = EXCLUDED.token_type,
      scope = EXCLUDED.scope,
      expires_at = EXCLUDED.expires_at,
      updated_at = now(),
      is_active = true
    RETURNING *
    `,
    [
      input.site_id ?? "MLA",
      input.user_id,
      input.nickname ?? null,
      input.access_token,
      input.refresh_token,
      input.token_type ?? "bearer",
      input.scope ?? null,
      Math.max(1, Number(input.expires_in || 0)),
    ]
  );
  return rows(r)[0] ?? null;
}

export async function getActiveMeliAuth(): Promise<MeliAuthRow | null> {
  const sql = db();
  const r: any = await sql.query(
    `
    SELECT *
    FROM app.meli_auth
    WHERE is_active = true
    ORDER BY updated_at DESC, meli_auth_id DESC
    LIMIT 1
    `
  );
  return (rows(r)[0] ?? null) as MeliAuthRow | null;
}

export async function disconnectMeliAuth() {
  const sql = db();
  await sql.query(
    `
    UPDATE app.meli_auth
    SET is_active = false, updated_at = now()
    WHERE is_active = true
    `
  );
}