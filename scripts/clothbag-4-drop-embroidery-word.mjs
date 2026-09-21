// 🏷 ตัดคำว่า "งานปัก" ออกจากชื่อ SKU คลังของกระเป๋าผ้าแคนวาส (P-CLOTHBAG-4-*) — เจ้าของร้านสั่ง 21 ก.ย. 69
//   "กระเป๋าผ้าแคนวาส งานปัก · สีดำ · 27x22x8cm" → "กระเป๋าผ้าแคนวาส · สีดำ · 27x22x8cm"
// ชื่อเดิมเก็บลง aliases ให้เอง (ท่าเดียวกับกดบันทึกในหน้าคลัง — คนยังพิมพ์ชื่อเก่าค้นต้องเจอ ดู aliasesOf ใน src/lib/server/stock.ts)
// รัน: node scripts/clothbag-4-drop-embroidery-word.mjs            (ดูอย่างเดียว)
//      node scripts/clothbag-4-drop-embroidery-word.mjs --apply
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");

const docs = (await db.collection("stockItems").get()).docs.filter(d => /^P-CLOTHBAG-4-\d+$/.test(d.data().code || ""));
console.log(`เจอ ${docs.length} SKU ในชุด P-CLOTHBAG-4-*\n`);

let n = 0;
for (const d of docs.sort((a, b) => Number(a.data().code.split("-").pop()) - Number(b.data().code.split("-").pop()))) {
  const cur = d.data();
  const old = (cur.name || "").trim();
  const next = old.replace(/แคนวาส\s*งานปัก/g, "แคนวาส").replace(/\s{2,}/g, " ").trim();
  if (next === old) { console.log(`ข้าม  ${cur.code}  ไม่มีคำว่า "งานปัก" ในชื่อแล้ว`); continue; }

  const aliases = cur.aliases ?? [];
  const nextAliases = aliases.some(a => a.trim() === old) ? aliases : [...aliases, old];
  console.log(`${APPLY ? "แก้  " : "จะแก้"} ${cur.code}${cur.active === false ? " (ปิดอยู่)" : ""}\n        เดิม: ${old}\n        ใหม่: ${next}`);
  n++;
  if (!APPLY) continue;
  await d.ref.update({ name: next, aliases: nextAliases, updatedAt: new Date().toISOString() });
}
console.log(`\n${APPLY ? "แก้แล้ว" : "จะแก้"} ${n} SKU · ชื่อเดิมเก็บไว้ใน aliases`);
process.exit(0);
