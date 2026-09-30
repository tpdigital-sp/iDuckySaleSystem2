// ภาพ SKU ถุงผ้าแคนวาส (ใช้ร่วม กระเป๋าผ้าแคนวาส + งานปัก) ให้ตรงสีถุง — เดิมทุกตัวเป็นรูปไดอะแกรมขนาดถุงสีผ้าดิบ อ่านสีไม่ออก (เจ้าของร้านทัก 30 ก.ย. 69)
//   ครอปตัวถุงจากภาพตัวเลือกสีของ flex-print (bag-black/natural/white-v1.jpg) → products/stock/canvas-bag/bag-<สี>.jpg → imageUrl ตามสีท้าย/กลางชื่อ SKU
//   node scripts/stock-canvas-bag-images.mjs <dir มี bag-black.jpg bag-natural.jpg bag-white.jpg>          # ดูอย่างเดียว
//   node scripts/stock-canvas-bag-images.mjs <dir> --apply                                                  # อัป Storage + เขียน imageUrl
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const DIR = process.argv[2], APPLY = process.argv.includes("--apply");
if (!DIR) { console.log("ใช้: node scripts/stock-canvas-bag-images.mjs <dir> [--apply]"); process.exit(1); }
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const CO = { "สีดำ": "black", "สีผ้าดิบ": "natural", "สีขาว": "white" };
const docs = (await db.collection("stockItems").get()).docs.filter(d => d.data().family === "กระเป๋าผ้าแคนวาส" && d.data().active !== false);
const ver = Date.now().toString(36), urls = {};
for (const [color, key] of Object.entries(CO)) {
  const path = `products/stock/canvas-bag/bag-${key}.jpg`; // ชื่อไฟล์ใหม่ + ?v= กันแคช next/image
  const buf = readFileSync(`${DIR}/bag-${key}.jpg`);
  if (APPLY) { const up = await sb.storage.from("product-images").upload(path, buf, { contentType: "image/jpeg", upsert: true }); if (up.error) { console.log("⛔ อัปไม่ได้", path, up.error.message); process.exit(1); } }
  urls[color] = `${sb.storage.from("product-images").getPublicUrl(path).data.publicUrl}?v=${ver}`;
  console.log(`🖼 ${color} → ${path} (${(buf.length/1024).toFixed(0)} KB)`);
}
let n = 0;
for (const d of docs) {
  const { code, name, imageUrl } = d.data();
  const color = name.split(" · ")[1]; // "กระเป๋าผ้าแคนวาส · สี · ขนาด"
  const url = urls[color]; if (!url) { console.log(`⚠️ ${code} "${name}" อ่านสีไม่ออก — ข้าม`); continue; }
  console.log(`  ${code.padEnd(16)} ${color.padEnd(9)} ${(imageUrl ?? "").replace(/^.*\/products\//, "…/").slice(0, 50)} → …/stock/canvas-bag/bag-${CO[color]}.jpg`);
  if (APPLY) { await db.collection("stockItems").doc(d.id).update({ imageUrl: url, updatedAt: new Date().toISOString() }); n++; }
}
console.log(APPLY ? `✅ เขียน imageUrl ${n}/${docs.length} ตัว` : `\n(ดูอย่างเดียว ${docs.length} ตัว — ใส่ --apply เพื่อเขียนจริง)`);
process.exit(0);
