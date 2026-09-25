/**
 * MINI STANDEE (mini-standee · /products/MINI-STANDEE) — ให้ "ขนาดฐาน" ติดไปกับตะกร้า/ออเดอร์/ใบงาน
 *
 *   npx tsx scripts/mini-standee-base-size-group.mts            (ดูอย่างเดียว)
 *   npx tsx scripts/mini-standee-base-size-group.mts --write    (เขียน + อ่านกลับเทียบ)
 *
 * ต้นตอ (ผู้ใช้แจ้ง 25 ก.ย. 69): ขนาดฐานของสินค้านี้เขียนไว้แค่ใน `desc` ของการ์ดขนาด
 * ("ตัวสแตนดี้ด้านยาวสุด 1.5 ซม. · ฐานกลม 1 ซม.") กับใน terms — ไม่ใช่ตัวเลือกจริง
 * ตะกร้า/ออเดอร์/ใบงาน แสดงเฉพาะ selections จึงไม่มีบรรทัดขนาดฐานเลย (เห็นแค่ "ขนาด: 2.5cm")
 *
 * วิธีแก้: เพิ่มกลุ่ม "ขนาดฐาน" (กลม 1 ซม. / กลม 1.5 ซม.) + กฎเงื่อนไข ขนาด=1.5cm → เหลือ กลม 1 ซม.
 * และ ขนาด=2.5cm → เหลือ กลม 1.5 ซม. — หน้าสินค้าโชว์เป็นป้ายล็อก 🔒 (กำหนดอัตโนมัติตามขนาด)
 * ตะกร้า/ออเดอร์ได้บรรทัด "ขนาดฐาน: กลม 1 ซม." ผ่านทางปกติ (tidySpec จัดไว้ถัดจากขนาดตัวงาน)
 *
 * ⚠️ กลุ่ม "ขนาด" เป็นแกนตารางราคา (cells คีย์ "1.5cm"/"2.5cm") — สคริปต์นี้ไม่แตะชื่อกลุ่ม/ตัวเลือก
 *    และไม่แตะ pricing เลย · กลุ่มใหม่ไม่มี extra = ราคาไม่ขยับ
 * รันซ้ำได้: มีกลุ่ม+กฎครบแล้วก็ไม่เขียนซ้ำ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type OptionRule, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "mini-standee";
const G_SIZE = "ขนาด";
const G_BASE_SIZE = "ขนาดฐาน";
/** ขนาดตัว → ขนาดฐาน ตาม terms ของสินค้า (*ขนาด 1.5cm | ฐานทรงกลม 1cm · *ขนาด 2.5cm | ฐานทรงกลม 1.5cm) */
const MAP: { size: string; base: string }[] = [
  { size: "1.5cm", base: "กลม 1 ซม." },
  { size: "2.5cm", base: "กลม 1.5 ซม." },
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
if (!size) die(`ไม่เจอกลุ่ม "${G_SIZE}"`);
for (const m of MAP)
  if (!size!.choices.some((c) => c.name === m.size)) die(`ไม่เจอตัวเลือกขนาด "${m.size}" — ข้อมูลเปลี่ยน ตรวจก่อนรัน`);
// ⚠️ คีย์ตารางราคาต้องยังตรงกับชื่อตัวเลือกขนาด (ห้ามให้สคริปต์นี้ทำอะไรถ้าแกนราคาไม่ใช่ "ขนาด")
if (!(d.pricing?.driverLabels ?? []).includes(G_SIZE)) die(`แกนตารางราคาไม่ใช่ "${G_SIZE}" (${JSON.stringify(d.pricing?.driverLabels)})`);

const wantGroup: ProductOption = {
  label: G_BASE_SIZE,
  section: size!.section,
  choices: MAP.map((m) => ({ name: m.base })),
  note: "ฐานกลมใส ขนาดตามตัวสแตนดี้ที่เลือก — กำหนดให้อัตโนมัติ",
};
const wantRules: OptionRule[] = MAP.map((m) => ({
  when: { label: G_SIZE, choice: m.size, choices: [m.size] },
  limit: { label: G_BASE_SIZE, allow: [m.base] },
}));

const sameGroup = (o: ProductOption | undefined) =>
  !!o && o.choices.map((c) => c.name).join("|") === MAP.map((m) => m.base).join("|");
const hasRule = (rules: OptionRule[], r: OptionRule) =>
  rules.some(
    (x) =>
      x.when.label === r.when.label &&
      (x.when.choices ?? [x.when.choice]).join("|") === r.when.choices!.join("|") &&
      x.limit.label === r.limit.label &&
      x.limit.allow.join("|") === r.limit.allow.join("|")
  );

// ── กลุ่ม "ขนาดฐาน" แทรกถัดจาก "ขนาด" ──
const existing = d.options.find((o) => o.label === G_BASE_SIZE);
let changed = false;
if (!sameGroup(existing)) {
  d.options = d.options.filter((o) => o.label !== G_BASE_SIZE);
  d.options.splice(d.options.indexOf(size!) + 1, 0, wantGroup);
  changed = true;
  console.log(`+ เพิ่มกลุ่ม "${G_BASE_SIZE}" (${MAP.map((m) => m.base).join(" / ")})`);
} else console.log(`= กลุ่ม "${G_BASE_SIZE}" มีอยู่แล้ว`);

// ── กฎ ขนาด → ขนาดฐาน ──
const rules: OptionRule[] = (d.rules ?? []).filter((r) => r.limit.label !== G_BASE_SIZE || hasRule(wantRules, r));
for (const r of wantRules)
  if (!hasRule(rules, r)) {
    rules.push(r);
    changed = true;
    console.log(`+ กฎ ${r.when.label} = ${r.when.choice} → ${r.limit.label} เหลือ ${r.limit.allow.join(" / ")}`);
  } else console.log(`= กฎ ${r.when.label} = ${r.when.choice} มีอยู่แล้ว`);
if (rules.length !== (d.rules ?? []).length) changed = true;
d.rules = rules;

console.log("\nกลุ่มตัวเลือกหลังแก้:");
for (const o of d.options) console.log(`  - ${o.label}${o.display ? ` (${o.display})` : ""}: ${o.choices.map((c) => c.name).join(" / ")}`);
console.log("กฎ:", d.rules.map((r) => `${r.when.label}=${r.when.choice} → ${r.limit.label}:${r.limit.allow.join("/")}`).join(" · "));

if (!changed) {
  console.log("\n✓ ตรงตามที่ต้องการอยู่แล้ว ไม่ต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}

const range = priceRange(d);
const saved: Product = { ...d, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };
const { data: up, error: upErr } = await sb.from("products").update({ data: saved }).eq("id", ID).select("data");
if (upErr) die(upErr.message);
if (!up?.length) die("update โดน 0 แถว");

// อ่านกลับเทียบ (อย่าเชื่อว่าไม่มี error = สำเร็จ)
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back!.data as Product;
const g = b.options.find((o) => o.label === G_BASE_SIZE);
if (!sameGroup(g)) die("อ่านกลับ: กลุ่มขนาดฐานไม่ตรง");
if (b.options.indexOf(g!) !== b.options.findIndex((o) => o.label === G_SIZE) + 1) die("อ่านกลับ: ลำดับกลุ่มไม่ตรง");
for (const r of wantRules) if (!hasRule(b.rules ?? [], r)) die(`อ่านกลับ: กฎ ${r.when.choice} หาย`);
if (b.savedAt !== saved.savedAt) die("อ่านกลับ: savedAt ไม่ตรง");
for (const m of MAP) {
  const cells = (b.pricing?.cells ?? {}) as Record<string, unknown>;
  if (!Object.keys(cells).some((k) => k.includes(m.size))) die(`อ่านกลับ: คีย์ราคา "${m.size}" หาย`);
}
console.log("\n✓ บันทึกแล้ว + อ่านกลับตรงทุกข้อ (savedAt", saved.savedAt + ")");
