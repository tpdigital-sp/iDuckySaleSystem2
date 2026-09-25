/**
 * สแตนดี้อะคริลิค หมุนได้ (standee-rotating) — ให้ "สกรีนกี่ด้าน" ติดไปกับตะกร้า/ออเดอร์/ใบงาน
 *
 *   npx tsx scripts/standee-rotating-screen-sides-group.mts            (ดูอย่างเดียว)
 *   npx tsx scripts/standee-rotating-screen-sides-group.mts --write    (เขียน + อ่านกลับเทียบ)
 *
 * ต้นตอ (พนักงานแจ้ง 25 ก.ย. 69 · OD-260923-2638): สินค้านี้ไม่มีกลุ่มตัวเลือก "งานสกรีน" เลย —
 * "ตัวสแตนดี้สกรีน 2 ด้าน" เขียนไว้แค่ใน desc ของเรทราคา / คำอธิบาย / แท็บสเปก (ข้อความอ่านอย่างเดียว)
 * ตะกร้า/ออเดอร์/ใบงาน แสดงเฉพาะ selections จึงไม่มีบรรทัดสกรีนเลย ฝ่ายผลิตไม่รู้ว่า 1 หรือ 2 ด้าน
 * (บรรทัด "สกรีนลายฐาน: ไม่สกรีนฐาน" เป็นเรื่องฐาน และถูก pickedNone ตัดทิ้งอยู่แล้ว)
 *
 * วิธีแก้: เพิ่มกลุ่ม "สกรีนกี่ด้าน" (สกรีน 2 ด้าน = ค่าเริ่มต้นตามสเปคสินค้า / สกรีน 1 ด้าน) ถัดจากขนาดตัว
 * ชื่อกลุ่มใช้คำว่า "กี่ด้าน" ตาม mini-standee-2 เพราะ proof-check (specCounts) อ่านจำนวนด้านจากหัวข้อที่มีคำนี้
 * → ตรวจแบบงาน 2 ด้านนับรูปแบบ = ลาย × 2 ได้ · ไม่มี extra = ราคาไม่ขยับ (ตารางรวมสกรีน 2 ด้านแล้ว)
 *
 * ⚠️ แกนตารางราคาคือ ขนาดตัว│ขนาดฐาน│สกรีนลายฐาน — สคริปต์นี้ไม่แตะ pricing/priceRates เลย
 * รันซ้ำได้: มีกลุ่มครบแล้วก็ไม่เขียนซ้ำ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "standee-rotating";
const G_SIZE = "ขนาดตัวสแตนดี้";
const G_SIDES = "สกรีนกี่ด้าน";
const SECTION = "1. ขนาด + งานสกรีน";
const CHOICES: ProductOption["choices"] = [
  { name: "สกรีน 2 ด้าน", desc: "พิมพ์ลายทั้ง 2 ด้าน หมุนแล้วเห็นลายทุกมุม — สเปคมาตรฐานของสินค้านี้ ราคาในตารางรวมแล้ว" },
  { name: "สกรีน 1 ด้าน", desc: "พิมพ์ลายด้านเดียว อีกด้านเป็นอะคริลิคเปล่า · ราคาเท่ากับ 2 ด้าน" },
];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const die = (msg: string): never => {
  console.error("✗", msg);
  process.exit(1);
};

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error || !row) die(`หาสินค้า ${ID} ไม่เจอ: ${error?.message}`);
const d = row!.data as Product;

const size = d.options.find((o) => o.label === G_SIZE);
if (!size) die(`ไม่เจอกลุ่ม "${G_SIZE}" — โครงสินค้าเปลี่ยน ตรวจก่อนรัน`);
const drivers = d.pricing?.driverLabels ?? [];
if (drivers.includes(G_SIDES)) die(`"${G_SIDES}" เป็นแกนตารางราคาอยู่แล้ว — สคริปต์นี้ไม่ควรแตะ`);
if (d.options.some((o) => /^งานสกรีน/.test(o.label))) die(`มีกลุ่ม "งานสกรีน…" อยู่แล้ว — อย่าเพิ่มซ้ำ 2 ชื่อ ตรวจก่อน`);

const wantGroup: ProductOption = {
  label: G_SIDES,
  section: SECTION,
  display: "cards",
  choices: CHOICES,
  note: "ราคาในตารางรวมสกรีน 2 ด้านแล้ว — เลือก 1 ด้านราคาเท่ากัน ไม่มีส่วนลด",
};
const sameGroup = (o: ProductOption | undefined) =>
  !!o &&
  o.choices.map((c) => `${c.name}|${c.desc ?? ""}|${c.extra ?? 0}`).join("‖") ===
    CHOICES.map((c) => `${c.name}|${c.desc ?? ""}|${c.extra ?? 0}`).join("‖") &&
  o.section === SECTION &&
  o.display === "cards" &&
  o.note === wantGroup.note;

let changed = false;
// ── หัวชุดของกลุ่มขนาดตัว: "1. ขนาด" → "1. ขนาด + งานสกรีน" (แบบ standee-spring) ให้กลุ่มใหม่อยู่กรอบเดียวกัน ──
if (size!.section !== SECTION) {
  console.log(`~ section ของ "${G_SIZE}": "${size!.section}" → "${SECTION}"`);
  size!.section = SECTION;
  changed = true;
}
// ── กลุ่ม "สกรีนกี่ด้าน" แทรกถัดจาก "ขนาดตัวสแตนดี้" ──
const existing = d.options.find((o) => o.label === G_SIDES);
if (!sameGroup(existing) || d.options.indexOf(existing!) !== d.options.indexOf(size!) + 1) {
  d.options = d.options.filter((o) => o.label !== G_SIDES);
  d.options.splice(d.options.indexOf(size!) + 1, 0, wantGroup);
  changed = true;
  console.log(`+ เพิ่มกลุ่ม "${G_SIDES}" (${CHOICES.map((c) => c.name).join(" / ")}) ถัดจาก "${G_SIZE}"`);
} else console.log(`= กลุ่ม "${G_SIDES}" มีอยู่แล้ว`);

console.log("\nกลุ่มตัวเลือกหลังแก้:");
for (const o of d.options)
  console.log(`  - [${o.section ?? "-"}] ${o.label}${o.display ? ` (${o.display})` : ""}: ${o.choices.map((c) => c.name).join(" / ")}`);
console.log("แกนราคา:", JSON.stringify(drivers), "(ไม่แตะ)");

if (!changed) {
  console.log("\n✓ ตรงตามที่ต้องการอยู่แล้ว ไม่ต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}

const before = JSON.stringify({ p: d.pricing, r: d.priceRates });
const range = priceRange(d);
const saved: Product = { ...d, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };
if (JSON.stringify({ p: saved.pricing, r: saved.priceRates }) !== before) die("ตารางราคาขยับ — ไม่ควรเกิด หยุด");
const { data: up, error: upErr } = await sb.from("products").update({ data: saved }).eq("id", ID).select("data");
if (upErr) die(upErr.message);
if (!up?.length) die("update โดน 0 แถว");

// อ่านกลับเทียบ (อย่าเชื่อว่าไม่มี error = สำเร็จ)
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back!.data as Product;
const g = b.options.find((o) => o.label === G_SIDES);
if (!sameGroup(g)) die("อ่านกลับ: กลุ่มสกรีนกี่ด้านไม่ตรง");
if (b.options.indexOf(g!) !== b.options.findIndex((o) => o.label === G_SIZE) + 1) die("อ่านกลับ: ลำดับกลุ่มไม่ตรง");
if (b.savedAt !== saved.savedAt) die("อ่านกลับ: savedAt ไม่ตรง");
if (JSON.stringify({ p: b.pricing, r: b.priceRates }) !== before) die("อ่านกลับ: ตารางราคาเปลี่ยน");
console.log("\n✓ บันทึกแล้ว + อ่านกลับตรงทุกข้อ (savedAt", saved.savedAt + ")");
