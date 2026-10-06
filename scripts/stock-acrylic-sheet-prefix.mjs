// เติมคำว่า "แผ่น" หน้าชื่อ SKU อะคริลิค P-ACRYLICMAGNET-1-* ใน /admin/stock (เจ้าของร้านขอ 6 ต.ค. 69)
//   "อะคริลิคใส 3 mm" → "แผ่นอะคริลิคใส 3 mm" · ชื่อเดิมเก็บลง aliases[] · รันซ้ำได้ (ข้ามตัวที่ขึ้นต้นด้วยแผ่นแล้ว)
//   node scripts/stock-acrylic-sheet-prefix.mjs [--apply]
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const docs = (await db.collection("stockItems").get()).docs.filter((d) => { const x = d.data(); return x.active !== false && /^P-ACRYLICMAGNET-1-\d+$/.test(x.code ?? "") && /^อะคริลิค/.test(x.name ?? ""); });
for (const d of docs) { const x = d.data(); console.log(`  ${x.code.padEnd(22)} ${x.name} → แผ่น${x.name}`); }
if (!APPLY) { console.log(`\n(ดูอย่างเดียว ${docs.length} SKU — ใส่ --apply เพื่อเขียนจริง)`); process.exit(0); }
const now = new Date().toISOString();
for (const d of docs) { const x = d.data(); const aliases = [...new Set([...(x.aliases ?? []), x.name])]; await db.collection("stockItems").doc(d.id).update({ name: `แผ่น${x.name}`, aliases, updatedAt: now }); }
console.log(`✅ เปลี่ยนชื่อ ${docs.length} SKU แล้ว`);
process.exit(0);
