// ลบ SKU ที่สร้างซ้ำจากการกด "บันทึก" ซ้ำระหว่างรอ (2 ต.ค. 69 14:43–14:52) — ชื่อเดียวกันหลายตัว + รหัสชนกัน (B-6000-3 ×2, M-0012 ×2 …)
//   เก็บไว้ชื่อละ 1 ตัว: เลือกตัวที่ "เบิกเองอย่างเดียว" (ตามฟอร์มสุดท้ายที่ผู้ใช้ตั้ง) แล้วตัวที่สร้างก่อน · ลบแบบ soft (active=false กู้ได้จากถังขยะ)
//   ลบเฉพาะตัวที่ ยอด 0 · ไม่มีประวัติเคลื่อนไหว · ไม่ผูกสินค้า
//   node scripts/stock-dedupe-double-submit.mjs [--apply]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const SINCE = "2026-10-02T07:40:00.000Z";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const recent = (await db.collection("stockItems").get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.active !== false && (x.createdAt ?? "") >= SINCE);
const movedIds = new Set((await db.collection("stockMoves").where("at", ">=", SINCE).get()).docs.map((d) => d.data().itemId));
const byName = new Map();
for (const x of recent) (byName.get(x.name.trim()) ?? byName.set(x.name.trim(), []).get(x.name.trim())).push(x);
const plan = [];
for (const [name, list] of byName) {
  if (list.length < 2) continue;
  const sorted = [...list].sort((a, b) => Number(!!b.manualOnly) - Number(!!a.manualOnly) || a.createdAt.localeCompare(b.createdAt));
  const keep = sorted[0];
  for (const x of sorted.slice(1)) {
    const safe = (x.balance ?? 0) === 0 && !movedIds.has(x.id) && !(x.productIds?.length);
    plan.push({ name, keep, x, safe });
  }
}
for (const p of plan) console.log(`${p.safe ? "🗑" : "⛔"} ${p.x.code.padEnd(10)} ${p.name.padEnd(36)} → เก็บ ${p.keep.code}${p.keep.manualOnly ? " (เบิกเอง)" : ""}${p.safe ? "" : "  ← ข้าม: มียอด/ประวัติ/ผูกสินค้า"}`);
const todo = plan.filter((p) => p.safe);
if (!APPLY) { console.log(`\n(ดูอย่างเดียว — จะลบ ${todo.length} ตัว เก็บ ${byName.size} ชื่อ · ใส่ --apply เพื่อลบจริง)`); process.exit(0); }
mkdirSync(".cache/stock-fix", { recursive: true });
writeFileSync(`.cache/stock-fix/dedupe-double-submit-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(todo.map((p) => p.x), null, 1));
const now = new Date().toISOString();
for (const p of todo) await db.collection("stockItems").doc(p.x.id).update({ active: false, deletedAt: now, deletedBy: "ระบบ (ลบรายการซ้ำจากกดบันทึกซ้ำ)", updatedAt: now });
console.log(`✅ ลบแบบ soft ${todo.length} ตัว (สำรองที่ .cache/stock-fix/)`);
process.exit(0);
