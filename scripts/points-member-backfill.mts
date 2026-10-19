/**
 * 🦆 เติมแต้มสะสมย้อนหลังให้ออเดอร์ที่ชำระครบแล้วแต่ "ไม่เคยถูกบวกแต้ม"
 *
 * ต้นเรื่อง (พนักงานแจ้ง 19 ต.ค. 69 · OD-261001-2510): ลูกค้าสมัครสมาชิกแล้วสั่งเอง จ่ายครบ ของถึงแล้ว
 * แต่หน้า /account โชว์ยอดสะสม ฿0 — awardPointsForOrder เดิมหาการ์ดจากเบอร์โทรอย่างเดียว ไม่ดูบัญชีสมาชิก (customerId)
 * หาไม่เจอ/เจอหลายใบ = ข้ามเงียบ แล้วซิงก์มาสร้างการ์ดสมาชิกแต้ม 0 ทีหลัง (แก้ตัวหาการ์ดแล้วใน contact-points.ts)
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/points-member-backfill.mts                    (ดูรายการ ไม่เขียน)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/points-member-backfill.mts --apply            (บวกแต้มจริง)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/points-member-backfill.mts OD-261001-2510 --apply
 *   --all = รวมใบ guest ที่ไม่ได้ผูกบัญชี (ค่าเริ่มต้นดูเฉพาะใบสมาชิก customerId + ใบผูก contactId)
 *
 * บวกผ่าน awardPointsForOrder ตัวเดียวกับระบบจริง (กันบวกซ้ำต่อออเดอร์เอง) — รันซ้ำได้
 */
import { createClient } from "@supabase/supabase-js";
import { isFreeOrder, isPaidStatus, orderTotal, type Order } from "../src/lib/admin-data";
import { normalizePhone } from "../src/lib/contacts";
import { awardPointsForOrder } from "../src/lib/server/contact-points";
import { syncContacts } from "../src/lib/server/contacts-sync";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const all = args.includes("--all");
const only = new Set(args.filter((a) => a.startsWith("OD-")));

async function pages<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const orders = (await pages<{ data: Order }>((f, t) => sb.from("orders").select("data").order("created_at").range(f, t))).map((r) => r.data);
const logs = await pages<{ id: string }>((f, t) => sb.from("contact_points").select("id").like("id", "%:od:%").range(f, t));
// ออเดอร์ที่มีแถวบวกแต้มที่ยังไม่ถูกคืน
const revoked = new Set(logs.filter((l) => l.id.endsWith(":คืน")).map((l) => l.id.slice(0, -":คืน".length)));
const awarded = new Set(logs.filter((l) => !l.id.endsWith(":คืน") && !revoked.has(l.id)).map((l) => l.id.split(":od:")[1].split(":")[0]));

const todo = orders.filter(
  (o) =>
    (!only.size || only.has(o.id)) &&
    (all || o.customerId || o.contactId) &&
    isPaidStatus(o.status) &&
    !isFreeOrder(o) &&
    (!o.deposit || o.deposit.settledAt) &&
    orderTotal(o) > 0 &&
    !awarded.has(o.id)
);

// การ์ดที่แต่ละใบจะได้ (อ่านอย่างเดียว — ตอน --apply ตัวจริงตัดสินใน awardPointsForOrder)
const memberIds = [...new Set(todo.map((o) => o.customerId).filter(Boolean))] as string[];
const byMember = new Map<string, { id: string; name: string; point: number }>();
for (let i = 0; i < memberIds.length; i += 200) {
  const { data } = await sb.from("contacts").select("id,data").in("data->>memberId", memberIds.slice(i, i + 200));
  for (const r of data ?? []) {
    const c = r.data as { memberId?: string; name?: string; point?: number };
    if (c.memberId) byMember.set(c.memberId, { id: r.id as string, name: c.name ?? "", point: Number(c.point) || 0 });
  }
}

let sum = 0;
for (const o of todo) {
  const card = o.contactId ? `#${o.contactId} (ผูกไว้)` : o.customerId ? (byMember.get(o.customerId) ? `#${byMember.get(o.customerId)!.id} ${byMember.get(o.customerId)!.name} (แต้มตอนนี้ ${byMember.get(o.customerId)!.point.toLocaleString()})` : "ยังไม่มีการ์ดสมาชิก → ซิงก์สร้างให้") : `จับคู่เบอร์ ${normalizePhone(o.phone) || "-"}`;
  sum += orderTotal(o);
  console.log(`• ${o.id} · ${o.status} · ${o.customer} · ฿${orderTotal(o).toLocaleString()} → ${card}`);
}
console.log(`\nมีแต้มแล้ว ${awarded.size} ใบ (ล่าสุด: ${[...awarded].sort().slice(-5).join(", ")})`);
console.log(`${todo.length} ใบ รวม ฿${sum.toLocaleString()} ที่ยังไม่ได้แต้ม${apply || !todo.length ? "" : " — ใส่ --apply เพื่อบวกจริง"}`);

if (apply && todo.length) {
  // ซิงก์ครั้งเดียวก่อน ให้สมาชิกทุกคนมีการ์ด — ไม่ต้องให้ awardPointsForOrder ซิงก์ซ้ำทุกใบ
  console.log("\nซิงก์การ์ดสมาชิก…", await syncContacts(sb, { force: true }));
  for (const o of todo) await awardPointsForOrder(o);
  const after = await pages<{ id: string }>((f, t) => sb.from("contact_points").select("id").like("id", "%:od:%").range(f, t));
  const done = new Set(after.filter((l) => !l.id.endsWith(":คืน")).map((l) => l.id.split(":od:")[1].split(":")[0]));
  const missed = todo.filter((o) => !done.has(o.id));
  console.log(`✏️ บวกแล้ว ${todo.length - missed.length} ใบ${missed.length ? ` · ยังหาการ์ดไม่ได้ ${missed.length} ใบ: ${missed.map((o) => o.id).join(", ")}` : ""}`);
}
