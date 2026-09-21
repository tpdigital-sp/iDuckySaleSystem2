// แผ่นอะคริลิค (acrylic-sheet) — ภาพประจำตัวเลือกกลุ่ม "งานเคลือบนูน (เรซิ่น)" 2 ใบ (เจ้าของร้านสั่ง "สร้างภาพให้หน่อย" 18 ก.ย. 69)
// ภาพสร้างจาก Gemini (.cache/acrylic-sheet-ai/gen-resin*.mjs ไม่ commit): ชิ้นไดคัทหมีชิ้นเดียวกัน ผิวเรียบ vs เคลือบเรซิ่นนูน
// ใช้: node scripts/acrylic-sheet-resin-coat-art.mjs <dir มี resin-no.png + resin-yes.png> [--apply]   (รันซ้ำได้ · เปลี่ยนภาพต้องขยับ V)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const [DIR] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const die = (m) => { console.error("✗", m); process.exit(1); };
if (!DIR) die("ใช้: node scripts/acrylic-sheet-resin-coat-art.mjs <dir> [--apply]");
const ID = "acrylic-sheet", EXPECT = "แผ่นอะคริลิค", GROUP = "งานเคลือบนูน (เรซิ่น)", V = "v1";
const ART = [
  { choice: "ไม่เคลือบนูน (เรซิ่น)", local: "resin-no", file: `option-resin-no-${V}.jpg` },
  { choice: "เคลือบนูน (เรซิ่น)", local: "resin-yes", file: `option-resin-yes-${V}.jpg` },
];
const urlOf = (f) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;
const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
if (row.name !== EXPECT) die(`สินค้า ${ID} ชื่อ "${row.name}" ไม่ใช่ "${EXPECT}"`);
const d = row.data;
const gi = (d.options ?? []).findIndex((o) => o.label === GROUP);
if (gi < 0) die(`ไม่พบกลุ่ม "${GROUP}" — รัน acrylic-sheet-resin-coat.mjs ก่อน`);
for (const a of ART) if (!d.options[gi].choices.some((c) => c.name === a.choice)) die(`ไม่พบตัวเลือก "${a.choice}"`);
const already = ART.every((a) => d.options[gi].choices.find((c) => c.name === a.choice).imageSrc === urlOf(a.file));
console.log(`# ${row.name} · "${GROUP}" ${already ? "ผูกภาพครบแล้ว" : "จะผูกภาพ " + ART.map((a) => a.file).join(" · ")}`);
if (already) { console.log("✓ ทำไปแล้ว"); process.exit(0); }
if (!APPLY) { console.log("dry-run — ใส่ --apply เพื่อเขียนจริง"); process.exit(0); }
for (const a of ART) {
  const buf = await sharp(join(DIR, a.local + ".png")).resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${a.file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`upload ${a.file}: ${up.error.message}`);
  const head = await fetch(urlOf(a.file), { method: "HEAD" });
  if (!head.ok) die(`ดึง ${a.file} ไม่ได้ ${head.status}`);
  console.log(`  ↑ ${a.file} ${(buf.length / 1024).toFixed(0)} KB`);
}
const options = d.options.map((o, i) => i !== gi ? o : { ...o, choices: o.choices.map((c) => { const a = ART.find((x) => x.choice === c.name); return a ? { ...c, imageSrc: urlOf(a.file) } : c; }) });
const savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...d, options, savedAt } }).eq("id", ID).select("id");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bg = (back.data.options ?? []).find((o) => o.label === GROUP);
const ok = back.data.savedAt === savedAt && back.data.options.length === d.options.length
  && ART.every((a) => { const v = bg?.choices.find((c) => c.name === a.choice)?.imageSrc; return typeof v === "string" && v.startsWith("https://") && v === urlOf(a.file); });
if (!ok) die("อ่านกลับไม่ตรง");
console.log(`✓ เขียนแล้ว อ่านกลับตรง · savedAt ${savedAt}`);
