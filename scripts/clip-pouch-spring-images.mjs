// 🧷 รูปคลิปหนีบกระเป๋าต๊อบแต๊บ (จากหน้าผู้ขาย 1688 offer 782705025677) → SKU คลัง PL-WALLET
// คู่ "ขนาดกระเป๋า → ความยาวคลิป" ยึดตามชื่อที่เจ้าของร้านตั้งเองในหน้าคลัง 21 ก.ย. 69
//   9.5x9cm → 10cm · 11.5x10cm → 12cm · 14.5x10cm → 15cm · 17.5x14.5cm → 18cm
// ผู้ขายมีรูปเดี่ยวแค่ 8 / 8.5 / 9 / 10 / 11 / 12 ซม. — 15 กับ 18 ใช้รูปรวมทุกความยาวแทน
// รัน: node scripts/clip-pouch-spring-images.mjs            (ดูอย่างเดียว)
//      node scripts/clip-pouch-spring-images.mjs --apply    (อัปรูปจริง)
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});

const CDN = "https://cbu01.alicdn.com/img/ibank/";
const LINEUP = "O1CN01PVP8pr1DpsIiDR5mh_!!2217706810266-0-cib.jpg"; // รูปรวม 6 ความยาว ไม่มีตัวหนังสือจีน
const PHOTO = { // ความยาวคลิป (ซม.) → รูปเดี่ยวของผู้ขาย
  "10": "O1CN01MTc9XU1DpsIerjc2k_!!2217706810266-0-cib.jpg",
  "12": "O1CN01PNJTC11DpsIdCameH_!!2217706810266-0-cib.jpg",
};
const MAP = [ // SKU → ขนาดกระเป๋าที่ใช้ยืนยัน + ความยาวคลิป
  { code: "PL-WALLET-0SLZJC8", pouch: "9.5x9cm",     clip: "10" },
  { code: "PL-WALLET-1JZIRNB", pouch: "11.5x10cm",   clip: "12" },
  { code: "PL-WALLET-00E62VO", pouch: "14.5x10cm",   clip: "15" },
  { code: "PL-WALLET-0DCYY2K", pouch: "17.5x14.5cm", clip: "18" },
];

const docs = new Map((await db.collection("stockItems").get()).docs.map(d => [d.data().code, d]));
const ver = Date.now().toString(36);

for (const m of MAP) {
  const doc = docs.get(m.code);
  if (!doc) { console.log(`⛔ ไม่เจอ SKU ${m.code}`); continue; }
  // กันจับคู่ผิดใบ: ขนาดกระเป๋าต้องยังอยู่ในชื่อหรือชื่อพ้อง
  const names = [doc.data().name || "", ...(doc.data().aliases || [])];
  if (!names.some(n => n.includes(m.pouch))) { console.log(`⛔ ${m.code} ไม่มี "${m.pouch}" ในชื่อ/ชื่อพ้องแล้ว (ตอนนี้ "${doc.data().name}") — ข้ามไว้ก่อน`); continue; }

  const src = PHOTO[m.clip];
  const file = src ? `spring-${m.clip}cm.jpg` : "spring-lineup.jpg";
  console.log(`${APPLY ? "ตั้ง " : "จะตั้ง"} ${m.code}  ${doc.data().name}  ← คลิป ${m.clip} ซม.${src ? "" : " (ไม่มีรูปเดี่ยว ใช้รูปรวม)"}`);
  if (!APPLY) continue;

  const res = await fetch(CDN + (src || LINEUP), { headers: { referer: "https://detail.1688.com/", "user-agent": "Mozilla/5.0" } });
  if (!res.ok) { console.log(`  ⛔ โหลดรูปไม่ได้ (${res.status})`); continue; }
  const buf = await sharp(Buffer.from(await res.arrayBuffer())).resize(900, 900, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();

  const path = `products/stock/clip-pouch/${file}`;
  const up = await sb.storage.from("product-images").upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) { console.log("  ⛔", up.error.message); continue; }
  const url = `${sb.storage.from("product-images").getPublicUrl(path).data.publicUrl}?v=${ver}`;
  await doc.ref.update({ imageUrl: url, updatedAt: new Date().toISOString() });
  console.log(`  ✅ ${url}`);
}
process.exit(0);
