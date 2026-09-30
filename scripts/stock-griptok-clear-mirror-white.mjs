// ครั้งเดียว (30 ก.ย. 69): กริ๊บต๊อกกระจกอะคริลิคใส — ทำ "สีขาว" ให้เหมือนสีดำ/สีใสที่เจ้าของร้านแยกไว้เอง
//   1. สร้าง SKU "กริ๊บต๊อกกระจกอะคริลิคใส · สีขาว" (P-GRIPTOK-CLEAR-MIRROR-6) ผูกกับตัวเลือก ฐาน Griptok = สีขาว
//      (เดิมสีขาวผูกตรงกับฐานกลางที่ 3 สินค้าใช้ร่วม เลยไปโผล่กลุ่ม "ใช้ร่วมหลายสินค้า" → เจ้าของร้านเห็นว่า "ฐานสีขาวหาย")
//   (ไม่แตะฐานกลาง — เจ้าของร้านลบ "ฐาน Griptok · สีดำ" เอง 2 รอบ 30 ก.ย. 69 ถือว่าตั้งใจ · วัสดุแฝงของตัวเลือกให้ตั้งจากลิ้นชักเอง)
// ใช้: node scripts/stock-griptok-clear-mirror-white.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const PID = "griptok-clear-mirror", GROUP = "ฐาน Griptok";
const WHITE_BASE = "P-GRIPTOK-CLEAR-MIRROR-1"; // ฐานกลางสีขาวที่ตัวเลือกสีขาวผูกอยู่เดิม (ยังใช้กับ 1-4 / griptok-emboss ต่อ)
const NEW_CODE = "P-GRIPTOK-CLEAR-MIRROR-6";

const all = (await db.collection("stockItems").get()).docs.map(d=>({ id: d.id, ...d.data() }));
const byCode = Object.fromEntries(all.filter(i=>i.active!==false).map(i=>[i.code, i]));
if (!byCode[WHITE_BASE]) { console.log("⛔ ไม่พบฐานกลางสีขาว", WHITE_BASE); process.exit(1); }
if (all.some(i=>i.code===NEW_CODE)) { console.log("⛔ มี", NEW_CODE, "อยู่แล้ว — หยุด"); process.exit(1); }

const { data: row } = await sb.from("products").select("id,data").eq("id", PID).single();
const opts = row.data.options ?? [];
const oi = opts.findIndex(o=>o.label===GROUP && !o.presetId);
if (oi < 0) { console.log("⛔ ไม่พบกลุ่ม", GROUP); process.exit(1); }
const white = opts[oi].choices.find(c=>c.name==="สีขาว");
if (!white || white.stockItemId !== byCode[WHITE_BASE].id) { console.log("⛔ สีขาวไม่ได้ผูกกับฐานกลางอย่างที่คิด:", white?.stockItemId, "— หยุด"); process.exit(1); }

// 1) SKU ใหม่สำหรับสีขาว (โครงเดียวกับ -4/-5 ที่หน้าจอสร้าง)
const now = new Date().toISOString();
const newId = `sku-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const tmpl = byCode["P-GRIPTOK-CLEAR-MIRROR-4"] ?? {};
await db.collection("stockItems").doc(newId).set({
  id: newId, code: NEW_CODE, name: "กริ๊บต๊อกกระจกอะคริลิคใส · สีขาว", aliases: ["สีขาว"],
  unit: tmpl.unit ?? "ชิ้น", ...(tmpl.family ? { family: tmpl.family } : {}), ...(tmpl.category ? { category: tmpl.category } : {}),
  productIds: [], imageUrl: white.imageSrc ?? byCode[WHITE_BASE].imageUrl, balance: 0, active: true, createdAt: now, updatedAt: now,
});
console.log("✅ สร้าง", NEW_CODE, newId);

// 2) ผูกตัวเลือกสีขาวกับ SKU ใหม่ (เปลี่ยน SKU = อัตราเดิมไม่ตามไป กติกาเดียวกับ route link)
const nextOptions = opts.map((o,i) => i!==oi ? o : { ...o, choices: o.choices.map(c => {
  if (c.name !== "สีขาว") return c;
  const { stockQtyPer, ...cc } = c;
  return { ...cc, stockItemId: newId };
}) });
await sb.from("product_revisions").insert({ product_id: PID, data: row.data, action: "save", editor: "claude", editor_name: "Claude (แยก SKU สีขาวของกริ๊บต๊อกกระจกอะคริลิคใส 30 ก.ย. 69)" }).then(r=>r.error && console.log("(ข้ามประวัติ:", r.error.message, ")"));
const { error } = await sb.from("products").update({ data: { ...row.data, options: nextOptions } }).eq("id", PID);
if (error) { console.log("⛔ เขียนสินค้าไม่สำเร็จ:", error.message); await db.collection("stockItems").doc(newId).delete(); process.exit(1); }
for (const c of nextOptions[oi].choices) console.log("  ", c.name, "→", all.concat([{id:newId, code:NEW_CODE}]).find(i=>i.id===c.stockItemId)?.code);
console.log("✅ เสร็จ");
process.exit(0);
