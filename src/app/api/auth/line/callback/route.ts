import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { requestOrigin } from "@/lib/server/req-origin";

export const runtime = "nodejs";

/** LINE redirect กลับมาพร้อม code → แลก token → ดึงโปรไฟล์ → หา/สร้าง user Supabase → ทำ session */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // ต้องตรงกับ redirect_uri ตอน login เป๊ะ (โดเมนจริง ไม่ใช่ host ชั่วคราวของ preview)
  const origin = requestOrigin(req);
  const fail = (reason: string) => NextResponse.redirect(`${origin}/account/login?line=${reason}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const savedState = jar.get("line_oauth_state")?.value;
  jar.delete("line_oauth_state");
  if (!code || !state || state !== savedState) return fail("state");

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) return fail("notset");

  // 1) แลก code → access_token + id_token
  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/api/auth/line/callback`,
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; id_token?: string };
  if (!token.access_token) return fail("token");

  // 2) โปรไฟล์ LINE
  const profRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const prof = (await profRes.json()) as { userId?: string; displayName?: string; pictureUrl?: string };
  if (!prof.userId) return fail("profile");

  // อีเมลจาก id_token (ถ้าขอ scope email) — ไม่งั้นใช้อีเมลสังเคราะห์
  let email = "";
  if (token.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(token.id_token.split(".")[1], "base64").toString());
      email = typeof payload.email === "string" ? payload.email : "";
    } catch {
      /* ข้าม */
    }
  }
  // ⚠️ ต้องเป็นตัวพิมพ์เล็ก — Supabase เก็บอีเมลเป็นตัวเล็กเสมอ ส่วน LINE userId ขึ้นต้นด้วย "U" ตัวใหญ่
  // ถ้าไม่ lowercase ครั้งที่สองจะหา user ไม่เจอ (ตัวใหญ่ != ตัวเล็ก) แล้วขึ้น "สร้างบัญชีไม่สำเร็จ"
  const loginEmail = (email || `line_${prof.userId}@line.iducky.local`).toLowerCase();

  const sb = getSupabaseAdmin();
  if (!sb) return fail("nodb");

  // 3) หา/สร้าง user Supabase
  const meta = { name: prof.displayName ?? "", picture: prof.pictureUrl ?? "", line_user_id: prof.userId };
  const created = await sb.auth.admin.createUser({ email: loginEmail, email_confirm: true, user_metadata: meta });
  if (!created.data.user) {
    // มีอยู่แล้ว → หา + อัปเดตชื่อ/รูปล่าสุด (เทียบแบบไม่สนตัวพิมพ์ กันพลาด)
    const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const existing = list.users.find((u) => u.email?.toLowerCase() === loginEmail);
    if (!existing) return fail("createuser");
    await sb.auth.admin.updateUserById(existing.id, { user_metadata: { ...existing.user_metadata, ...meta } });
  }

  // 4) ทำ session ผ่าน magiclink (redirect ไป Supabase verify → เด้งกลับ /account พร้อม token ใน fragment)
  const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
    type: "magiclink",
    email: loginEmail,
    options: { redirectTo: `${origin}/account` },
  });
  if (linkErr || !link.properties?.action_link) return fail("session");
  return NextResponse.redirect(link.properties.action_link);
}
