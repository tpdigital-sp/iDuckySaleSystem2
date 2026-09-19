// ครั้งเดียว: ตั้ง "ชนิดของ" (StockItem.part) ให้ SKU กรอบรูป/แผ่นจิ๊กซอว์ 2 สินค้าที่จัดไว้ 18 ก.ย. 69 · [--apply]
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const PART = {
  "P-PHOTOFRAME-8-4": "กรอบรูป", "P-PHOTOFRAME-8-1": "แผ่นจิ๊กซอว์", "P-PHOTOFRAME-8-2": "แผ่นจิ๊กซอว์",
  "P-UV-FRAME-1": "กรอบรูป", "P-UV-FRAME-2": "กรอบรูป", "P-UV-FRAME-3": "กรอบรูป", "P-UV-FRAME-4": "กรอบรูป",
  "PL-PHOTOFRAME-1BBFC4O": "แผ่นจิ๊กซอว์", "PL-PHOTOFRAME-0GJ3GSD": "แผ่นจิ๊กซอว์", "PL-PHOTOFRAME-0728U8D": "แผ่นจิ๊กซอว์", "PL-PHOTOFRAME-0XKSCS6": "แผ่นจิ๊กซอว์",
};
const docs = (await db.collection("stockItems").get()).docs.filter(d => d.data().active !== false && PART[d.data().code]);
for (const d of docs) console.log(`${d.data().code.padEnd(24)} ${d.data().name}  →  ${PART[d.data().code]}`);
if (docs.length !== Object.keys(PART).length) { console.log(`⛔ พบ ${docs.length}/${Object.keys(PART).length} — หยุด`); process.exit(1); }
if (!APPLY) { console.log("\n(ดูอย่างเดียว — ใส่ --apply)"); process.exit(0); }
const now = new Date().toISOString();
for (const d of docs) await d.ref.update({ part: PART[d.data().code], updatedAt: now });
console.log(`\n✅ ตั้งชนิดของแล้ว ${docs.length} ตัว`);
process.exit(0);
