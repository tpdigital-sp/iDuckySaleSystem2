/**
 * 🩹 ล้างคิว "ยอดที่ต้องโอนเพิ่ม" ที่เกิดผิดบน OD-260928-1506 (30 ก.ย. 69)
 *
 * เรื่องเดิม: ใบมัดจำ 50% (15,461.5 จาก 30,923) สลิป K BIZ ไม่มี QR ตรวจตก → champ ใช้เมนู "เปลี่ยนสถานะ → ชำระแล้ว"
 * ซึ่งไม่รู้จักใบมัดจำ (ไม่ตั้ง deposit.firstPaidAt/paidTotal) → กลับไปรอตรวจสอบ → ระบบเห็น "ค้าง 30,923 (เดิม 0)" เปิดคิวแจ้งยอดโอนเพิ่ม
 * → กดปุ่มม่วง ยืนยันรับมัดจำ 50% แล้ว (ถูกต้อง) แต่คิวยังค้าง balance 15,461.5 = งวดที่ 2 ของมัดจำ ไม่ใช่ยอดเพิ่ม
 * cron balance-notify จะยิงไลน์ "มียอดเพิ่ม 15,461.5 โอนแล้วแนบสลิป" ให้ลูกค้าที่เพิ่งโอนมัดจำ → ต้องล้างคิวก่อน
 *
 * รัน: npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-1506-deposit-balance-queue.mts [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { orderTotal, orderBalance, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = "OD-260928-1506";
const BY = "ระบบ (แก้ย้อนหลัง)";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data, error } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
if (error || !data) throw new Error(`อ่าน ${ID} ไม่ได้: ${error?.message ?? "ไม่พบ"}`);
const o = data.data as Order;
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/${ID}-before-balance-queue-clear.json`, JSON.stringify(o, null, 1));

console.log(`${ID} ก่อนแก้ : ${o.status} · ยอดบิล ${orderTotal(o)} · paidTotal ${o.paidTotal} · ค้าง ${orderBalance(o)} · firstPaidAt ${o.deposit?.firstPaidAt} · balancePending ${JSON.stringify(o.balancePending)} · balanceNotified ${JSON.stringify(o.balanceNotified)}`);
if (!o.balancePending) { console.log("ไม่มีคิวค้าง — ไม่ต้องทำอะไร"); process.exit(0); }
if (!o.deposit?.firstPaidAt || o.deposit.settledAt) throw new Error("สภาพใบไม่ใช่แบบที่คาดไว้ (ต้องเป็นใบมัดจำที่รับงวดแรกแล้ว ยังไม่ครบ) — หยุด");

const next = withLog(
  { ...o, balancePending: undefined },
  BY,
  "ยกเลิกคิวแจ้งยอดโอนเพิ่ม",
  `คิวเกิดจากการเปลี่ยนสถานะเองบนใบมัดจำ (ระบบมองยอดงวดที่ 2 ${orderBalance(o).toLocaleString("th-TH")} บาทเป็น "ยอดเพิ่ม") — ไม่ใช่ยอดเพิ่มจริง ไม่ส่งไลน์ · ใบยังค้างงวดที่ 2 ตามโหมดมัดจำ ทวงตอนเข้าไลน์ผลิต`
);
if (!APPLY) { console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)"); process.exit(0); }
const r = await updateOrder(sb, next, { prev: o, by: BY });
if (r.error) throw new Error(r.error.message);
console.log("✅ ล้างคิวแล้ว");
