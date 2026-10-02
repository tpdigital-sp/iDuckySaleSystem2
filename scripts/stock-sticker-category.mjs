#!/usr/bin/env node
/**
 * 📄 สติ๊กเกอร์ 10 ตัว → "เพิ่มเข้า stock หมวด กระดาษ/สติกเกอร์" (เจ้าของร้านสั่ง 2 ต.ค. 69)
 * SKU ระดับสินค้ามีอยู่แล้วทุกตัว (P-STICKER-UV …) แต่ติดธง noStock (ไม่ต้องมีสต๊อก = ซ่อนจากรายการ/ไม่ตัดยอด) + ยังไม่มีหมวด + needsReview
 * → ตั้งหมวด + ปลดธง noStock + ปลดรอตรวจ (แบบเดียวกับ setNoStock/setReviewed ใน stock.ts) · ไม่แตะยอดคงเหลือ
 *   node scripts/stock-sticker-category.mjs [--apply]
 */
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const CATEGORY = "กระดาษ/สติกเกอร์";
const PRODUCTS = ["sticker-uv", "neon", "sticker-hologram", "sticker-rainbow-film", "sticker-solvent", "dtf", "sticker-gold-silver-rosegold", "washi-sticker", "reflective-sticker", "sticker-vacuum"];
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const cats = (await db.collection("stockMeta").doc("categories").get()).data()?.names ?? [];
if (!cats.includes(CATEGORY)) { console.error(`❌ ไม่มีหมวด "${CATEGORY}"`); process.exit(1); }
const skus = (await db.collection("stockItems").get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.active !== false);
let todo = 0;
for (const pid of PRODUCTS) {
  const rows = skus.filter((s) => (s.productIds ?? []).includes(pid));
  if (!rows.length) { console.log(`❌ ${pid}: ไม่มี SKU ระดับสินค้า — ข้าม`); continue; }
  for (const s of rows) {
    const patch = {};
    if (s.category !== CATEGORY) patch.category = CATEGORY;
    if (s.noStock) patch.noStock = FieldValue.delete();
    if (s.needsReview) patch.needsReview = FieldValue.delete();
    const what = Object.entries(patch).map(([k, v]) => (v === FieldValue.delete() || (v && typeof v === "object") ? `ปลด ${k}` : `${k}=${v}`)).join(" · ");
    console.log(`${what ? "＋" : "✓"} ${s.code.padEnd(28)} ${s.name.padEnd(30)} คงเหลือ ${s.balance} ${s.unit} ${what || "ครบแล้ว"}`);
    if (!what) continue;
    todo++;
    if (APPLY) {
      await db.collection("stockItems").doc(s.id).update({ ...patch, updatedAt: new Date().toISOString() });
      const b = (await db.collection("stockItems").doc(s.id).get()).data();
      if (b.category !== CATEGORY || b.noStock || b.needsReview) { console.error(`❌ อ่านกลับ ${s.code} ไม่ตรง`); process.exit(1); }
    }
  }
}
console.log(APPLY ? `\n🎉 แก้แล้ว ${todo} SKU` : `\n(ดูอย่างเดียว ${todo} SKU ที่จะแก้ — ใส่ --apply เพื่อเขียนจริง)`);
process.exit(0);
