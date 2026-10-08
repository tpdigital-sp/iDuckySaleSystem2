// ลบ SKU ที่สร้างซ้ำจากการกด "บันทึก" ซ้ำระหว่างรอ (ชื่อเดียวกันหลายตัว + รหัสชนกัน เช่น B-6000-3 ×2)
//   ⛔ 2 ต.ค. 69 เคยลบผิด: "ตะขอเงิน 1.5/2/2.5cm" ของสินค้า cardholder ชื่อซ้ำกันจริง แต่เป็นคนละตัว เพราะ
//      แยกสต๊อก "ตามเรทราคา" (ตระกูล เรทราคา) — ผูกอยู่ที่ rates[].stockLinks ไม่ใช่ productIds ด่านเดิมจึงมองไม่เห็น
//      → ตอนนี้: สแกน JSON ของสินค้าทั้งตารางหา id (เจอที่ไหนก็ไม่ลบ) + ข้ามตระกูลเรทราคา/กลุ่มตัวเลือก
//        + ต้องระบุรหัสที่จะลบเองด้วย --codes=A,B,C (กันรันแล้วกวาดของชุดใหม่ที่ไม่ได้ตั้งใจ)
//
//   node scripts/stock-dedupe-double-submit.mjs                          # ดูรายชื่อที่ "น่าจะ" ซ้ำ (ไม่ลบ)
//   node scripts/stock-dedupe-double-submit.mjs --codes=B-6000-3,M-0012  # ดูเฉพาะรหัสที่เลือก
//   node scripts/stock-dedupe-double-submit.mjs --codes=… --apply        # ลบจริง (soft delete กู้ได้)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const CODES = (process.argv.find((a) => a.startsWith("--codes=")) ?? "").slice(8).split(",").map((s) => s.trim()).filter(Boolean);
const SINCE = (process.argv.find((a) => a.startsWith("--since=")) ?? "").slice(8) || new Date(Date.now() - 24 * 3600e3).toISOString();

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const recent = (await db.collection("stockItems").get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.active !== false && (x.createdAt ?? "") >= SINCE);
const movedIds = new Set((await db.collection("stockMoves").where("at", ">=", SINCE).get()).docs.map((d) => d.data().itemId));
// 🔎 สินค้าที่อ้างถึง SKU ตัวไหนบ้าง — สแกนทั้งก้อน jsonb (ครอบ options[].choices.stockItemId/stockLinks · rates[].stockLinks · bomFor · ที่จะมีในอนาคต)
const { data: prods, error } = await sb.from("products").select("id,data");
if (error) { console.log("⛔ อ่านตารางสินค้าไม่ได้ —", error.message); process.exit(1); }
const linkedTo = (id) => (prods ?? []).filter((p) => JSON.stringify(p.data).includes(id)).map((p) => p.id);

const byName = new Map();
for (const x of recent) (byName.get(x.name.trim()) ?? byName.set(x.name.trim(), []).get(x.name.trim())).push(x);
const plan = [];
for (const [name, list] of byName) {
  if (list.length < 2) continue;
  const sorted = [...list].sort((a, b) => Number(!!b.manualOnly) - Number(!!a.manualOnly) || a.createdAt.localeCompare(b.createdAt));
  const keep = sorted[0];
  for (const x of sorted.slice(1)) {
    const links = linkedTo(x.id);
    const why =
      links.length ? `ผูกกับสินค้า ${links.join(",")}` // ← เคสที่เคยพลาด
      : x.family === "เรทราคา" || x.groupByOption ? "แยกตามเรท/ตัวเลือก — ชื่อซ้ำได้โดยตั้งใจ"
      : (x.balance ?? 0) !== 0 ? "มียอดคงเหลือ"
      : movedIds.has(x.id) ? "มีประวัติรับเข้า/เบิก"
      : (x.productIds?.length ?? 0) > 0 ? "ผูกสินค้าไว้"
      : CODES.length && !CODES.includes(x.code) ? "ไม่ได้อยู่ใน --codes"
      : "";
    plan.push({ name, keep, x, why });
  }
}
for (const p of plan) console.log(`${p.why ? "⛔" : "🗑"} ${(p.x.code ?? "").padEnd(16)} ${p.name.padEnd(34)} → เก็บ ${p.keep.code}${p.why ? `  ← ข้าม: ${p.why}` : ""}`);
const todo = plan.filter((p) => !p.why);
if (!plan.length) { console.log(`ไม่พบชื่อซ้ำในของที่สร้างตั้งแต่ ${SINCE}`); process.exit(0); }
if (!CODES.length) { console.log(`\n⚠️ ยังไม่ได้ระบุรหัส — ตรวจรายชื่อข้างบนก่อน แล้วรันด้วย --codes=<รหัส,คั่นด้วยจุลภาค> [--apply]`); process.exit(0); }
if (!APPLY) { console.log(`\n(ดูอย่างเดียว — จะลบ ${todo.length} ตัว · ใส่ --apply เพื่อลบจริง)`); process.exit(0); }
if (!todo.length) { console.log("\nไม่มีตัวที่ลบได้ตาม --codes ที่ให้มา"); process.exit(0); }

mkdirSync(".cache/stock-fix", { recursive: true });
const file = `.cache/stock-fix/dedupe-double-submit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`; // ชื่อไฟล์มีเวลา — รันหลายรอบไม่ทับสำรองเก่า
writeFileSync(file, JSON.stringify(todo.map((p) => p.x), null, 1));
const now = new Date().toISOString();
for (const p of todo) await db.collection("stockItems").doc(p.x.id).update({ active: false, deletedAt: now, deletedBy: "ระบบ (ลบรายการซ้ำจากกดบันทึกซ้ำ)", updatedAt: now });
console.log(`✅ ลบแบบ soft ${todo.length} ตัว (สำรองที่ ${file} · กู้ด้วย scripts/stock-restore-wrong-dedupe.mjs)`);
process.exit(0);
