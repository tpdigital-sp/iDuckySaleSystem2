import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderTotal, orderStatusLabel, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * 🔎 ลูกค้าตามหาออเดอร์ของตัวเอง โดยไม่ต้องล็อกอิน — เจ้าของร้านสั่ง 21 ก.ย. 69
 * POST /api/orders/find  { phone, order }
 *
 * ทำไมต้องมี: ลูกค้าที่สั่งแบบ guest (ส่วนใหญ่ของร้าน) ไม่มีบัญชีให้ล็อกอิน
 * ลิงก์ออเดอร์โชว์ครั้งเดียวตอนสั่งสำเร็จ ปิดเบราว์เซอร์แล้วหาย → ต้องรอแอดมินส่งลิงก์ให้ทางไลน์
 *
 * กติกาความปลอดภัย: ต้องรู้ "เบอร์โทรที่สั่ง" + "เลขออเดอร์" ถึงจะได้กุญแจคืน
 * — เลขออเดอร์ใส่ 4 ตัวท้ายก็พอ (OD-260921-**1234**) แต่ต้องมี ไม่งั้นใครรู้เบอร์ก็เปิดดูออเดอร์คนอื่นได้
 * — ไม่บอกว่า "เบอร์ถูกแต่เลขผิด" หรือ "ไม่มีเบอร์นี้" แยกกัน (ข้อความเดียวกันหมด กันเดาสุ่ม)
 */

/**
 * เบอร์ → เหลือแต่ตัวเลข (+66 / 66 นำหน้า → 0) · ออเดอร์เก่าเก็บเบอร์แบบมีขีดไว้ ต้องล้างทั้งสองฝั่งก่อนเทียบ
 * (สูตรเดียวกับ cleanPhone ใน lib/contact-validate ที่ยังไม่ขึ้น main — ย้ายไปใช้ตัวนั้นได้เมื่อไฟล์นั้นเข้าแล้ว)
 */
function cleanPhone(raw: string | undefined | null): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("66") && d.length >= 11) d = `0${d.slice(2)}`;
  return d;
}

/** กันยิงรัว — ต่อ IP ต่ออินสแตนซ์ (serverless แยกอินสแตนซ์ ไม่กันได้ 100% แต่พอกันสคริปต์เดารัว) */
const HITS = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 12;

function tooMany(ip: string): boolean {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || cur.until < now) {
    HITS.set(ip, { n: 1, until: now + WINDOW_MS });
    if (HITS.size > 500) for (const [k, v] of HITS) if (v.until < now) HITS.delete(k);
    return false;
  }
  cur.n += 1;
  return cur.n > MAX_TRIES;
}

/** เลขออเดอร์ที่ลูกค้าพิมพ์มา → { full, tail } (รับทั้ง "OD-260921-1234", "260921-1234" และ "1234") */
function parseOrderNo(raw: string): { full?: string; tail?: string } {
  const s = raw.trim().toUpperCase();
  const full = s.match(/(\d{6})\s*-?\s*(\d{4})/);
  if (full) return { full: `OD-${full[1]}-${full[2]}`, tail: full[2] };
  const tail = s.match(/(\d{4})\s*$/);
  return tail ? { tail: tail[1] } : {};
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (tooMany(ip)) return NextResponse.json({ error: "ลองหลายครั้งเกินไป รอสัก 10 นาทีแล้วลองใหม่ หรือทักไลน์ร้านได้เลยครับ" }, { status: 429 });

  let input: { phone?: string; order?: string };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const digits = cleanPhone(input.phone);
  if (digits.length < 9) return NextResponse.json({ error: "กรอกเบอร์โทรที่ใช้ตอนสั่ง (ตัวเลข 9-10 หลัก)" }, { status: 400 });
  const { full, tail } = parseOrderNo(input.order ?? "");
  if (!full && !tail) return NextResponse.json({ error: "กรอกเลขออเดอร์ด้วยครับ (ใส่ 4 ตัวท้ายก็ได้)" }, { status: 400 });

  // รู้เลขเต็ม = อ่านใบเดียว · รู้แค่ 4 ตัวท้าย = ดึงเฉพาะออเดอร์ของเบอร์นี้มากรอง
  // (เบอร์ในออเดอร์เก่าอาจเก็บแบบมีขีด จึงค้นด้วย ilike %หลักท้าย% แล้วเทียบ cleanPhone อีกชั้น)
  const rows = full
    ? await sb.from("orders").select("data").eq("id", full).limit(1)
    : await sb.from("orders").select("data").ilike("data->>phone", `%${digits.slice(-9)}%`).limit(50);
  if (rows.error) {
    const e = rows.error;
    if (e.code === "42P01" || e.code === "PGRST205" || /schema cache|does not exist/i.test(e.message))
      return NextResponse.json({ error: "ระบบยังไม่พร้อม — ผู้ดูแลต้องสร้างตาราง orders ก่อน" }, { status: 503 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const found = (rows.data ?? [])
    .map((r) => r.data as Order)
    .filter((o) => o && cleanPhone(o.phone) === digits)
    .filter((o) => (tail ? o.id.endsWith(tail) : true))
    // เรียงใหม่→เก่าด้วยเลขออเดอร์ (OD-YYMMDD-#### เรียงตามวันอยู่แล้ว) — data.date เป็นข้อความไทย เทียบตรง ๆ ไม่ได้
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 10)
    .map((o) => ({
      id: o.id,
      key: o.key ?? "",
      date: o.date ?? "",
      status: o.status,
      statusLabel: orderStatusLabel(o),
      total: orderTotal(o),
      customer: o.customer ?? "",
    }));

  if (found.length === 0)
    return NextResponse.json({ error: "ไม่พบออเดอร์ที่ตรงกับเบอร์โทร + เลขออเดอร์นี้ครับ — ลองเช็คเลขอีกที หรือทักไลน์ร้านได้เลย" }, { status: 404 });

  return NextResponse.json({ ok: true, orders: found });
}
