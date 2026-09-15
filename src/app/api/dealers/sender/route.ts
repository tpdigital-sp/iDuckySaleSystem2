import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isDealerUid } from "@/lib/server/dealers";
import { loadDealerSender, resolveDealerUid, saveDealerSender } from "@/lib/server/dealer-sender";
import { cleanSender } from "@/lib/order-sender";
import { withLog, type Order, type OrderSender, type OrderStatus } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";

export const runtime = "nodejs";

/**
 * 📮 ผู้ส่งประจำของตัวแทน (ชื่อร้านที่จะขึ้นบนกล่องแทนชื่อร้านเรา) — ตัวแทนตั้งเองจากหน้า /dealer
 *
 * GET  → { dealer, sender? }
 * POST { name?, phone?, address? } → บันทึก (ทุกช่องว่าง = ล้างทิ้ง กลับไปใช้ชื่อร้านเรา)
 *
 * ⚠️ ต้องเป็นบัญชีในทะเบียนตัวแทนเท่านั้น (ยืนยันจาก token ไม่ใช่ค่าที่ส่งมา) —
 *    ไม่งั้นลูกค้าทั่วไปตั้งชื่อผู้ส่งเป็นชื่อร้านคนอื่นได้
 */
async function uidOf(req: Request, sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<string> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return "";
  const { data, error } = await sb.auth.getUser(token);
  return error || !data.user ? "" : data.user.id;
}

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ dealer: false });
  const uid = await uidOf(req, sb);
  if (!uid || !(await isDealerUid(uid))) return NextResponse.json({ dealer: false });
  const sender = await loadDealerSender(sb, uid);
  return NextResponse.json({ dealer: true, ...(sender ? { sender } : {}) });
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const uid = await uidOf(req, sb);
  if (!uid) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!(await isDealerUid(uid))) return NextResponse.json({ error: "เฉพาะบัญชีตัวแทนจำหน่ายเท่านั้น" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as OrderSender | null;
  const sender = cleanSender(body);
  // ตั้งที่อยู่ผู้ส่งเอง = ที่อยู่ที่พัสดุตีกลับไปหา → ต้องมีเบอร์ให้ขนส่งติดต่อได้
  if (sender?.address && !sender.phone)
    return NextResponse.json({ error: "กรอกที่อยู่ผู้ส่งแล้วต้องมีเบอร์ผู้ส่งด้วย (ขนส่งใช้ติดต่อตอนของตีกลับ)" }, { status: 400 });

  const { error } = await saveDealerSender(sb, uid, sender);
  if (error) return NextResponse.json({ error }, { status: 500 });

  // ใบที่ยังค้างอยู่ก็ควรได้ชื่อนี้ด้วย — ไม่งั้นตัวแทนตั้งชื่อแล้วแต่ใบที่เพิ่งสั่งยังขึ้นชื่อร้านเรา
  // (เจอจริง 15 ก.ย. 69 · OD-260915-3447) · แตะเฉพาะใบตัวแทนของเจ้าตัวที่ยังไม่ได้ตั้งผู้ส่ง และร้านยังไม่ปริ้นใบงาน
  const applied = sender ? await applyToOpenOrders(sb, uid, sender) : [];
  return NextResponse.json({ ok: true, ...(sender ? { sender } : {}) , applied });
}

const LOCKED: OrderStatus[] = ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"];

/** เติมผู้ส่งให้ใบตัวแทนของบัญชีนี้ที่ยังแก้ได้ — คืนเลขออเดอร์ที่เติมให้ */
async function applyToOpenOrders(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, uid: string, sender: OrderSender): Promise<string[]> {
  const { data, error } = await sb.from("orders").select("data").not("data->dealer", "is", null).order("created_at", { ascending: false }).limit(200);
  if (error) return [];
  const done: string[] = [];
  for (const row of data ?? []) {
    const o = row.data as Order;
    if (!o.dealer || o.printedAt || LOCKED.includes(o.status) || cleanSender(o.sender)) continue;
    if ((await resolveDealerUid(sb, o)) !== uid) continue;
    const next = withLog({ ...o, sender, savedAt: new Date().toISOString() }, "ตัวแทน", "ตั้งผู้ส่งบนใบปะหน้า",
      `${[sender.name, sender.phone].filter(Boolean).join(" · ")} (ตั้งผู้ส่งประจำในหน้าบัญชี)`);
    const { error: e } = await updateOrder(sb, next, { prev: o });
    if (!e) done.push(o.id);
  }
  return done;
}
