#!/usr/bin/env node
/**
 * แกะ "ตัวแปรของสินค้า" ที่เผยแพร่แล้ว แล้วบอกว่าตัวไหนควรกลายเป็น SKU
 *
 *   node scripts/product-variants.mjs           # สรุป: มิติไหนกินสต๊อก มิติไหนไม่กิน
 *   node scripts/product-variants.mjs --sku     # รายการ SKU ที่ควรมี + เช็คว่า TP เคยสั่งจริงไหม
 *
 * หลักการสำคัญ: ห้ามคูณทุกตัวเลือกเป็น SKU
 * พวงกุญแจอะคริลิคตัวเดียวคูณออกมาได้ 7.4 × 10¹⁹ ชุด — เพราะตัวเลือกส่วนใหญ่เป็น
 * "กระบวนการ" (สกรีนกี่ด้าน, พิมพ์กี่ด้าน) ไม่ใช่ "วัสดุ" ที่หยิบออกจากชั้นวาง
 * นับสต๊อกเฉพาะมิติที่เป็นของจริงเท่านั้น
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const SKU_MODE = process.argv.includes("--sku");
const env = Object.fromEntries(
  readFileSync("/Users/iduckshop/Desktop/iDuckySaleSystem2/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

// มิติที่ "ไม่กิน" สต๊อก — เป็นแรงงาน/กระบวนการ ต้องเช็คก่อนเสมอ
const PROCESS = /สกรีน|พิมพ์|ตำแหน่งงาน|เทคนิค|ไดคัท|เจาะรู|ระบบพิมพ์|จำนวน|ด้าน$/;
// มิติที่ "กิน" สต๊อก — เป็นของจริงที่หยิบจากชั้นวาง
const MATERIAL = /เนื้อผ้า|^ผ้า|สีไหม|ไหม|ซิป|ตะขอ|โซ่|อะคริลิค|ขนาด|ประเภท|วัสดุ|กลิตเตอร์|^สี|ฐาน|หูกระเป๋า/;

const kind = (label) => (PROCESS.test(label) ? "process" : MATERIAL.test(label) ? "material" : "unknown");

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/เเ/g, "แ")
    .replace(/(\d)\s*[x×*]\s*(\d)/g, "$1*$2")
    .replace(/\s+/g, "")
    .replace(/[็่้๊๋์]/g, "");

// ── สินค้าที่เผยแพร่แล้ว ──
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from("products").select("id,data").neq("category", "__presets__");
if (error) throw error;
const live = data.filter((r) => r.data && !r.data.hidden);

// ── มิติทั้งหมด ──
const dims = new Map(); // label -> { kind, products:Set, choices:Map<choice, Set<productId>>, preset:boolean }
for (const r of live) {
  for (const o of r.data.options ?? []) {
    const L = (o.label || "").trim();
    if (!L) continue;
    if (!dims.has(L)) dims.set(L, { kind: kind(L), products: new Set(), choices: new Map(), preset: false });
    const d = dims.get(L);
    d.products.add(r.id);
    if (o.presetId) d.preset = true;
    for (const c of o.choices ?? []) {
      const n = (c.name || "").trim();
      if (!n || n === "-" || /^ไม่มีตัวเลือก$/.test(n)) continue;
      if (!d.choices.has(n)) d.choices.set(n, new Set());
      d.choices.get(n).add(r.id);
    }
  }
}

if (!SKU_MODE) {
  const groups = { material: [], process: [], unknown: [] };
  for (const [L, d] of dims) groups[d.kind].push([L, d]);
  const head = { material: "🧱 กินสต๊อก — ต้องมี SKU", process: "⚙️ ไม่กินสต๊อก — เป็นกระบวนการ", unknown: "❓ ต้องให้คนตัดสิน" };
  for (const k of ["material", "process", "unknown"]) {
    const list = groups[k].sort((a, b) => b[1].products.size - a[1].products.size);
    const skuCount = list.reduce((s, [, d]) => s + d.choices.size, 0);
    console.log(`\n━━ ${head[k]} — ${list.length} มิติ / ${skuCount} ค่า ━━`);
    for (const [L, d] of list.slice(0, 18)) {
      console.log(`  ${String(d.products.size).padStart(3)} สินค้า · ${L}${d.preset ? " ⇢คลังกลาง" : ""} (${d.choices.size} ค่า)`);
    }
    if (list.length > 18) console.log(`  … อีก ${list.length - 18} มิติ`);
  }
  console.log(`\n💡 ดูรายการ SKU ที่ควรมี: node scripts/product-variants.mjs --sku`);
  process.exit(0);
}

// ── โหมด --sku: เทียบกับของที่ TP เคยสั่งจริง ──
const app = initializeApp({
  credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))),
});
const [orders, receipts] = await Promise.all([
  getFirestore(app, "tpdigitalreciept").collection("order").get(),
  getFirestore(app, "tp-fixflow").collection("goods_receipts").get(),
]);
const tpText = [
  ...orders.docs.map((d) => d.data().rawText),
  ...receipts.docs.map((d) => d.data().itemName),
]
  .map((s) => norm(String(s || "").split("\n")[0]))
  .filter(Boolean);

/**
 * TP เคยสั่งของที่ตรงกับตัวเลือกนี้ไหม
 * ถ้าตัวเลือกมี "รหัส" (ไหม 1803, ตะขอ C16) ให้ค้นด้วยรหัส — แม่นกว่าค้นด้วยสีมาก
 * เพราะค้นคำว่า "ขาว" เฉย ๆ จะไปโดนทุกอย่างที่มีคำว่าขาวปนอยู่
 */
const tpKnows = (choice) => {
  const code = String(choice).match(/\((\d{3,5})\)|^([A-Z]{1,3}\d{1,3})\b|\b([A-Z]-\d{2})\b/);
  const needle = code ? norm(code[1] || code[2] || code[3]) : norm(choice);
  if (needle.length < 4) return 0;   // สั้นกว่านี้ค้นแล้วมั่ว
  return tpText.filter((t) => t.includes(needle)).length;
};

let total = 0, known = 0;
for (const [L, d] of [...dims].filter(([, d]) => d.kind === "material").sort((a, b) => b[1].products.size - a[1].products.size)) {
  const rows = [...d.choices.entries()].map(([c, prods]) => ({ c, prods: prods.size, tp: tpKnows(c) }));
  const hit = rows.filter((r) => r.tp > 0);
  total += rows.length;
  known += hit.length;
  console.log(`\n━━ ${L}${d.preset ? " ⇢คลังกลาง (ผูกครั้งเดียวใช้ได้ทุกสินค้า)" : ""} — ${rows.length} SKU · ${d.products.size} สินค้าใช้ ━━`);
  for (const r of rows.sort((a, b) => b.tp - a.tp).slice(0, 12)) {
    console.log(`   ${r.tp > 0 ? "✅" : "  "} ${r.c.slice(0, 44).padEnd(44)} ${r.tp > 0 ? `TP เคยสั่ง ${r.tp}×` : ""}`);
  }
  if (rows.length > 12) console.log(`   … อีก ${rows.length - 12} ค่า (TP เคยสั่ง ${hit.length - rows.slice(0, 12).filter((r) => r.tp > 0).length} ตัว)`);
}
console.log(`\n📊 มิติวัสดุกางเป็น SKU ได้ ${total} ตัว — TP เคยสั่งจริงแล้ว ${known} ตัว (${Math.round((known / total) * 100)}%)`);
console.log(`   ตัวที่ ✅ = ผูกกับคลังได้ทันที · ตัวที่เหลือ = ขายอยู่แต่ยังไม่เคยสั่งเข้า หรือเรียกคนละชื่อ`);
process.exit(0);
