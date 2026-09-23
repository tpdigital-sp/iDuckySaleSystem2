/**
 * 📮 ซ่อม OD-260917-1691 — ใบนี้ส่ง 2 กล่อง 2 ที่อยู่ แต่เลขถูกยิงทับกันในช่องเดียว
 * เลขที่ยิงก่อน (EQ226638498TH) เหลืออยู่แต่ในประวัติ → ย้ายกลับมาเป็น "กล่องที่ 2" ของใบ
 * ลูกค้าเคยได้เลขนี้ทางไลน์ไปแล้ว (ตอนยิงครั้งแรก) จึงไม่ยิงไลน์ซ้ำ — เขียนตรงผ่าน updateOrder
 *
 * รัน: npx tsx scripts/fix-1691-second-box.mts [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ownsTrackingNumber, trackingBoxes, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = "OD-260917-1691";
const BOX2 = "EQ226638498TH"; // เลขที่ยิงก่อนแล้วถูกทับ (ประวัติ 22 ก.ย. 69 12:55)
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
if (error) throw error;
const o = data!.data as Order;
console.log("ก่อนแก้ :", o.status, "| กล่องที่ 1:", o.tracking ?? "—", "| กล่องเพิ่ม:", (o.extraTrackings ?? []).length);

if (ownsTrackingNumber(o, BOX2)) {
  console.log(`${BOX2} อยู่ในใบแล้ว — ไม่ต้องซ่อม`);
  process.exit(0);
}

// เวลาที่ยิงจริงจากประวัติ (ไม่มี = เวลาตอนนี้) — ให้ลำดับกล่องตรงกับความจริง
const shot = (o.log ?? []).find((e) => e.action === "บันทึกเลขพัสดุ" && (e.detail ?? "").trim() === BOX2);
const next = withLog(
  {
    ...o,
    extraTrackings: [...(o.extraTrackings ?? []), { tracking: BOX2, at: shot?.at ?? new Date().toISOString(), by: shot?.by ?? "แอดมิน" }],
  },
  "ระบบ (แก้ย้อนหลัง)",
  "📮 เพิ่มเลขพัสดุกล่องที่ 2",
  `${BOX2} — เลขนี้ยิงไว้ ${shot ? new Date(shot.at).toLocaleString("th-TH") : "22 ก.ย. 69"} แล้วถูกเลขกล่องที่ 1 ทับในช่องเดียวกัน · ไม่แจ้งไลน์ซ้ำ (ลูกค้าได้เลขนี้ไปแล้วตอนยิงครั้งแรก)`
);
console.log("หลังแก้ :", trackingBoxes(next).map((b) => `กล่องที่ ${b.box} ${b.tracking}`).join(" · "));

if (!APPLY) {
  console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)");
  process.exit(0);
}
mkdirSync("backups", { recursive: true });
const bak = `backups/${ID}.before-second-box.json`;
writeFileSync(bak, JSON.stringify(o, null, 1));
console.log("สำรองไว้ที่", bak);
const res = await updateOrder(sb, next, { prev: o, by: "ระบบ (แก้ย้อนหลัง)" });
if (res.error) throw res.error;
console.log("✅ บันทึกแล้ว");
