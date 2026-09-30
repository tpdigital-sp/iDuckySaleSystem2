// ครั้งเดียว (30 ก.ย. 69): เจ้าของร้านยืนยัน "สีดำ 35x40cm มีกระเป๋าใบน้อย" ไม่มีของ
//   → ถอดลิงก์ P-FLEX-PRINT-30 ออกจากตัวเลือกขนาดของ กระเป๋าผ้าแคนวาส (flex-print) แล้วปลด SKU (ยอด 0 ไม่มีประวัติ)
// ใช้: node scripts/flex-print-drop-black-pocket.mjs [--apply]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const die = (m) => { console.log("⛔", m); process.exit(1); };
const ID = "flex-print", CODE = "P-FLEX-PRINT-30";
const s = await db.collection("stockItems").where("code","==",CODE).get(); if (s.empty) die("ไม่พบ " + CODE);
const sku = { id: s.docs[0].id, ...s.docs[0].data() };
const moves = await db.collection("stockMoves").where("itemId","==",sku.id).limit(1).get();
if ((sku.balance ?? 0) !== 0 || !moves.empty) die(`${CODE} ยอด ${sku.balance} / มีประวัติ — ให้คนตัดสินใจ`);
const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single(); if (error) die(error.message);
const { data: all } = await sb.from("products").select("id,data");
for (const p of all) if (p.id !== ID && JSON.stringify(p.data).includes(sku.id)) die(`สินค้า ${p.id} ยังอ้าง ${CODE}`);
let hits = 0;
const options = row.data.options.map(o => ({ ...o, choices: (o.choices ?? []).map(c => {
  if (!c.stockLinks?.some(l => l.stockItemId === sku.id)) return c;
  const rest = c.stockLinks.filter(l => l.stockItemId !== sku.id); hits += c.stockLinks.length - rest.length;
  console.log(`   ถอดจาก "${c.name}" (เหลือ ${rest.length} ลิงก์)`);
  const { stockLinks, ...r } = c; return rest.length ? { ...r, stockLinks: rest } : r;
}) }));
console.log(`🔗 ${ID}: ถอด ${CODE} "${sku.name}" ${hits} จุด${sku.active === false ? " (SKU ถูกปลดไปแล้ว)" : ""}`);
if (!APPLY) { console.log("(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }
mkdirSync(".cache/stock-fix", { recursive: true });
const bak = `.cache/stock-fix/flex-print-drop-black-pocket.before-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
writeFileSync(bak, JSON.stringify({ product: row, sku }, null, 2)); console.log("💾", bak);
const now = new Date().toISOString();
if (hits) {
  const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...row.data, options, savedAt: now } }).eq("id", ID).select("id");
  if (e2 || !upd?.length) die("เขียนไม่สำเร็จ: " + (e2?.message ?? "0 แถว"));
  const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
  if (back.data.savedAt !== now || JSON.stringify(back.data).includes(sku.id)) die("อ่านกลับยังมีลิงก์ — รันซ้ำ");
  console.log("✅ สินค้าเขียนแล้ว (อ่านกลับตรง)");
}
if (sku.active !== false) { await db.collection("stockItems").doc(sku.id).update({ productIds: [], active: false, deletedAt: now, deletedBy: "Claude (เจ้าของร้านยืนยันไม่มีสีดำแบบมีกระเป๋าใบน้อย 30 ก.ย. 69)", updatedAt: now }); console.log(`✅ ปลด ${CODE}`); }
console.log("✅ เสร็จ"); process.exit(0);
