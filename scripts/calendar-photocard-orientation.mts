/**
 * 🗓 เพิ่มกลุ่ม "แนวการ์ด" (แนวตั้ง / แนวนอน) ให้ปฏิทินโฟโต้การ์ดที่มีอยู่ (13 ต.ค. 69 — ผู้ใช้ขอ)
 *
 *   npx tsx scripts/calendar-photocard-orientation.mts            # ดูผลก่อน
 *   npx tsx scripts/calendar-photocard-orientation.mts --write    # บันทึกจริง
 *
 * ไม่แตะราคา/ตัวเลือกอื่น (ราคาเท่ากันทั้งสองแนว) · ใส่ต่อจากกลุ่ม "พิมพ์" · รันซ้ำได้ (มีแล้ว = เขียนทับที่เดิม)
 * รูปแบบจอ: แนวนอน = card-L / card1-L (8.5×5.5 ซม.) · แนวตั้ง = card / card1 เดิม
 * รูปการ์ดตัวเลือก = scripts/assets/calendar-samples/photocard-ori-{P,L}.jpg (สร้างด้วย scripts/calendar-samples.mts) อัปตอน --write
 * calendar-photocard-build.mts ใส่กลุ่มนี้ให้แล้ว — สคริปต์นี้มีไว้แก้ของที่อยู่ใน DB โดยไม่ต้องสร้างใหม่ทั้งก้อน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product, ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};

const ID = "calendar-photocard";
const SIDE = "พิมพ์";
const S1 = "พิมพ์ 1 ด้าน";
const ORI = "แนวการ์ด";
const OP = "แนวตั้ง";
const OL = "แนวนอน";
const V = "v1"; // แก้รูปครั้งหน้าขยับ v2 (กันแคช)
const url = (f: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;
const sample = async (name: string): Promise<string> => {
  const file = `opt-${name}-${V}.jpg`;
  if (WRITE) {
    const buf = readFileSync(new URL(`./assets/calendar-samples/${name}.jpg`, import.meta.url));
    const up = await sb.storage.from("product-images").upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
    if (up.error) die(`อัป ${file}: ${up.error.message}`);
  }
  return url(file);
};
const IMG_P = await sample("photocard-ori-P");
const IMG_L = await sample("photocard-ori-L");

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error || !row) die(`อ่าน ${ID} ไม่ได้: ${error?.message}`);
const p = row!.data as Product;
const options = [...p.options];
const sideAt = options.findIndex((o) => o.label === SIDE);
if (sideAt < 0) die(`ไม่เจอกลุ่ม "${SIDE}"`);
if (!options[sideAt].choices.some((c) => c.name === S1)) die(`กลุ่ม "${SIDE}" ไม่มี "${S1}"`);
const group: ProductOption = {
  label: ORI,
  display: "cards",
  ...(options[sideAt].section ? { section: options[sideAt].section } : {}),
  note: "ราคาเท่ากันทั้งสองแนว",
  choices: [
    { name: OP, desc: "5.5 × 8.5 ซม. (ตั้ง)", imageSrc: IMG_P },
    { name: OL, desc: "8.5 × 5.5 ซม. (นอน)", imageSrc: IMG_L },
  ],
};
const at = options.findIndex((o) => o.label === ORI);
if (at >= 0) options[at] = group;
else options.splice(sideAt + 1, 0, group);
const formats = [
  { format: "card1-L", when: [{ label: SIDE, choices: [S1] }, { label: ORI, choices: [OL] }] },
  { format: "card1", when: [{ label: SIDE, choices: [S1] }] },
  { format: "card-L", when: [{ label: ORI, choices: [OL] }] },
  { format: "card" },
];
const next: Product = {
  ...p,
  options,
  calendarStudio: { ...(p.calendarStudio ?? { yearLabel: "ปีปฏิทิน" }), formats },
  savedAt: new Date().toISOString(),
};

console.log(`📦 ${row!.name} (${ID})`);
console.log(`   กลุ่ม: ${options.map((o) => o.label).join(" · ")}`);
console.log(`   รูปแบบ: ${formats.map((f) => `${f.format}${f.when ? ` ← ${f.when.map((w) => w.choices[0]).join(" + ")}` : ""}`).join(" · ")}`);
if (!WRITE) {
  console.log("\n(dry-run — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: next }).eq("id", ID);
if (upErr) die(`บันทึกไม่สำเร็จ: ${upErr.message}`);
const { data: check } = await sb.from("products").select("data").eq("id", ID).single();
const back = check!.data as Product;
if (back.savedAt !== next.savedAt || !back.options.some((o) => o.label === ORI) || back.calendarStudio?.formats?.length !== 4)
  die("อ่านกลับมาไม่ตรง");
console.log("   ✅ บันทึกแล้ว");
