/**
 * 🩹 ซ่อม OD-260915-7543 — ส่วนลดสมาชิก Silver 5% ค้างอยู่ที่ยอดก่อนสั่งเพิ่ม (เจ้าของร้านแจ้ง 22 ก.ย. 69)
 *
 * เรื่องเดิม: 16 ก.ย. ยอดสินค้า ฿5,520 → ลด −฿276 ถูกแล้ว · ลูกค้าโอน ฿5,294
 * 22 ก.ย. แอดมินเพิ่มอีก 2 รายการ (฿1,380 + ฿1,080) ยอดสินค้าขึ้นเป็น ฿7,980 แต่ส่วนลดยังค้าง −฿276
 * เพราะด่าน mayAutoMemberTier เดิมตัดใบที่ "มีเงินเข้าแล้ว" ทิ้งทั้งใบ → ของที่สั่งเพิ่มไม่ได้ส่วนลดเลย
 * แก้กติกาแล้วใน src/lib/server/order-member-tier.ts (ใบที่โอนแล้ว = ลดเพิ่มได้อย่างเดียว) — ใบนี้ต้องเติมย้อนหลัง
 *
 * ที่ถูก: −฿399 (5% ของ ฿7,980) · ยอดรวม ฿7,754 → ฿7,631 · ค้าง ฿2,460 → ฿2,337
 * ⚠️ ระบบแจ้งไลน์ลูกค้าไปแล้วว่าค้าง ฿2,460 (22 ก.ย. 10:10) → สคริปต์นี้เข้า "คิวแจ้งยอดใหม่" ให้ด้วย
 *    (ไม่ยิงไลน์เอง — กดปุ่ม 📣 ในหน้าออเดอร์ หรือปล่อยให้ cron แจ้งเองเมื่อครบเวลา)
 *
 * รัน: node --conditions=react-server --import tsx scripts/fix-7543-member-tier-append.mts [--apply]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { orderBalance, orderTotal, withLog, type Order } from "../src/lib/admin-data";
import { planBalanceQueue } from "../src/lib/balance-notify";
import { syncOrderMemberTier } from "../src/lib/server/order-member-tier";
import { updateOrder } from "../src/lib/server/order-write";

const ID = process.argv.find((a) => a.startsWith("OD-")) ?? "OD-260915-7543";
const BY = "ระบบ (แก้ย้อนหลัง)";
const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data, error } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
if (error || !data) throw new Error(`อ่าน ${ID} ไม่ได้: ${error?.message ?? "ไม่พบ"}`);
const existing = data.data as Order;

const synced = await syncOrderMemberTier(sb as never, existing);
if ((synced.discount?.amount ?? 0) === (existing.discount?.amount ?? 0)) {
  console.log(`• ${ID} ส่วนลดตรงอยู่แล้ว (−฿${existing.discount?.amount ?? 0}) — ไม่ต้องแก้`);
  process.exit(0);
}

const balBefore = orderBalance(existing);
const balNow = orderBalance(synced);
console.log(
  `${APPLY ? "✏️" : "•"} ${ID} · ${existing.customer}\n` +
    `   ส่วนลด −฿${existing.discount?.amount ?? 0} → −฿${synced.discount?.amount ?? 0}\n` +
    `   ยอดรวม ฿${orderTotal(existing).toLocaleString()} → ฿${orderTotal(synced).toLocaleString()}\n` +
    `   ค้าง ฿${balBefore.toLocaleString()} → ฿${balNow.toLocaleString()} (เคยแจ้งไลน์ไว้ ฿${(existing.balanceNotified?.balance ?? 0).toLocaleString()})`
);

let toSave = withLog(
  synced,
  BY,
  "คิดส่วนลดระดับสมาชิก",
  `${synced.discount!.label} −${synced.discount!.amount.toLocaleString("th-TH")} บาท (ของที่สั่งเพิ่มเมื่อ 22 ก.ย. ยังไม่ได้ส่วนลด — เติมย้อนหลัง)`
);

/**
 * 💳📣 ยอดค้างที่ลูกค้ารู้ (฿2,460 จากไลน์ 10:10) ต้องถูกแก้ให้ตรง — เข้าคิวเดียวกับที่หน้าแอดมินใช้
 * ไม่ยิงไลน์เองจากสคริปต์ (กติกาเดียวกับ PATCH: คิวก่อน · ปุ่ม 📣 หรือ cron เป็นคนส่ง)
 */
const shrankAfterNotice =
  !!existing.balanceNotified && balNow < balBefore - 0.5 && Math.abs(balNow - existing.balanceNotified.balance) > 0.5;
const plan = planBalanceQueue({ balBefore, balNow, pending: existing.balancePending, triggered: shrankAfterNotice });
if (plan.action === "start" || plan.action === "refresh") {
  toSave = {
    ...toSave,
    balancePending: { at: new Date().toISOString(), from: plan.from, balance: plan.balance, why: existing.balancePending?.why, by: BY },
  };
  if (plan.action === "start")
    toSave = withLog(
      toSave,
      BY,
      "ยอดที่ต้องโอนเพิ่มรอแจ้งลูกค้า",
      `ค้าง ${balNow.toLocaleString("th-TH")} บาท (เดิม ${balBefore.toLocaleString("th-TH")}) — ยังไม่ส่งไลน์ กดปุ่ม 📣 แจ้งยอดในหน้าออเดอร์`
    );
  console.log(`   📣 เข้าคิวแจ้งยอดใหม่ (${plan.action}) — ลูกค้าจะได้ข้อความยอด ฿${balNow.toLocaleString()}`);
}

if (!APPLY) {
  console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)");
  process.exit(0);
}

mkdirSync("backups", { recursive: true });
const backup = `backups/${ID}-before-member-tier-${Date.now()}.json`;
writeFileSync(backup, JSON.stringify(existing, null, 2));
console.log(`   💾 สำรองไว้ที่ ${backup}`);

const { error: upErr } = await updateOrder(sb as never, toSave, { prev: existing, by: BY });
if (upErr) throw new Error(`เขียนไม่สำเร็จ: ${upErr.message}`);
console.log("   ✅ บันทึกแล้ว");
