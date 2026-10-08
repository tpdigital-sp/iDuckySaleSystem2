// กู้คืน SKU ที่ stock-dedupe-double-submit.mjs ลบผิด (2 ต.ค. 69) — ชื่อซ้ำกันจริงแต่เป็นคนละตัว เพราะแยกสต๊อก "ตามเรทราคา"
//   (ตะขอเงิน 1.5/2/2.5cm ของเรท "สายคล้องแมส คล้องโทรศัพท์ ตะขอเงิน 2 ฝั่ง" สินค้า cardholder — ผูกผ่าน rates[].stockLinks ไม่ใช่ productIds)
//   node scripts/stock-restore-wrong-dedupe.mjs [--apply]
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const FILE = ".cache/stock-fix/dedupe-double-submit-2026-10-02.json";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const backup = JSON.parse(readFileSync(FILE, "utf8"));
const now = new Date().toISOString();
let n = 0;
for (const b of backup) {
  const ref = db.collection("stockItems").doc(b.id);
  const cur = (await ref.get()).data();
  if (!cur) { console.log(`⛔ ${b.code} ไม่มีเอกสารนี้แล้ว`); continue; }
  if (cur.active !== false) { console.log(`✓ ${b.code.padEnd(18)} ${b.name} — ยังใช้งานอยู่ ไม่ต้องกู้`); continue; }
  console.log(`♻️ ${b.code.padEnd(18)} ${b.name.padEnd(18)} กู้คืน (ลบเมื่อ ${cur.deletedAt ?? "-"})`);
  if (APPLY) { await ref.update({ active: true, deletedAt: FieldValue.delete(), deletedBy: FieldValue.delete(), updatedAt: now }); n++; }
}
console.log(APPLY ? `✅ กู้คืน ${n} ตัว` : "\n(ดูอย่างเดียว — ใส่ --apply เพื่อกู้จริง)");
process.exit(0);
