import { NextRequest, NextResponse } from "next/server";
import { assertMeliEnv, upsertMeliAuth } from "@/lib/meli-auth";

export async function GET(req: NextRequest) {
  try {
    const env = assertMeliEnv();
    const url = new URL(req.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const err = url.searchParams.get("error") || "";
    const errDesc = url.searchParams.get("error_description") || "";

    if (err) {
      return NextResponse.redirect(new URL(`/mercadolibre/auth?error=${encodeURIComponent(errDesc || err)}`, req.url));
    }

    const cookieState = req.cookies.get("ml_oauth_state")?.value || "";
    const verifier = req.cookies.get("ml_oauth_verifier")?.value || "";

    if (!code) {
      return NextResponse.redirect(new URL("/mercadolibre/auth?error=Falta+code", req.url));
    }
    if (!state || !cookieState || state !== cookieState) {
      return NextResponse.redirect(new URL("/mercadolibre/auth?error=State+inv%C3%A1lido", req.url));
    }

    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("client_id", env.appId);
    body.set("client_secret", env.clientSecret);
    body.set("code", code);
    body.set("redirect_uri", env.redirectUri);
    if (env.usePkce && verifier) {
      body.set("code_verifier", verifier);
    }

    const tokenRes = await fetch(`${env.apiBase}/oauth/token`, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    });
    const tokenJson: any = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok) {
      throw new Error(tokenJson?.message || tokenJson?.error_description || `HTTP ${tokenRes.status}`);
    }

    const accessToken = String(tokenJson?.access_token || "");
    const refreshToken = String(tokenJson?.refresh_token || "");
    const expiresIn = Number(tokenJson?.expires_in || 0);
    const scope = typeof tokenJson?.scope === "string" ? tokenJson.scope : null;
    const tokenType = typeof tokenJson?.token_type === "string" ? tokenJson.token_type : "bearer";
    if (!accessToken || !refreshToken || !Number.isFinite(expiresIn)) {
      throw new Error("Respuesta OAuth incompleta");
    }

    const meRes = await fetch(`${env.apiBase}/users/me`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "accept": "application/json",
      },
      cache: "no-store",
    });
    const meJson: any = await meRes.json().catch(() => null);
    if (!meRes.ok) {
      throw new Error(meJson?.message || `users/me HTTP ${meRes.status}`);
    }

    await upsertMeliAuth({
      site_id: meJson?.site_id || "MLA",
      user_id: Number(meJson?.id || meJson?.user_id),
      nickname: meJson?.nickname || null,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: tokenType,
      scope,
      expires_in: expiresIn,
    });

    const res = NextResponse.redirect(new URL("/mercadolibre/auth?ok=1", req.url));
    res.cookies.set("ml_oauth_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("ml_oauth_verifier", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e: any) {
    return NextResponse.redirect(new URL(`/mercadolibre/auth?error=${encodeURIComponent(e?.message ?? "error")}`, req.url));
  }
}