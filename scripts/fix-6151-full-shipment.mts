/**
 * 🚚 ซ่อม OD-260909-6151 — ใบนี้ส่งครบทั้งใบในกล่องเดียว ไม่ได้แบ่งส่ง (เจ้าของร้านยืนยัน 15 ก.ย. 69)
 * ถอดรอบแบ่งส่งที่ยิงผิดออก → ย้ายเลขพัสดุมาเป็นเลขของใบ → ปิดใบเป็น "จัดส่งแล้ว"
 * เงียบ ๆ ไม่ยิงไลน์ (ข้อความแก้ให้ลูกค้าแอดมินพิมพ์เองในห้องแชท)
 * รัน: npx tsx scripts/fix-6151-full-shipment.mts [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = "OD-260909-6151";
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
if (!round) { console.log("ไม่มีรอบแบ่งส่งให้ถอด — อาจซ่อมไปแล้ว"); process.exit(0); }
console.log("ก่อนแก้ :", o.status, "| เลขพัสดุใบ:", o.tracking ?? "—", "| รอบแบ่งส่ง:", o.shipments!.length, "|", round.tracking);

mkdirSync("backups", { recursive: true });
const bak = `backups/${ID}-before-full-shipment-fix.json`;
writeFileSync(bak, JSON.stringify(o, null, 1));
console.log("สำรองไว้ที่", bak);

let next: Order = { ...o, shipments: undefined, tracking: round.tracking, status: "จัดส่งแล้ว" };
next = withLog(next, "ระบบ (แก้ย้อนหลัง)", "🚚 ถอดรอบแบ่งส่งที่ยิงผิด — ใบนี้ส่งครบในกล่องเดียว", `รอบที่ 1 · ${round.tracking} → ใช้เป็นเลขพัสดุของใบ · เจ้าของร้านยืนยันว่าส่งทั้งหมด ไม่ได้แบ่งส่ง`);
next = withLog(next, "ระบบ (แก้ย้อนหลัง)", "จัดส่งแล้ว", `เลขพัสดุ ${round.tracking} — ไม่แจ้งไลน์ซ้ำ แอดมินแก้ข้อความให้ลูกค้าในห้องแชทเอง`);
console.log("หลังแก้ :", next.status, "| เลขพัสดุใบ:", next.tracking, "| รอบแบ่งส่ง:", (next.shipments ?? []).length);

if (!APPLY) { console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)"); process.exit(0); }
const res = await updateOrder(sb, next, { prev: o, by: "ระบบ (แก้ย้อนหลัง)" });
if (res.error) throw new Error(res.error.message);
console.log("✅ บันทึกแล้ว");
