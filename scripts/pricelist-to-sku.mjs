#!/usr/bin/env node
/**
 * สร้าง SKU จากค่าที่คัดไว้แล้ว (.cache/pricelist/classified.json กอง sku + ask)
 *
 *   node scripts/pricelist-to-sku.mjs           # ดูอย่างเดียว
 *   node scripts/pricelist-to-sku.mjs --write   # เขียนจริง
 *
 * ตั้งชื่อ: ค่าที่เป็น "ชื่อของ" อยู่แล้ว (ผ้าฮาร์มิต, แก้วขาวขุ่น) ใช้ตรง ๆ
 *          ค่าที่เป็นขนาดล้วน (76x100cm) เติมชื่อสินค้าหน้านั้นนำหน้า → "ผ้าห่ม 76x100cm"
 * alias:   เก็บค่าดิบจากเว็บ + ชื่อที่ TP เคยพิมพ์ในใบสั่งที่ตรงกัน
 *
 * ยอดคงเหลือตั้งต้น = 0 เสมอ — ต้องเดินนับจริง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const WRITE = process.argv.includes("--write");
const CACHE = new URL("../.cache/pricelist/", import.meta.url).pathname;
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const norm = (s) =>
  String(s || "").toLowerCase().replace(/เเ/g, "แ").replace(/\s+/g, "").replace(/[็่้๊๋์]/g, "");
const PURE_SIZE = /^(\d+(\.\d+)?\s*[-–]?\s*\d*(\.\d+)?\s*(cm|mm|นิ้ว|inch|oz|")?|[A-Z]\d|\d+\s*[x×*]\s*\d+.*)$/i;

/** ชื่อไทยของหน้าที่จับคู่กับสินค้าในระบบไม่ได้ — เติมเองเท่าที่รู้แน่ */
const PAGE_LABEL = {
  blanket: "ผ้าห่ม",
  fabricposter: "ผ้าโปสเตอร์",
  premiumbag: "กระเป๋าผ้า",
  clothbag: "ถุงผ้า",
  otherbag: "กระเป๋า",
  catdogcollar: "ปลอกคอสัตว์เลี้ยง",
  tailoringclothes: "เสื้อตัดเย็บ",
  tshirtprinting: "เสื้อยืดสกรีน",
  pillowcases: "ปลอกหมอน",
  pillowkeychain: "หมอนพวงกุญแจ",
  mousepad: "แผ่นรองเมาส์",
  doormat: "พรมเช็ดเท้า",
  mirror: "กระจก",
  mugcoaster: "แก้ว/ที่รองแก้ว",
  wallet: "กระเป๋าสตางค์",
  griptok: "Griptok",
  gadgetphone: "อุปกรณ์มือถือ",
  slogansatin: "แผ่นรีด/สโลแกน",
  rubberband: "ผ้าคาด",
  oclockdigital: "นาฬิกา",
  calendar: "ปฏิทิน",
  armpatch: "อาร์มติดเสื้อ",
  รับทำแผ่นหินน้ำหอม: "แผ่นหินน้ำหอม",
  photoframe: "กรอบรูป",
  pin: "เข็มกลัด",
  standylightbase: "ฐานไฟ",
  photocard: "โฟโต้การ์ด",
  otheracrylicproducts4: "แผ่นวัสดุ",
  paperprice: "กระดาษ",
  magnetbookmark: "ที่คั่นหนังสือแม่เหล็ก",
  otheracrylicproducts2: "อะคริลิค",
  acrylicrotatingstand: "ฐานหมุน",
  acrylicmagnet: "อะคริลิคแม่เหล็ก",
  otheracrylicproducts: "อะคริลิคอื่น ๆ",
  standyphonebase: "ฐานตั้งมือถือ",
};

const shortHash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().padStart(7, "0");
};
/** รหัส: PL-<หน้า(ย่อ)>-<แฮชของค่า> — ค่าเป็นไทยเยอะ ทำ slug อ่านออกไม่ได้ จึงใช้แฮชกันชน */
const codeOf = (page, value) =>
  `PL-${page.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase() || "X"}-${shortHash(`${page}|${value}`)}`;

const buckets = JSON.parse(readFileSync(`${CACHE}classified.json`, "utf8"));
const rowsIn = [...buckets.sku, ...buckets.ask];

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const app = initializeApp({
  credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))),
});
const fx = getFirestore(app, "tp-fixflow");

const { data: prodRows } = await sb.from("products").select("id,data").neq("category", "__presets__");
const prods = (prodRows ?? []).filter((r) => r.data?.name && !r.id.startsWith("__"));
const labelOf = (page) =>
  PAGE_LABEL[page] ?? prods.find((p) => p.id === page || p.id.startsWith(`${page}-`))?.data.name ?? page;

// ชื่อที่ TP เคยพิมพ์ — ใช้เติม alias ให้ค้นเจอด้วยคำที่พนักงานคุ้น
const tpNames = [
  ...(await getFirestore(app, "tpdigitalreciept").collection("order").get()).docs.map((d) => d.data().rawText),
  ...(await fx.collection("goods_receipts").get()).docs.map((d) => d.data().itemName),
]
  .map((s) => String(s || "").split("\n")[0].trim())
  .filter(Boolean);

const existing = (await fx.collection("stockItems").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const existingByName = new Map(existing.map((s) => [norm(s.name), s]));

const plan = [];
const seen = new Set();
for (const r of rowsIn) {
  const value = r.value.replace(/\s+/g, " ").trim();
  const label = labelOf(r.page);
  const name = PURE_SIZE.test(value.replace(/\s/g, "")) ? `${label} ${value}` : value;
  const key = norm(name);
  if (seen.has(key)) continue; // ค่าเดียวกันโผล่หลายตารางในหน้าเดียว
  seen.add(key);
  const hit = existingByName.get(key);
  const aliases = [...new Set([value, ...tpNames.filter((t) => norm(t).includes(norm(value)) && norm(t) !== key)].slice(0, 6))];
  plan.push({ page: r.page, value, name, code: codeOf(r.page, value), hit, aliases, family: label });
}

const toCreate = plan.filter((p) => !p.hit);
console.log(`ค่าที่คัดไว้ ${rowsIn.length} → ไม่ซ้ำ ${plan.length} · สร้างใหม่ ${toCreate.length} · มี SKU อยู่แล้ว ${plan.length - toCreate.length}\n`);
const byPage = new Map();
for (const p of toCreate) {
  if (!byPage.has(p.page)) byPage.set(p.page, []);
  byPage.get(p.page).push(p);
}
for (const [page, ps] of [...byPage].sort((a, b) => b[1].length - a[1].length).slice(0, 18)) {
  console.log(`  ${page.padEnd(22)} ${String(ps.length).padStart(2)} · ${ps.slice(0, 4).map((p) => p.name).join(" · ").slice(0, 100)}`);
}
const withAlias = toCreate.filter((p) => p.aliases.length > 1).length;
console.log(`\n  มี alias จากชื่อที่ TP เคยสั่ง ${withAlias} ตัว`);

if (!WRITE) {
  console.log(`\n💡 ยังไม่เขียนอะไร — ใส่ --write ถ้าจะเขียนจริง`);
  process.exit(0);
}

const now = new Date().toISOString();
let created = 0, skipped = 0;
for (const p of toCreate) {
  const id = p.code.toLowerCase();
  const clash = await fx.collection("stockItems").doc(id).get();
  if (clash.exists) {
    console.error(`❌ รหัส ${p.code} ชนกับ "${clash.data().name}" — ข้าม`);
    skipped++;
    continue;
  }
  await fx.collection("stockItems").doc(id).set({
    id,
    code: p.code,
    name: p.name,
    unit: "ชิ้น",
    category: "วัสดุ/ของสำเร็จ",
    family: p.family,
    aliases: p.aliases,
    balance: 0, // ต้องเดินนับจริง
    productIds: [],
    active: true,
    needsReview: true, // มาจากเว็บตารางราคา ยังไม่มีคนตรวจ
    source: "pricelist",
    createdAt: now,
    updatedAt: now,
  });
  created++;
}
console.log(`\n✅ สร้าง SKU ${created} ตัว${skipped ? ` · ข้าม ${skipped}` : ""} (ยอด 0 · ติดธงรอตรวจทั้งหมด)`);
process.exit(0);
