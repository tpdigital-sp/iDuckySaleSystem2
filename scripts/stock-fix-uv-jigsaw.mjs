// ครั้งเดียว: สินค้า uv (กรอบรูป+จิ๊กซอว์ งาน UV) → แผ่นจิ๊กซอว์ 4 ขนาด (ตัดเสมอ) + กรอบรูป 4 ขนาด (ตัดเมื่อเลือกแบบมีกรอบ)
// เขียนข้อมูลรูปแบบเดียวกับปุ่ม "แยกตามตัวเลือก" (choice.stockItemId + choice.stockLinks) · node scripts/stock-fix-uv-jigsaw.mjs [--apply]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});

const PRODUCT = "uv", SIZE = "ขนาด", KIND = "ตัวเลือก", WITH_FRAME = "กรอบรูป + แผ่นจิ๊กซอว์";
const SHEET_CODES = { "ขนาด 15*20cm": "PL-PHOTOFRAME-1BBFC4O", "ขนาด 29.7*21cm": "PL-PHOTOFRAME-0GJ3GSD", "ขนาด 38*26cm": "PL-PHOTOFRAME-0728U8D", "ขนาด 52*38cm": "PL-PHOTOFRAME-0XKSCS6" };

const { data: row } = await sb.from("products").select("id,data").eq("id", PRODUCT).maybeSingle();
const p = row.data, pname = p.name.replace(/\s+/g, " ").trim();
const oi = p.options.findIndex(o => o.label === SIZE && !o.presetId);
const kind = p.options.find(o => o.label === KIND);
if (oi < 0 || !kind?.choices.some(c => c.name === WITH_FRAME)) { console.log("⛔ โครงตัวเลือกไม่ตรงที่คาด"); process.exit(1); }
const all = (await db.collection("stockItems").get()).docs.map(d => d.data()).filter(i => i.active !== false);
const byCode = Object.fromEntries(all.map(i => [i.code, i]));
const used = new Set(all.map(i => i.code).filter(Boolean));
const now = new Date().toISOString();
const plan = [];
let n = 0;
for (const c of p.options[oi].choices) {
  const sheet = byCode[SHEET_CODES[c.name]];
  if (!sheet) { console.log("⛔ ไม่พบ SKU แผ่นของ", c.name); process.exit(1); }
  if (sheet.balance !== 0 || (sheet.productIds ?? []).length || c.stockItemId || c.stockLinks?.length) { console.log("⛔ สถานะไม่ตรงที่คาด:", c.name, sheet.balance, c.stockItemId); process.exit(1); }
  let code; do code = `P-UV-FRAME-${++n}`; while (used.has(code));
  plan.push({ c, sheet, sheetName: `แผ่นจิ๊กซอว์ ${c.name} (${pname})`, frame: { id: `sku-${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}${n}`, code, name: `กรอบรูป ${c.name} (${pname})` } });
}
for (const x of plan) console.log(`${SIZE} = ${x.c.name}\n   ตัดเสมอ            → ${x.sheetName}  [${x.sheet.code} เดิมชื่อ "${x.sheet.name}"]\n   เมื่อ ${KIND} = ${WITH_FRAME} → ${x.frame.name}  [${x.frame.code} สร้างใหม่]`);
if (!APPLY) { console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

mkdirSync(".cache/stock-fix", { recursive: true });
writeFileSync(".cache/stock-fix/uv.before-260918.json", JSON.stringify({ product: row, sheets: plan.map(x => x.sheet) }, null, 2));
const { FieldValue } = await import("firebase-admin/firestore");
for (const x of plan) {
  await db.collection("stockItems").doc(x.sheet.id).update({ name: x.sheetName, aliases: [...new Set([...(x.sheet.aliases ?? []), x.sheet.name])], needsReview: FieldValue.delete(), maybeDuplicateOf: FieldValue.delete(), reviewedAt: now, reviewedBy: "Claude (จัด SKU uv ตามที่เจ้าของร้านขอ)", updatedAt: now });
  const f = { id: x.frame.id, name: x.frame.name, code: x.frame.code, aliases: [x.c.name], unit: x.sheet.unit ?? "ชิ้น", balance: 0, productIds: [], active: true, createdAt: now, updatedAt: now };
  if (x.sheet.family) f.family = x.sheet.family;
  if (x.sheet.category) f.category = x.sheet.category;
  if (x.c.imageSrc) f.imageUrl = x.c.imageSrc;
  await db.collection("stockItems").doc(f.id).set(f);
}
const byChoice = Object.fromEntries(plan.map(x => [x.c.name, x]));
const next = { ...p, options: p.options.map((o, i) => i !== oi ? o : { ...o, choices: o.choices.map(c => ({ ...c, stockItemId: byChoice[c.name].sheet.id, stockLinks: [{ stockItemId: byChoice[c.name].frame.id, when: [{ label: KIND, choices: [WITH_FRAME] }] }] })) }) };
const { error } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
console.log(error ? "⛔ เขียนสินค้าไม่สำเร็จ: " + error.message : "\n✅ เขียนแล้ว · สำรองไว้ที่ .cache/stock-fix/uv.before-260918.json");
process.exit(0);
