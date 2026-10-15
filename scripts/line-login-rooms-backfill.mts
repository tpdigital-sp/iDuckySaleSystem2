/**
 * 🧩 เติมห้องแชทให้ลูกค้าที่ "ล็อกอิน LINE บนเว็บ" แต่คลังแชท (Firestore ordersure/line-conversations) ไม่มีห้อง
 *
 * ทำไม (OD-261014-9696 · 15 ต.ค. 69): ลูกค้า "PooM" ทัก OA + ล็อกอิน LINE สั่งของ แต่ n8n ไม่ได้สร้างห้องให้
 * → หน้า /admin/chatbot/chats และช่องผูก LINE หน้าออเดอร์มองไม่เห็นคนนี้ · ตั้งแต่นี้ไปล็อกอินใหม่/ส่งการ์ดถึง = สร้างห้องให้เอง (ensureChatRoom)
 * สคริปต์นี้ไล่ย้อนหลังบัญชีที่มีอยู่แล้ว · lastSeen = เวลาล็อกอินล่าสุด (จะได้เรียงตามที่เขาแวะมาจริง ไม่เด้งขึ้นบนสุดทั้งแถบ)
 *
 *   npm run sync:line-login-rooms            → ดูเฉย ๆ ว่าจะสร้างกี่ห้อง
 *   npm run sync:line-login-rooms -- --apply → สร้างจริง
 */
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;
const apply = process.argv.includes("--apply");

const json = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64!, "base64").toString("utf8"));
const app = getApps()[0] ?? initializeApp({ credential: cert(json) });
const db = getFirestore(app, env.FIREBASE_CHAT_DATABASE_ID || "ordersure");
const COL = env.LINE_CHAT_COLLECTION || "line-conversations";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

type Acc = { userId: string; name: string; picture: string; at: Date };
const accounts: Acc[] = [];
for (let page = 1; page <= 20; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  for (const u of data.users) {
    const m = u.user_metadata as { line_user_id?: string; full_name?: string; name?: string; picture?: string } | undefined;
    if (!m?.line_user_id || !/^U[0-9a-f]{32}$/i.test(m.line_user_id)) continue;
    accounts.push({ userId: m.line_user_id, name: (m.full_name || m.name || "").trim(), picture: m.picture || "", at: new Date(u.last_sign_in_at ?? u.created_at) });
  }
  if (data.users.length < 1000) break;
}
console.log(`บัญชีที่ล็อกอินด้วย LINE: ${accounts.length}`);

const refs = accounts.map((a) => db.collection(COL).doc(a.userId));
const docs = refs.length ? await db.getAll(...refs, { fieldMask: ["displayName"] }) : [];
const missing = accounts.filter((_, i) => !docs[i].exists);
console.log(`ไม่มีห้องในคลังแชท: ${missing.length}`);
for (const a of missing) console.log(`  ${apply ? "➕" : "·"} ${a.name || "(ไม่มีชื่อ)"} · ${a.userId.slice(0, 10)}… · ล็อกอินล่าสุด ${a.at.toISOString().slice(0, 16)}`);

if (!apply) {
  console.log("\n(ดูเฉย ๆ — ใส่ --apply เพื่อสร้างห้องจริง)");
  process.exit(0);
}
let made = 0;
for (const a of missing) {
  await db.collection(COL).doc(a.userId).set(
    {
      userId: a.userId,
      displayName: a.name || "(ไม่มีชื่อ)",
      pictureUrl: a.picture,
      nameLower: a.name.toLowerCase(),
      lastSeen: a.at,
      createdBy: "iducky-web",
      createdReason: "backfill",
    },
    { merge: true }
  );
  made++;
}
console.log(`สร้างห้องแล้ว ${made} ห้อง`);
