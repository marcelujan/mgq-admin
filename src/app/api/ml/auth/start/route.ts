import { NextRequest, NextResponse } from "next/server";
import { assertMeliEnv, makeCodeChallenge, makeCodeVerifier, makeState } from "@/lib/meli-auth";

export async function GET(_: NextRequest) {
  try {
    const env = assertMeliEnv();
    const state = makeState();
    const verifier = makeCodeVerifier();

    const url = new URL("/authorization", env.siteAuthHost);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", env.appId);
    url.searchParams.set("redirect_uri", env.redirectUri);
    url.searchParams.set("state", state);
    if (env.usePkce) {
      url.searchParams.set("code_challenge", makeCodeChallenge(verifier));
      url.searchParams.set("code_challenge_method", "S256");
    }

    const res = NextResponse.redirect(url);
    res.cookies.set("ml_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 15,
    });
    if (env.usePkce) {
      res.cookies.set("ml_oauth_verifier", verifier, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 15,
      });
    }
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}