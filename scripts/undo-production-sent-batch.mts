/**
 * ↩︎ ถอยติ๊ก "ส่งเข้าผลิตแล้ว" (productionSent) ที่เขียนไปเป็นชุดจากการโยนโฟลเดอร์ในช่วงเวลาหนึ่ง (16 ก.ย. 69 — ทดสอบเวอร์ชัน auto แล้วเขียนลงฐานจริง)
 *   node --conditions=react-server --import tsx scripts/undo-production-sent-batch.mts [--since=ISO] [--until=ISO] [--apply]
 * ค่าเริ่มต้น since = 3 ชั่วโมงก่อน · ถอยเฉพาะใบที่ productionSent.at อยู่ในช่วง และมาจากโฟลเดอร์ (folder มีค่า)
 * แผนรอบตัวอย่าง (shipPlan) ที่ตั้งพร้อมกันไม่แตะ — บอกเฉย ๆ
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] as [string, string];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const since = new Date(arg("since") ?? Date.now() - 3 * 3600e3);
const until = new Date(arg("until") ?? Date.now());
const apply = args.includes("--apply");

const { data, error } = await sb.from("orders").select("id,data").not("data->productionSent", "is", null);
if (error) throw error;
const hit = (data ?? [])
  .map((r) => r.data as Order)
  .filter((o) => o.productionSent && new Date(o.productionSent.at) >= since && new Date(o.productionSent.at) <= until)
  .sort((a, b) => a.productionSent!.at.localeCompare(b.productionSent!.at));
console.log(`ช่วง ${since.toISOString()} → ${until.toISOString()} · เจอ ${hit.length} ใบ`);
for (const o of hit) {
  const p = o.productionSent!;
  const plan = (o.log ?? []).some((l) => new Date(String((l as { at?: string }).at ?? 0)) >= since && /ตั้งแผนส่งตัวอย่างจากโฟลเดอร์/.test(String((l as { action?: string }).action ?? "")));
  console.log(`  ${o.id}  ${o.customer?.name ?? ""}  · ${p.at}  by ${p.by}  · ${p.folder ?? "(ติ๊กเอง)"}  · สถานะ ${o.status}${o.printedAt ? " · ปริ้นแล้ว" : ""}${plan ? " · 🎁 ตั้งแผนตัวอย่างพร้อมกัน (ไม่แตะ)" : ""}`);
}
if (!apply) {
  console.log("(dry-run — ใส่ --apply เพื่อถอยจริง)");
  process.exit(0);
}
let n = 0;
for (const o of hit) {
  const next = withLog({ ...o, productionSent: undefined }, "ระบบ", "ยกเลิกติ๊กส่งเข้าผลิต", `ถอยชุดที่เขียนตอนทดสอบโยนโฟลเดอร์ ${o.productionSent!.at}`);
  const { error: e } = await updateOrder(sb, next);
  if (e) console.log(`  ✗ ${o.id}: ${e.message}`);
  else n++;
}
console.log(`ถอยแล้ว ${n}/${hit.length} ใบ`);
