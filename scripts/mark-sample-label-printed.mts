/**
 * 🖨 จดว่าใบปะหน้ารอบตัวอย่างพิมพ์ไปแล้ว (ShipPlanRound.samplePrintedAt) ให้ใบที่พิมพ์ก่อนกติกา "พิมพ์ได้ครั้งเดียว" (16 ก.ย. 69)
 *   node --conditions=react-server --import tsx scripts/mark-sample-label-printed.mts OD-xxx [--apply]
 * ใช้เวลาที่พิมพ์ล่าสุด (lastPrintedAt) เป็นเวลาที่จด · ถ้ารอบนั้นมีธงอยู่แล้วไม่ทำซ้ำ
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { pendingSampleRound, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] as [string, string];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const [id, flag] = process.argv.slice(2);
if (!id) throw new Error("ระบุเลขออเดอร์");
const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
const o = data?.data as Order | undefined;
if (!o) throw new Error("ไม่พบออเดอร์");
const pending = pendingSampleRound(o);
if (!pending) throw new Error("ไม่มีรอบแบ่งส่งที่ยังไม่ออก");
if (pending.round.samplePrintedAt) {
  console.log("มีธงอยู่แล้ว:", pending.round.samplePrintedAt);
  process.exit(0);
}
const at = o.lastPrintedAt ?? o.printedAt ?? new Date().toISOString();
const last = [...(o.log ?? [])].reverse().find((l) => /🖨/.test(String((l as { action?: string }).action ?? "")));
const by = (last as { by?: string } | undefined)?.by ?? "ระบบ";
console.log(`รอบที่ ${pending.index + 1} · จดว่าพิมพ์แล้วโดย ${by} เมื่อ ${at}`);
if (flag !== "--apply") {
  console.log("(dry-run — ใส่ --apply เพื่อเขียนจริง)");
  process.exit(0);
}
const next = withLog(
  { ...o, shipPlan: (o.shipPlan ?? []).map((r, i) => (i === pending.index ? { ...r, samplePrintedAt: { by, at } } : r)) },
  "ระบบ",
  "🖨 จดย้อนหลัง: พิมพ์ใบปะหน้ารอบตัวอย่างไปแล้ว — ใบปะหน้าล็อกกลับ",
  `รอบที่ ${pending.index + 1} · พิมพ์โดย ${by} · พิมพ์ซ้ำต้องให้เจ้าของร้านกด 🔁 อนุญาต`
);
const { error } = await updateOrder(sb, next);
if (error) throw new Error(error.message);
console.log("✅ เขียนแล้ว");
