import "server-only";
import { orderTotal, trackingBoxes, type Order } from "@/lib/admin-data";
import { getSupabaseAdmin } from "./supabase-admin";
import { rateLimited } from "./rate-limit";
import { slowestActive, wipJobsForOrder } from "./wip-production";

/**
 * 🧾 ข้อมูลออเดอร์สำหรับบอท — ใช้ร่วม บอท LINE (customer-profile) และแชทหน้าเว็บ (chat-answer)
 *   เจ้าของร้าน 12 ต.ค. 69 "อยากให้แชทหน้าเว็บรู้เท่ากับบอทใน LINE เช็คออเดอร์รู้เท่ากัน"
 *   บรรทัดละใบ: เลข · วันที่ · รายการ · สถานะ · (ขั้นผลิตจริงบนบอร์ด TP) · ยอด · เลขพัสดุ
 *   ขั้นผลิต = จับคู่แบบชัวร์ (exactOnly) ส่งแค่ชื่อขั้น · ไม่เกิน 3 ใบ · มีงบเวลา
 */
export function thDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? "").trim().slice(0, 16);
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const bkk = new Date(d.getTime() + 7 * 3600_000);
  return `${bkk.getUTCDate()} ${months[bkk.getUTCMonth()]}`;
}
export function orderItemsText(o: Order): string {
  const items = (o.items ?? []).slice(0, 3).map((it) => `${it.name}${it.qty ? ` ×${it.qty}` : ""}`);
  const more = (o.items ?? []).length > 3 ? ` +อีก ${(o.items ?? []).length - 3}` : "";
  return items.join(", ") + more;
}

export async function describeOrdersForBot(orders: Order[], opts: { max?: number; stageBudgetMs?: number } = {}): Promise<{ lines: string[]; stageOf: Map<string, string> }> {
  const max = opts.max ?? 3;
  const active = orders.filter((o) => !["เสร็จสิ้น", "ยกเลิก"].includes(o.status));
  const stageOf = new Map<string, string>();
  const inProd = active.filter((o) => o.status === "อนุมัติแบบ" || o.status === "กำลังผลิต").slice(0, 3);
  if (inProd.length) {
    const work = Promise.all(
      inProd.map(async (o) => {
        try {
          const { jobs } = await wipJobsForOrder(o.id, o.productionSent?.folder, { exactOnly: true });
          const live = jobs.filter((j) => j.status !== "archived");
          if (!live.length) return;
          const slow = slowestActive(live);
          stageOf.set(o.id, slow ? `ขั้นผลิตตอนนี้: ${slow.stage}` : "ผลิตเสร็จทุกชิ้นแล้ว รอแพ็ค/ส่ง");
        } catch {
          /* อ่านบอร์ดไม่ได้ = ไม่บอกขั้น */
        }
      })
    );
    await Promise.race([work, new Promise((r) => setTimeout(r, Math.max(200, opts.stageBudgetMs ?? 2500)))]);
  }
  const stage = (o: Order) => (stageOf.has(o.id) ? ` (${stageOf.get(o.id)})` : "");
  const track = (o: Order) => {
    const t = trackingBoxes(o).map((b) => b.tracking).filter(Boolean);
    return t.length ? ` · เลขพัสดุ ${t.slice(0, 3).join(", ")}${o.shipping ? ` (${o.shipping})` : ""}` : "";
  };
  const lines: string[] = [];
  for (const o of orders.slice(0, max)) lines.push(`• ${o.id} (${thDateShort(o.date)}) ${orderItemsText(o)} — ${o.status}${stage(o)} ฿${orderTotal(o).toLocaleString()}${track(o)}`);
  if (active.length) lines.push(`มีออเดอร์ที่ยังไม่จบ ${active.length} ใบ: ${active.map((o) => `${o.id} ${o.status}${stage(o)}`).join(", ")}`);
  if (stageOf.size) lines.push("ถ้าลูกค้าถามว่างานถึงไหน: ตอบตามขั้นผลิตในวงเล็บได้เลย (เป็นข้อมูลจริงจากฝ่ายผลิต) · ห้ามเดาวัน/เวลาเสร็จ · ห้ามบอกชื่อพนักงาน");
  if (orders.some((o) => trackingBoxes(o).length)) lines.push("ถ้าลูกค้าถามเลขพัสดุ: ตอบเลขพัสดุตามข้อมูลนี้ได้เลย");
  return { lines, stageOf };
}

/* ── แชทหน้าเว็บ: หาออเดอร์ของคนที่คุยอยู่ (ต้องยืนยันตัวตนได้เท่านั้น) ───────────────── */

export const ORDER_Q_RE = /OD-\d{6}-\d{4}|ออเดอร์|คำสั่งซื้อ|สถานะ|ถึงไหน|ส่ง(ของ)?(แล้ว)?(ยัง|หรือยัง)|ได้ของ(เมื่อไหร่|วันไหน|ยัง)|เลขพัสดุ|แทร็ก|แทร็ค|tracking|ผลิต(ถึง|เสร็จ)|เสร็จ(ยัง|หรือยัง)|ยอดค้าง|ค้างจ่าย/i;
const cleanPhone = (raw: string | undefined | null) => {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("66") && d.length >= 11) d = `0${d.slice(2)}`;
  return d;
};

export type WebOrderLookup = { orders: Order[]; via: string[]; needVerify: string[] };

/**
 * ยืนยันตัวตนได้ 3 ทาง (เหมือนหน้าออเดอร์ของเว็บ):
 *  1) myOrders = ลิงก์ออเดอร์ที่เคยเปิดในเครื่องนี้ (id + กุญแจลับ จาก localStorage) — กุญแจต้องตรง
 *  2) authToken = ลูกค้าล็อกอินอยู่ → ออเดอร์ที่ผูก customerId
 *  3) ในข้อความมีเลข OD + เบอร์โทรที่ใช้ตอนสั่ง (≥9 หลัก) ตรงกัน — นับครั้งกันไล่เดา (IP 12/10 นาที · เบอร์ 10/ชม. เท่าหน้า /order/find)
 * เลข OD ที่ยืนยันไม่ได้ → needVerify (บอทต้องขอเบอร์ ห้ามบอกข้อมูล)
 */
export async function lookupWebOrders(input: { message: string; history?: string; myOrders?: { id?: string; key?: string }[]; authToken?: string; ip: string }): Promise<WebOrderLookup> {
  const sb = getSupabaseAdmin();
  const res: WebOrderLookup = { orders: [], via: [], needVerify: [] };
  if (!sb) return res;
  const add = (o: Order | undefined, via: string) => {
    if (!o?.id || res.orders.some((x) => x.id === o.id)) return;
    res.orders.push(o);
    if (!res.via.includes(via)) res.via.push(via);
  };
  // 1) ลิงก์ในเครื่อง
  const links = (input.myOrders ?? []).filter((l) => /^OD-\d{6}-\d{4}$/.test(String(l?.id ?? ""))).slice(0, 10);
  if (links.length) {
    const { data } = await sb.from("orders").select("data").in("id", links.map((l) => String(l.id)));
    for (const r of data ?? []) {
      const o = (r as { data: Order }).data;
      const l = links.find((x) => x.id === o.id);
      if (l && (!o.key || o.key === l.key)) add(o, "device");
    }
  }
  // 2) ล็อกอิน
  if (input.authToken) {
    try {
      const { data: u } = await sb.auth.getUser(input.authToken);
      if (u?.user?.id) {
        const { data } = await sb.from("orders").select("data").eq("data->>customerId", u.user.id).order("created_at", { ascending: false }).limit(8);
        for (const r of data ?? []) add((r as { data: Order }).data, "login");
      }
    } catch {
      /* token หมดอายุ = ข้าม */
    }
  }
  // 3) เลข OD + เบอร์ในข้อความ (หรือข้อความก่อนหน้าของลูกค้าในบทสนทนานี้)
  const text = `${input.message}\n${input.history ?? ""}`;
  const ods = [...new Set(text.match(/OD-\d{6}-\d{4}/gi)?.map((x) => x.toUpperCase()) ?? [])].slice(0, 3);
  const phone = cleanPhone((text.match(/(?:\+?66|0)[\d\s-]{8,12}\d/g) ?? []).map(cleanPhone).find((d) => d.length >= 9 && d.length <= 10));
  for (const od of ods) {
    if (res.orders.some((o) => o.id === od)) continue;
    if (!phone) {
      res.needVerify.push(od);
      continue;
    }
    if ((await rateLimited(`chat-order:ip:${input.ip}`, 12, 10 * 60_000)) || (await rateLimited(`chat-order:phone:${phone}`, 10, 60 * 60_000))) {
      res.needVerify.push(od);
      continue;
    }
    const { data } = await sb.from("orders").select("data").eq("id", od).maybeSingle();
    const o = (data as { data?: Order } | null)?.data;
    if (o && cleanPhone(o.phone) === phone) add(o, "phone");
    else res.needVerify.push(od);
  }
  res.orders.sort((a, b) => (a.date < b.date ? 1 : -1));
  return res;
}

/** ก้อนข้อความให้ AI ของแชทเว็บ — ข้อมูลชุดเดียวกับบอท LINE + กติกาความเป็นส่วนตัว */
export async function webOrderContext(lk: WebOrderLookup, askedAboutOrder: boolean): Promise<string> {
  const parts: string[] = [];
  if (lk.orders.length) {
    const { lines } = await describeOrdersForBot(lk.orders, { max: 5, stageBudgetMs: 2500 });
    parts.push(`🧾 ออเดอร์ของลูกค้าคนนี้ (ยืนยันตัวตนแล้ว · ข้อมูลจริงจากระบบ):\n${lines.join("\n")}`);
  }
  if (lk.needVerify.length)
    parts.push(`🔒 ลูกค้าพูดถึง ${lk.needVerify.join(", ")} แต่ยังยืนยันตัวตนไม่ได้ → ห้ามบอกข้อมูลใด ๆ ของออเดอร์นั้น ให้ขอเบอร์โทรที่ใช้ตอนสั่ง (พิมพ์มาพร้อมเลขออเดอร์) หรือให้เปิดลิงก์ออเดอร์จากเครื่องที่สั่ง`);
  else if (askedAboutOrder && !lk.orders.length)
    parts.push("🔒 ลูกค้าถามเรื่องออเดอร์แต่ระบบยังไม่รู้ว่าเป็นใบไหน → ขอเลขออเดอร์ (OD-xxxxxx-xxxx) พร้อมเบอร์โทรที่ใช้ตอนสั่ง ห้ามเดาสถานะ");
  return parts.join("\n");
}
