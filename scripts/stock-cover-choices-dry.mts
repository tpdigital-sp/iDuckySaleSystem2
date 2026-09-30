/**
 * 🔎 ดูอย่างเดียว: "ช่องว่าง" ในสินค้าที่แยกสต๊อกตามตัวเลือกแล้ว — ค่าที่ยังไม่มี SKU ทั้งที่พี่ ๆ ในกลุ่มมี
 *   npx tsx scripts/stock-cover-choices-dry.mts
 * รันตัววางแผนแบบ "ถือว่าทุกช่องว่างเป็นค่าใหม่" (ไม่ส่ง isNew) จึงเป็นภาพรวมช่องว่างทั้งร้าน ไม่ใช่สิ่งที่ระบบจะทำจริง
 * ของจริง (ตอนบันทึกสินค้า) ทำเฉพาะค่าที่เพิ่งเพิ่ม — วัดครั้งแรก 30 ก.ย. 69: 74 สินค้า / 35 ช่องว่างที่ตั้งใจเว้น
 * ไม่เขียนอะไรลงฐาน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { planChoiceCover, type PlanSku } from "../src/lib/stock-cover-plan";
import type { Product } from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64!, "base64").toString("utf8"))) }), "tp-fixflow");

const [{ data }, snap] = await Promise.all([sb.from("products").select("id,category,data"), db.collection("stockItems").get()]);
const all = snap.docs.map((d) => d.data() as PlanSku);
const codes = new Set(all.map((s) => String(s.code ?? "")).filter(Boolean));
const items = all.filter((s) => s.active !== false);
const rows = ((data ?? []) as { id: string; category?: string | null; data: Product | null }[]).filter((r) => r.category !== "__presets__" && !/^__/.test(r.id) && r.data?.name);
let split = 0, total = 0;
for (const r of rows) {
  const p = r.data as Product;
  const has = (p.options ?? []).some((o) => !o.presetId && (o.choices ?? []).some((c) => c.stockItemId || (c.stockLinks ?? []).length));
  if (!has) continue;
  split++;
  const plan = planChoiceCover(p, items, codes);
  if (!plan.length) continue;
  total += plan.length;
  console.log(`\n## ${r.id} — ${p.name}: จะสร้าง ${plan.length} ตัว`);
  for (const it of plan) console.log(`   ${it.reuseId ? "↩ ผูกตัวเดิม" : "＋ สร้าง"} ${it.code}  ${it.name}${it.pairChoice ? `  (คู่ ${it.pairLabel}=${it.pairChoice})` : ""}`);
}
console.log(`\nสินค้าที่แยกสต๊อกตามตัวเลือกแล้ว ${split} ตัว · จะสร้าง/ผูกทั้งหมด ${total} SKU`);
process.exit(0);
