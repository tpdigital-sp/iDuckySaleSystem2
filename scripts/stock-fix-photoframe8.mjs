// ครั้งเดียว: จัด SKU ของ photoframe-8 ให้ 1 SKU = ของ 1 ชิ้นบนชั้น (เทียบเท่าปุ่ม แก้ไข/ลบ ในหน้า /admin/stock)
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const BACKUP = process.argv.find((a) => a.startsWith("--backup="))?.slice(9);
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});

const RENAME = {
  "P-PHOTOFRAME-8-4": "กรอบรูป A5 (งานซับลิเมชั่น)",
  "P-PHOTOFRAME-8-1": "แผ่นจิ๊กซอว์ A5 (งานซับลิเมชั่น)",
  "P-PHOTOFRAME-8-2": "แผ่นจิ๊กซอว์ 19.8×29 cm (งานซับลิเมชั่น)",
};
const DELETE = "P-PHOTOFRAME-8-3";

const snap = await db.collection("stockItems").get();
const skus = snap.docs.map(d=>d.data()).filter(i=>i.active!==false && (i.code||"").startsWith("P-PHOTOFRAME-8-"));
console.log("พบ:", skus.map(i=>`${i.code} | ${i.name} | ยอด ${i.balance}`).join("\n     "));
if (skus.length !== 4 || skus.some(i=>i.balance!==0)) { console.log("⛔ ไม่ตรงกับที่คาด (ต้องมี 4 ตัว ยอด 0) — หยุด"); process.exit(1); }
const moves = await db.collection("stockMoves").where("itemId","in",skus.map(i=>i.id)).limit(1).get();
if (!moves.empty) { console.log("⛔ มีประวัติเคลื่อนไหวแล้ว — หยุด ให้คนตัดสินใจ"); process.exit(1); }

const { data: row } = await sb.from("products").select("id,data").eq("id","photoframe-8").maybeSingle();
const del = skus.find(i=>i.code===DELETE);
const nextOptions = row.data.options.map(o=>({ ...o, choices:(o.choices??[]).map(c=> c.stockItemId===del.id ? Object.fromEntries(Object.entries(c).filter(([k])=>k!=="stockItemId"&&k!=="stockQtyPer")) : c) }));
console.log("\nหลังแก้ ตัวเลือกจะผูก:");
const nameOf = Object.fromEntries(skus.map(i=>[i.id, RENAME[i.code] ?? i.name]));
for (const o of nextOptions) for (const c of o.choices??[]) console.log(`  ${o.label} = ${c.name}  →  ${c.stockItemId ? nameOf[c.stockItemId] : "(ไม่ตัดอะไรเพิ่ม)"}`);
if (!APPLY) { console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

if (BACKUP) writeFileSync(BACKUP, JSON.stringify({ product: row, skus }, null, 2));
const now = new Date().toISOString();
for (const i of skus) {
  if (RENAME[i.code]) {
    const aliases = [...new Set([...(i.aliases??[]), i.name])];
    await db.collection("stockItems").doc(i.id).update({ name: RENAME[i.code], aliases, updatedAt: now });
  }
}
await db.collection("stockItems").doc(del.id).update({ active:false, deletedAt: now, deletedBy: "Claude (จัด SKU photoframe-8 ตามที่เจ้าของร้านขอ)", updatedAt: now });
await sb.from("product_revisions").insert({ product_id: row.id, data: row.data, action: "save", editor: "claude", editor_name: "Claude (จัด SKU photoframe-8)" }).then(r=>r.error && console.log("(ข้ามประวัติ:", r.error.message, ")"));
const { error } = await sb.from("products").update({ data: { ...row.data, options: nextOptions } }).eq("id", row.id);
console.log(error ? "⛔ เขียนสินค้าไม่สำเร็จ: "+error.message : "\n✅ เขียนแล้ว");
process.exit(0);
