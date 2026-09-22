import { NextResponse } from "next/server";
import { pushShopAlert } from "@/lib/server/line-alert";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { loadDealersDoc, saveDealersDoc } from "@/lib/server/dealers";
import { cleanPhone, phoneProblem } from "@/lib/contact-validate";

export const runtime = "nodejs";

/**
 * ลูกค้าส่งใบสมัครตัวแทนจำหน่าย (จากหน้า /dealer)
 *
 * รับ 2 ทาง — ใบสมัครต้องผูกกับบัญชีสมาชิกเสมอ (สิทธิ์ตัวแทน = uid ในทะเบียน __dealers__):
 *   1. ล็อกอินอยู่แล้ว → ส่ง token มา ใช้ uid นั้น (สมัครซ้ำ = แก้ใบเดิมได้จนกว่าแอดมินจะจัดการ)
 *   2. ยังไม่มีบัญชี → ส่ง `account` มาด้วย ระบบสร้างบัญชีให้ตรงนี้เลย แล้วผูกใบสมัครกับบัญชีใหม่
 *      (เจ้าของร้านสั่ง 22 ก.ย. 69 "ให้กรอกที่หน้านี้จบเลย ไม่ต้องเด้งไปล็อกอินก่อน")
 *      ⚠️ ต้องสร้างด้วย service role + email_confirm:true เพราะโปรเจกต์นี้เปิดยืนยันอีเมล
 *         (mailer_autoconfirm=false) — ถ้าใช้ signUp ฝั่ง client จะไม่ได้ session กลับมา
 *         ส่งใบสมัครต่อทันทีไม่ได้ ต้องไปเปิดเมลก่อน = ไม่จบในหน้าเดียวตามที่สั่ง
 *
 * ส่งแล้วเด้งแจ้งเตือนเข้า LINE ร้าน (ช่องทางเดียวกับแจ้งออเดอร์สั่งเยอะ)
 */

/** กันสแปมหยาบ ๆ ต่ออินสแตนซ์ — สร้างบัญชีจากฟอร์มนี้ได้ 3 ครั้ง/ไอพี/ชั่วโมง
 *  ⚠️ เป็น in-memory ของฟังก์ชัน serverless (คนละอินสแตนซ์ = คนละตัวนับ) กันมือสมัครเล่นได้ ไม่ใช่ของจริง */
const signups = new Map<string, number[]>();
const WINDOW = 60 * 60_000;
const MAX_PER_IP = 3;
function tooManySignups(ip: string): boolean {
  if (!ip) return false;
  const now = Date.now();
  const hits = (signups.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (hits.length >= MAX_PER_IP) {
    signups.set(ip, hits);
    return true;
  }
  hits.push(now);
  signups.set(ip, hits);
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ระบบยังไม่พร้อม ลองใหม่อีกครั้ง" }, { status: 503 });

  let body: {
    shopName?: string;
    channel?: string;
    detail?: string;
    account?: { name?: string; phone?: string; email?: string; password?: string };
  };
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

  /* ── หาว่าใบนี้เป็นของบัญชีไหน ── */
  let uid = "";
  let who = "";
  let applicantPhone = "";
  let createdAccount = false;

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token) {
    const { data: u, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !u.user) return NextResponse.json({ error: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่แล้วลองอีกครั้ง" }, { status: 401 });
    uid = u.user.id;
    who = u.user.user_metadata?.name || u.user.email || "";
    applicantPhone = u.user.user_metadata?.phone || "";
  } else {
    // ยังไม่ล็อกอิน → ต้องมีข้อมูลบัญชีมาด้วย แล้วสร้างบัญชีให้เลย
    const a = body.account ?? {};
    const name = (a.name ?? "").trim().slice(0, 80);
    const phone = cleanPhone(a.phone).slice(0, 15);
    const email = (a.email ?? "").trim().toLowerCase().slice(0, 160);
    const password = a.password ?? "";
    if (name.length < 2) return NextResponse.json({ error: "กรอกชื่อผู้สมัคร" }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "อีเมลไม่ถูกต้อง" }, { status: 400 });
    // เบอร์บังคับกรอก (เจ้าของร้านสั่ง 22 ก.ย. 69) — ใช้ด่านตรวจชุดกลางตัวเดียวกับ checkout
    const phoneErr = phoneProblem(a.phone);
    if (phoneErr) return NextResponse.json({ error: phoneErr }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "รหัสผ่านอย่างน้อย 6 ตัวอักษร" }, { status: 400 });

    const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    if (tooManySignups(ip)) {
      return NextResponse.json({ error: "สมัครถี่เกินไป พักสักครู่แล้วลองใหม่ หรือทักไลน์ร้านได้เลย" }, { status: 429 });
    }

    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // โปรเจกต์นี้เปิดยืนยันอีเมล — ถ้าไม่ยืนยันให้ เขาจะล็อกอินต่อทันทีไม่ได้
      user_metadata: { name, phone },
    });
    if (createErr || !created.user) {
      const msg = createErr?.message ?? "";
      // อีเมลซ้ำ = เคยสมัครไว้แล้ว → ให้ฝั่งหน้าเว็บลองเข้าสู่ระบบด้วยรหัสที่เพิ่งกรอก
      if (/already|exists|registered/i.test(msg)) {
        return NextResponse.json({ error: "อีเมลนี้มีบัญชีอยู่แล้ว", emailTaken: true }, { status: 409 });
      }
      return NextResponse.json({ error: "สร้างบัญชีไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
    }
    uid = created.user.id;
    who = name || email;
    applicantPhone = phone;
    createdAccount = true;
  }

  const doc = await loadDealersDoc();
  if (uid in doc.users) return NextResponse.json({ ok: true, dealer: true }); // เป็นตัวแทนอยู่แล้ว

  const firstTime = !doc.applications[uid];
  const next = {
    users: doc.users,
    applications: {
      ...doc.applications,
      [uid]: { shopName, channel, at: new Date().toISOString(), ...(detail ? { detail } : {}) },
    },
  };
  const { error } = await saveDealersDoc(next);
  if (error) return NextResponse.json({ error: "บันทึกใบสมัครไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });

  // 🔔 แจ้งร้านทาง LINE เฉพาะใบใหม่ (แก้ใบเดิมไม่แจ้งซ้ำ) — ล้มก็ไม่เป็นไร ใบสมัครอยู่ในหลังบ้านแล้ว
  if (firstTime) {
    // ⚠️ await ไม่ใช่ void — Netlify แช่ฟังก์ชันตอนตอบกลับ งานค้างอาจไม่ได้ทำ (ตัวส่ง timeout 10 วิ ไม่ throw)
    await pushShopAlert({
      tone: "#0D9488",
      title: "🤝 ใบสมัครตัวแทนใหม่",
      headline: "กดอนุมัติหรือปฏิเสธได้ที่หลังบ้าน",
      heroLabel: "ชื่อร้านผู้สมัคร",
      hero: shopName,
      rows: [
        { label: "ผู้สมัคร", value: who || "-" },
        { label: "ช่องทางขาย", value: channel || "-" },
        ...(applicantPhone ? [{ label: "เบอร์โทร", value: applicantPhone }] : []),
        ...(createdAccount ? [{ label: "บัญชี", value: "สมัครสมาชิกใหม่พร้อมใบสมัคร" }] : []),
      ],
      note: detail || undefined,
      button: { label: "เปิดหน้าตัวแทนจำหน่าย", uri: "https://iduckystore.com/admin/dealers" },
      alt: `🤝 ใบสมัครตัวแทนใหม่ — ${shopName}`,
    });
  }

  return NextResponse.json({ ok: true, ...(createdAccount ? { created: true } : {}) });
}
