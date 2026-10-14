/**
 * 🪪 OD-261002-6439 (เมษิณี): ใบสร้างโดยเลือกการ์ด #11210 ฐิติมา ไว้ แล้วพิมพ์ชื่อ/เบอร์ลูกค้าคนใหม่ทับ → แต้ม 820 เข้าผิดคน
 * ย้ายผู้ติดต่อไป #12346 (Mเมษิณี · เบอร์ตรง · ผูกบัญชีเว็บแล้ว) + ย้ายแต้มด้วย awardPointsForOrder ตัวเดียวกับระบบ (คืนจาก #11210 → บวก #12346)
 *
 *   node --env-file=.env.local --require ./scripts/_tmp/shim-award.cjs --import tsx scripts/_tmp/fix-6439-contact.mts          (ดูก่อน)
 *   node --env-file=.env.local --require ./scripts/_tmp/shim-award.cjs --import tsx scripts/_tmp/fix-6439-contact.mts --apply
 */
import { createClient } from "@supabase/supabase-js";
import { withLog, type Order } from "../../src/lib/admin-data";
import { updateOrder } from "../../src/lib/server/order-write";
import { awardPointsForOrder } from "../../src/lib/server/contact-points";

const ID = "OD-261002-6439";
const FROM = "11210";
const TO = "12346";
const apply = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { data, error } = await sb.from("orders").select("data").eq("id", ID).single();
if (error || !data) throw error ?? new Error("ไม่พบออเดอร์");
const o = (data as { data: Order }).data;
const card = async (id: string) => (await sb.from("contacts").select("data->name,data->phone,data->point,data->tierCycleSpend,data->tierLevel").eq("id", id).single()).data;
const rows = async () => (await sb.from("contact_points").select("id,contact_id,data->point").like("id", `%:od:${ID}%`)).data;
console.log({ order: { contactId: o.contactId, customer: o.customer, phone: o.phone, status: o.status }, from: await card(FROM), to: await card(TO), rows: await rows() });
if (o.contactId !== FROM && o.contactId !== TO) throw new Error(`ใบผูก #${o.contactId} ไม่ใช่ที่คาด — ไม่แตะ`);
if (!apply) {
  console.log("\n(ยังไม่เขียน — ใส่ --apply)");
  process.exit(0);
}
let cur = o;
if (o.contactId !== TO) {
  const next = withLog({ ...o, contactId: TO }, "ระบบ", "เปลี่ยนผู้ติดต่อ", `#${FROM} → #${TO} · การ์ดเดิมค้างจากตอนสร้างใบ (เบอร์/ชื่อไม่ตรงลูกค้า) · ย้ายแต้ม 820 ตาม`);
  const { order: saved, error: e } = await updateOrder(sb as never, next, { prev: o, by: "ระบบ" });
  if (e) throw e;
  cur = saved;
}
await awardPointsForOrder(cur);
console.log("\nหลังแก้:", { from: await card(FROM), to: await card(TO), rows: await rows() });
