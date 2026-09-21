import { readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const DIR = process.argv[2], APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
// ตัดเฉพาะตัวกระจกให้เข้าชุดกับสีอื่น
await sharp(`${DIR}/color-pink-v1.jpg`).extract({ left: 104, top: 200, width: 693, height: 520 }).jpeg({ quality: 88 }).toFile(`${DIR}/out-heart-pink.jpg`);
await sharp(`${DIR}/color-blue-v1.jpg`).extract({ left: 250, top: 180, width: 400, height: 490 }).jpeg({ quality: 88 }).toFile(`${DIR}/out-square-blue.jpg`);
const SH = { "ทรงสี่เหลี่ยม 9x16 ซม.": "square", "ทรงหัวใจ 13x18.5 ซม.": "heart" };
const CO = { "สีดำ": "black", "สีขาว": "white", "สีฟ้า": "blue", "สีดำประกายมุก": "black-pearl", "สีขาวประกายมุก": "white-pearl", "สีชมพู": "pink" };
const docs = (await db.collection("stockItems").get()).docs.filter(d => /^P-MIRROR-HAND-(1[2-9]|2[0-3])$/.test(d.data().code || "") && d.data().active !== false);
const ver = Date.now().toString(36);
for (const d of docs) {
  const [, shape, color] = d.data().name.split(" · ");
  const f = `out-${SH[shape]}-${CO[color]}.jpg`;
  let buf; try { buf = readFileSync(`${DIR}/${f}`); } catch { console.log(`ข้าม  ${d.data().code} ${shape} ${color} — คู่นี้ไม่มีขายจริง`); continue; }
  const path = `products/stock/mirror-hand/${SH[shape]}-${CO[color]}.jpg`;
  console.log(`${APPLY ? "ตั้ง " : "จะตั้ง"} ${d.data().code} ${shape} ${color} ← ${path}`);
  if (!APPLY) continue;
  const up = await sb.storage.from("product-images").upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) { console.log("  ⛔", up.error.message); continue; }
  const url = `${sb.storage.from("product-images").getPublicUrl(path).data.publicUrl}?v=${ver}`;
  await d.ref.update({ imageUrl: url, updatedAt: new Date().toISOString() });
}
process.exit(0);
