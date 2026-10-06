// 🔐 บันทึกรหัส FlowAccount Open API จาก .env.local → Firestore settings/flowaccount-api (ฐาน ordersure)
// เว็บจริงอ่านรหัสจากที่นี่ เพราะ env บน Netlify เต็มเพดาน Lambda 4KB แล้ว (ดู src/lib/server/flowaccount-api.ts)
// ใช้เมื่อได้รหัสใหม่จาก FlowAccount: แก้ FLOWACCOUNT_CLIENT_ID / FLOWACCOUNT_CLIENT_SECRET ใน .env.local แล้วรัน
//   node scripts/flowaccount-creds-save.mjs
// ไม่พิมพ์รหัสออกจอ · เว็บจริงเห็นรหัสใหม่ภายใน 5 นาที (แคช)
import fs from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "").trim()])
);
const clientId = env.FLOWACCOUNT_CLIENT_ID;
const clientSecret = env.FLOWACCOUNT_CLIENT_SECRET;
const base = env.FLOWACCOUNT_API_BASE || "https://openapi.flowaccount.com/v1";
if (!clientId || !clientSecret) throw new Error("ไม่พบ FLOWACCOUNT_CLIENT_ID / FLOWACCOUNT_CLIENT_SECRET ใน .env.local");
if (!base.endsWith("/v1")) throw new Error(`FLOWACCOUNT_API_BASE ไม่ใช่ production (${base}) — ไม่บันทึกรหัส sandbox ขึ้นเว็บจริง`);

// ทดสอบรหัสก่อนบันทึก — รหัสผิดจะได้ไม่ไปทับรหัสที่ใช้ได้
const r = await fetch(`${base}/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "client_credentials", scope: "flowaccount-api", client_id: clientId, client_secret: clientSecret }),
});
if (!r.ok) throw new Error(`รหัสใช้ไม่ได้ — FlowAccount ตอบ ${r.status} (ยังไม่ได้บันทึก)`);

const sa = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"));
const db = getFirestore(initializeApp({ credential: cert(sa) }), env.FIREBASE_CHAT_DATABASE_ID || "ordersure");
await db.collection("settings").doc("flowaccount-api").set({ clientId, clientSecret, base, savedAt: new Date().toISOString(), savedBy: "scripts/flowaccount-creds-save.mjs" });
console.log(`✓ บันทึกรหัส FlowAccount (${clientId}) ลง Firestore settings/flowaccount-api แล้ว — ทดสอบ token ผ่าน`);
