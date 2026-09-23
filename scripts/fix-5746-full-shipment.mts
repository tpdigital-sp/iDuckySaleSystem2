/**
 * 🚚 ซ่อม OD-260914-5746 — ใบนี้ส่งครบทั้งใบในกล่องเดียว ไม่ได้แบ่งส่ง (พนักงานแจ้ง 23 ก.ย. 69)
 *
 * ต้นเรื่อง: 16 ก.ย. 69 โยนโฟลเดอร์ “(เร่งขึ้นตย)…” → ระบบตั้งแผนแบ่งส่งรอบตัวอย่าง 3 ชิ้นให้เอง
 * ทั้งที่ใบนี้ชำระครบแล้ว (9,020 บาท ไม่ใช่ใบมัดจำ) แผนนั้นจึงไปล็อกทางปิดใบของฝ่ายแพ็ค (packGate.planPending)
 * 18 ก.ย. ของออกครบในกล่องเดียว (EQ226637563TH) แต่กดได้ทางเดียวคือ “ส่งบางส่วน รอบที่ 1” → ใบบันทึกแค่ 3/150 ชิ้น
 * ลูกค้าได้ไลน์ “จัดส่งบางส่วน” และใบค้างที่ “กำลังผลิต” มาถึงวันนี้
 *
 * ทำอะไร: ถอดรอบแบ่งส่งที่ยิงผิด + ถอดแผนที่ระบบตั้งเอง → ย้ายเลขพัสดุมาเป็นเลขของใบ → ปิดใบเป็น "จัดส่งแล้ว"
 * เงียบ ๆ ไม่ยิงไลน์ (ข้อความแก้ให้ลูกค้าแอดมินพิมพ์เองในห้องแชท) · ไม่แตะยอดเงิน
 *
 *   node --conditions=react-server --import tsx scripts/fix-5746-full-shipment.mts            (ดูเฉย ๆ)
 *   node --conditions=react-server --import tsx scripts/fix-5746-full-shipment.mts --apply    (บันทึกจริง)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { shipmentQty, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = "OD-260914-5746";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data, error } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
if (error) throw error;
const o = data!.data as Order;
const round = o.shipments?.[0];
if (!round?.tracking) {
  console.log("ไม่มีรอบแบ่งส่งที่มีเลขพัสดุให้ถอด — อาจซ่อมไปแล้ว");
  process.exit(0);
}
console.log("ก่อนแก้ :", o.status, "| เลขพัสดุใบ:", o.tracking ?? "—", "| รอบแบ่งส่ง:", o.shipments!.length, `(${round.tracking} · ${shipmentQty(round)} ชิ้น)`, "| แผนแบ่งส่ง:", (o.shipPlan ?? []).length, "รอบ");

mkdirSync("backups", { recursive: true });
const bak = `backups/${ID}-before-full-shipment-fix.json`;
writeFileSync(bak, JSON.stringify(o, null, 1));
console.log("สำรองไว้ที่", bak);

const BY = "ระบบ (แก้ย้อนหลัง)";
let next: Order = { ...o, shipments: undefined, shipPlan: undefined, tracking: round.tracking, status: "จัดส่งแล้ว" };
next = withLog(
  next,
  BY,
  "🚚 ถอดรอบแบ่งส่งที่ยิงผิด — ใบนี้ส่งครบในกล่องเดียว",
  `รอบที่ 1 · ${round.tracking} (${shipmentQty(round)} ชิ้น) → ใช้เป็นเลขพัสดุของใบ · พนักงานยืนยันว่าส่งทั้งหมด ไม่ได้แบ่งส่ง`
);
next = withLog(next, BY, "🎁 ถอดแผนแบ่งส่งที่ระบบตั้งเองจากโฟลเดอร์ตัวอย่าง", "ใบนี้ชำระครบแล้ว ตัวอย่างไปกล่องเดียวกับล็อตหลัก — ไม่ต้องมีแผนแบ่งส่ง");
next = withLog(next, BY, "จัดส่งแล้ว", `เลขพัสดุ ${round.tracking} — ไม่แจ้งไลน์ซ้ำ แอดมินแก้ข้อความให้ลูกค้าในห้องแชทเอง`);
console.log("หลังแก้ :", next.status, "| เลขพัสดุใบ:", next.tracking, "| รอบแบ่งส่ง:", (next.shipments ?? []).length, "| แผนแบ่งส่ง:", (next.shipPlan ?? []).length, "รอบ");

if (!APPLY) {
  console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)");
  process.exit(0);
}
const res = await updateOrder(sb, next, { prev: o, by: BY });
if (res.error) throw new Error(res.error.message);
console.log("✅ บันทึกแล้ว");
