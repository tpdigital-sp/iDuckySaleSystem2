// ครั้งเดียว (30 ก.ย. 69): กู้ "ฐาน Griptok · สีดำ / สีใส" (P-GRIPTOK-CLEAR-MIRROR-2/3) ที่ถูกลบตอน 09:28 กลับมา
//   เพื่อให้เลือกเป็น "วัสดุแฝงของตัวเลือก" ได้ (ช่องค้นในฟอร์มเห็นเฉพาะ SKU ที่ active)
//   + ถอด bomFor.griptok-mirror ที่ติดค้าง — ไม่งั้นพอกู้กลับ GRIPTOK MIRROR จะตัดฐานทุกสีทุกออเดอร์
// ใช้: node scripts/stock-restore-griptok-base.mjs
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const now = new Date().toISOString();
for (const code of ["P-GRIPTOK-CLEAR-MIRROR-2", "P-GRIPTOK-CLEAR-MIRROR-3"]) {
  const snap = await db.collection("stockItems").where("code", "==", code).get();
  const d = snap.docs[0];
  if (!d) { console.log("⛔ ไม่พบ", code); continue; }
  const x = d.data();
  await d.ref.update({ active: true, deletedAt: FieldValue.delete(), deletedBy: FieldValue.delete(), updatedAt: now });
  if (x.bomFor?.["griptok-mirror"]) await d.ref.update(new FieldPath("bomFor", "griptok-mirror"), FieldValue.delete());
  console.log("✅ กู้แล้ว", code, x.name, x.bomFor?.["griptok-mirror"] ? "(ถอดวัสดุแฝง griptok-mirror ออกด้วย)" : "");
}
process.exit(0);
