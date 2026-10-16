/**
 * แก้วมัค 11 ออนซ์ (mug-11oz) — เปลี่ยนภาพการ์ดกลุ่ม "ประเภท" / "ตำแหน่งสกรีน" เป็นรูปถ่ายชุดใหม่
 *
 *   npx tsx scripts/mug-type-art.mts <type|pos> <dir>           # ดูว่าจะเปลี่ยนอะไร (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/mug-type-art.mts <type|pos> <dir> --write   # อัปรูป + เขียน imageSrc + อ่านกลับเทียบ + revalidate เว็บจริง
 *
 * <dir> ต้องมี <key>.png ตาม MAP ของกลุ่ม (สร้างด้วย Gemini จากรูปแกลเลอรีของร้านเป็นภาพอ้างอิง)
 *   type: white · clear · frosted   pos: front · handle-right · handle-left · both · wrap
 * ต้นตอ (เจ้าของร้านสั่ง 16 ต.ค. 69 "สร้างภาพให้ใหม่หน่อย"): ภาพ v1 ครอปจากรูปรวม 3 ใบ แก้วล้นขอบ
 * หูจับคนละฝั่ง และการ์ดแก้วใสมีหูของแก้วใบข้าง ๆ โผล่ → ชุด v2 = แก้วใบเดียวเต็มใบ ฉากเดียวกัน หูจับขวาทุกใบ
 *
 * รอบสอง (16 ต.ค. 69 "เปลี่ยนภาพตรงส่วนนี้ให้ด้วย"): การ์ดตำแหน่งสกรีน v1 เป็นภาพวาดการ์ตูนมีตัวหนังสือจิ๋ว
 * → รูปถ่ายแก้วฉากเดียวกับการ์ดประเภท (pos-*-v2) · รอบแก้ว = แถบลายเว้นขอบบน-ล่างและช่วงหู ตามข้อควรทราบ
 *
 * แตะเฉพาะ choice.imageSrc ของกลุ่มที่เลือก — ชื่อตัวเลือกเป็นแกนตารางราคา (driverLabels) ห้ามเปลี่ยน
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ขึ้น VER ใหม่
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const GROUPS = {
  type: { label: "ประเภท", prefix: "type", map: { แก้วขาวเงา: "white", แก้วใส: "clear", แก้วขาวขุ่น: "frosted" } },
  pos: {
    label: "ตำแหน่งสกรีน",
    prefix: "pos",
    map: {
      "ด้านหน้า (ตรงข้ามหูจับ)": "front",
      หูจับด้านขวา: "handle-right",
      หูจับด้านซ้าย: "handle-left",
      "สกรีน 2 ด้าน": "both",
      รอบแก้ว: "wrap",
    },
  },
} as const satisfies Record<string, { label: string; prefix: string; map: Record<string, string> }>;
const [GKEY, DIR] = process.argv.slice(2);
const WRITE = process.argv.includes("--write");
const G = GROUPS[GKEY as keyof typeof GROUPS];
if (!G || !DIR || DIR.startsWith("--")) {
  console.error("ใช้: npx tsx scripts/mug-type-art.mts <type|pos> <dir> [--write]");
  process.exit(1);
}
const ID = "mug-11oz";
const VER = "v2";
const G_TYPE = "ประเภท"; // แกนตารางราคา — อ่านกลับเช็คว่าไม่ถูกแตะ
const MAP: Record<string, string> = G.map;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (msg: string): never => {
  console.error("✗", msg);
  process.exit(1);
};
const urlOf = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

const { data: row, error: readErr } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (readErr || !row) die(`อ่านสินค้า ${ID} ไม่ได้: ${readErr?.message ?? "ไม่พบ"}`);
const d = row!.data as Product;
const group = d.options.find((o) => o.label === G.label) ?? die(`ไม่เจอกลุ่ม "${G.label}"`);
if (group.choices.length !== Object.keys(MAP).length) die(`กลุ่ม "${G.label}" มี ${group.choices.length} ตัวเลือก ไม่เท่าชุดภาพ — ข้อมูลเปลี่ยน ตรวจก่อน`);

const jobs: { name: string; file: string; buf: Buffer; url: string }[] = [];
for (const c of group.choices) {
  const key = MAP[c.name] ?? die(`ตัวเลือก "${c.name}" ไม่อยู่ในชุดภาพ — ข้อมูลเปลี่ยน ตรวจก่อน`);
  const file = `${G.prefix}-${key}-${VER}.jpg`;
  const buf = await sharp(`${DIR}/${key}.png`).resize(900, 900, { fit: "cover" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  jobs.push({ name: c.name, file, buf, url: urlOf(file) });
  console.log(`${c.imageSrc === urlOf(file) ? "=" : "~"} ${c.name}: ${c.imageSrc?.split("/").pop()} → ${file} (${Math.round(buf.length / 1024)} KB)`);
}
if (group.choices.every((c, i) => c.imageSrc === jobs[i].url)) {
  console.log("= ภาพตรงชุดใหม่อยู่แล้ว ไม่ต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียน DB — รันด้วย --write)");
  process.exit(0);
}

// เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียว
writeFileSync(`${DIR}/backup-${Date.now()}.json`, JSON.stringify(row!.data, null, 1));
for (const j of jobs) {
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${j.file}`, j.buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`อัป ${j.file}: ${up.error.message}`);
}
group.choices.forEach((c, i) => (c.imageSrc = jobs[i].url));
d.savedAt = new Date().toISOString();
const { data: up, error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID).select("id");
if (upErr) die(upErr.message);
if (!up?.length) die("update โดน 0 แถว");

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back!.data as Product;
const g = b.options.find((o) => o.label === G.label);
if (!g || g.choices.some((c, i) => c.name !== jobs[i].name || c.imageSrc !== jobs[i].url)) die(`อ่านกลับ: ภาพกลุ่ม${G.label}ไม่ตรง`);
const typeNames = b.options.find((o) => o.label === G_TYPE)?.choices.map((c) => c.name) ?? die(`อ่านกลับ: กลุ่ม "${G_TYPE}" หาย`);
for (const p of [b.pricing, ...(b.priceRates ?? []).map((r) => r.pricing)].filter(Boolean)) {
  if (String(p!.driverLabels) !== G_TYPE) die(`อ่านกลับ: driverLabels เพี้ยน ${JSON.stringify(p!.driverLabels)}`);
  for (const n of typeNames) if (!(n in (p!.cells ?? {}))) die(`อ่านกลับ: คีย์ราคา "${n}" หาย`);
}
console.log(`\n✓ เปลี่ยนภาพ ${jobs.length} การ์ด + อ่านกลับตรง · savedAt = ${b.savedAt}`);
await revalidateLive(env, { productIds: [ID] });
