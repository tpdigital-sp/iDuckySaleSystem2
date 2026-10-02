// แยกฟิล์มเคลือบพิเศษ (กลิตเตอร์/ทราย/hologram-* 10 SKU) ออกจากกลุ่มสินค้า "งานพิมพ์กระดาษอาร์ตมัน & แผ่นพลาสติก PET" ใน /admin/stock
//   → ติดธง groupByOption (หัวกลุ่ม = ชื่อกลุ่มตัวเลือก "เคลือบ" · ใช้ร่วมได้หลายสินค้า) + ตั้งชื่อแสดงกลุ่ม o:เคลือบ = "ฟิล์มเคลือบพิเศษ"
//   เจ้าของร้านขอ 2 ต.ค. 69 "แยกอันนี้ออกจาก งานพิมพ์กระดาษอาร์ตมัน & แผ่นพลาสติก PET" · ยังผูก/ตัดตามตัวเลือกเหมือนเดิม
//   node scripts/stock-coating-group-by-option.mjs [--apply]
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const docs = (await db.collection("stockItems").get()).docs.filter((d) => d.data().active !== false && /\/stock\/coating\/[a-z]+-v\d+\.jpg/.test(d.data().imageUrl ?? ""));
for (const d of docs) { const x = d.data(); console.log(`  ${x.code.padEnd(20)} ${x.name.padEnd(22)} groupByOption: ${x.groupByOption ? "✓" : "–"} → ✓`); }
const TITLE_KEY = "o:เคลือบ", TITLE = "ฟิล์มเคลือบพิเศษ";
console.log(`  หัวกลุ่ม ${TITLE_KEY} → ตั้งชื่อแสดง "${TITLE}"`);
if (!APPLY) { console.log(`\n(ดูอย่างเดียว ${docs.length} SKU — ใส่ --apply เพื่อเขียนจริง)`); process.exit(0); }
const now = new Date().toISOString();
for (const d of docs) await db.collection("stockItems").doc(d.id).update({ groupByOption: true, updatedAt: now });
const ref = db.collection("stockMeta").doc("groupTitles");
await db.runTransaction(async (tx) => {
  const cur = (await tx.get(ref)).data()?.keys ?? {};
  if (!cur[TITLE_KEY]) cur[TITLE_KEY] = { name: TITLE, at: now, by: "ระบบ (แยกฟิล์มเคลือบ)" };
  tx.set(ref, { keys: cur, updatedAt: now });
});
console.log(`✅ ติดธง groupByOption ${docs.length} SKU + ตั้งชื่อกลุ่มแล้ว`);
process.exit(0);
