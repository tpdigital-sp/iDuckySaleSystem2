import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

/** เริ่ม LINE Login — redirect ไปหน้าอนุญาตของ LINE */
export async function GET(req: Request) {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) {
    return NextResponse.redirect(new URL("/account/login?line=notset", req.url));
  }
  const origin = new URL(req.url).origin;
  const state = crypto.randomUUID();

  const jar = await cookies();
  jar.set("line_oauth_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/line/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile openid email");
  return NextResponse.redirect(url.toString());
}
