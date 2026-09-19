// เติมรหัสให้ SKU ที่ยังไม่มีรหัส — กติกาเดียวกับ saveStockItem (วัสดุแฝงสินค้าเดียว → P-<สินค้า>-B1 · อื่น ๆ → M-0001) · [--apply]
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const docs = (await db.collection("stockItems").get()).docs;
const codes = new Set(docs.map(d => String(d.data().code ?? "")));
const slug = s => s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase().slice(0, 24);
const next = prefix => {
  const numbered = prefix === "M";
  const re = numbered ? /^M-(\d+)$/ : new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
  let n = 0; for (const c of codes) { const m = re.exec(c); if (m) n = Math.max(n, +m[1]); }
  let c; do c = numbered ? `M-${String(++n).padStart(4, "0")}` : `${prefix}${++n}`; while (codes.has(c));
  codes.add(c); return c;
};
const todo = docs.filter(d => d.data().active !== false && !d.data().code);
const plan = todo.map(d => { const i = d.data(); const bom = Object.keys(i.bomFor ?? {}); return { d, name: i.name, code: bom.length === 1 ? next(`P-${slug(bom[0])}-B`) : (i.productIds ?? []).length === 1 ? next(`P-${slug(i.productIds[0])}-`) : next("M") }; });
for (const p of plan) console.log(`${p.name}  →  ${p.code}`);
if (!APPLY) { console.log("\n(ดูอย่างเดียว — ใส่ --apply)"); process.exit(0); }
const now = new Date().toISOString();
for (const p of plan) await p.d.ref.update({ code: p.code, updatedAt: now });
console.log(`\n✅ เติมรหัสแล้ว ${plan.length} ตัว`);
process.exit(0);
