// ภาพ SKU เสื้อ YUEDPAO (ยืดเปล่า) ให้ตรงสีเสื้อ: ครอปคอเสื้อเปล่าจาก gallery-2 (ขาว) / gallery-4 (ดำ)
//   node scripts/stock-yuedpao-blank-images.mjs <dir มี blank-white.jpg blank-black.jpg>          # ดูอย่างเดียว
//   node scripts/stock-yuedpao-blank-images.mjs <dir> --apply                                    # อัป Storage + เขียน imageUrl
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const DIR = process.argv[2], APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const CO = { "สีขาว": "white", "สีดำ": "black" };
const docs = (await db.collection("stockItems").get()).docs.filter(d => /^P-YUEDPAO-BLANK-\d+$/.test(d.data().code || "") && d.data().active !== false);
const ver = Date.now().toString(36), urls = {};
for (const [color, key] of Object.entries(CO)) {
  const path = `products/stock/yuedpao-blank/blank-${key}.jpg`;   // ชื่อไฟล์ใหม่ กันแคช next/image
  if (APPLY) {
    const up = await sb.storage.from("product-images").upload(path, readFileSync(`${DIR}/blank-${key}.jpg`), { contentType: "image/jpeg", upsert: true });
    if (up.error) { console.log("⛔ อัปไม่ได้", path, up.error.message); process.exit(1); }
  }
  urls[color] = `${sb.storage.from("product-images").getPublicUrl(path).data.publicUrl}?v=${ver}`;
}
for (const d of docs) {
  const color = d.data().name.split(" · ").pop();
  const url = urls[color];
  if (!url) { console.log("ข้าม ", d.data().code, d.data().name); continue; }
  console.log(`${APPLY ? "ตั้ง " : "จะตั้ง"} ${d.data().code} ${d.data().name} ← blank-${CO[color]}.jpg`);
  if (APPLY) await d.ref.update({ imageUrl: url, updatedAt: new Date().toISOString() });
}
process.exit(0);
