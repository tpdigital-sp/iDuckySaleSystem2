import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { loadDealersDoc, saveDealersDoc } from "@/lib/server/dealers";

export const runtime = "nodejs";

/**
 * ลูกค้าส่งใบสมัครตัวแทนจำหน่าย (จากหน้า /dealer) — ต้องล็อกอิน (token)
 * สมัครซ้ำ = อัปเดตใบเดิม (แก้ข้อมูลได้จนกว่าแอดมินจะจัดการ) · เป็นตัวแทนอยู่แล้ว = ไม่ต้องสมัคร
 * ส่งแล้วเด้งแจ้งเตือนเข้า LINE ร้าน (ช่องทางเดียวกับแจ้งออเดอร์สั่งเยอะ) แบบ fire-and-forget
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ระบบยังไม่พร้อม ลองใหม่อีกครั้ง" }, { status: 503 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อนสมัคร" }, { status: 401 });
  const { data: u, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !u.user) return NextResponse.json({ error: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่แล้วลองอีกครั้ง" }, { status: 401 });

  let body: { shopName?: string; channel?: string; detail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const shopName = (body.shopName ?? "").trim().slice(0, 120);
  const channel = (body.channel ?? "").trim().slice(0, 200);
  const detail = (body.detail ?? "").trim().slice(0, 500);
  if (shopName.length < 2) return NextResponse.json({ error: "กรอกชื่อร้าน/ธุรกิจของคุณ" }, { status: 400 });
  if (channel.length < 2) return NextResponse.json({ error: "กรอกช่องทางขาย เช่น IG / Facebook / หน้าร้าน" }, { status: 400 });

  const doc = await loadDealersDoc();
  if (u.user.id in doc.users) return NextResponse.json({ ok: true, dealer: true }); // เป็นตัวแทนอยู่แล้ว

  const firstTime = !doc.applications[u.user.id];
  const next = {
    users: doc.users,
    applications: {
      ...doc.applications,
      [u.user.id]: { shopName, channel, at: new Date().toISOString(), ...(detail ? { detail } : {}) },
    },
  };
  const { error } = await saveDealersDoc(next);
  if (error) return NextResponse.json({ error: "บันทึกใบสมัครไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });

  // 🔔 แจ้งร้านทาง LINE เฉพาะใบใหม่ (แก้ใบเดิมไม่แจ้งซ้ำ) — ล้มก็ไม่เป็นไร ใบสมัครอยู่ในหลังบ้านแล้ว
  const to = process.env.LINE_STOCK_ALERT_TO;
  const line = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (firstTime && to && line) {
    const who = u.user.user_metadata?.name || u.user.email || "";
    void fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${line}` },
      body: JSON.stringify({
        to,
        messages: [
          {
            type: "text",
            text: `🤝 ใบสมัครตัวแทนจำหน่ายใหม่\n${who}\nร้าน: ${shopName}\nช่องทาง: ${channel}${detail ? `\n${detail}` : ""}\n\nกดอนุมัติ/ปฏิเสธได้ที่หลังบ้าน → ตัวแทนจำหน่าย`,
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
