// แผ่นอะคริลิค (acrylic-sheet) — แทนแกลเลอรีด้วยภาพสร้างจาก Gemini ชุดใหม่ 8 ใบ (เจ้าของร้านสั่ง "ออกแบบภาพให้ใหม่" 16 ก.ย. 69)
// ใช้: node scripts/acrylic-sheet-ai-gallery.mjs <dir มี png 8 ใบ> [--apply]
// ลำดับ: ชุด AI 8 ใบ (ใบแรกเป็นปก imageSrc) + รูปถ่ายจริงเดิม 4 ใบ (1600×1200) ต่อท้าย = 12 พอดีเพดาน ProductEditor
// สำรอง images เดิมไว้ที่ .cache/acrylic-sheet-ai/backup-images-<เวลา>.json ก่อนเขียน · เปลี่ยนภาพต้องขยับ V (CDN แคชชื่อไฟล์เดิม)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const [DIR] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const die = (m) => { console.error("✗", m); process.exit(1); };
if (!DIR) die("ใช้: node scripts/acrylic-sheet-ai-gallery.mjs <dir> [--apply]");
const ID = "acrylic-sheet", EXPECT = "แผ่นอะคริลิค", V = "v2", MAX_PHOTOS = 12;
const NEW = [
  { local: "hero-hand-glitter", file: `ai-hero-glitter-bear-${V}.jpg`, label: "" },
  { local: "material-lineup", file: `ai-material-lineup-${V}.jpg`, label: "" },
  { local: "thickness-stack", file: `ai-thickness-1-2-3mm-${V}.jpg`, label: "" },
  { local: "clear-pieces-window", file: `ai-clear-pieces-${V}.jpg`, label: "" },
  { local: "holographic-sparkle", file: `ai-holographic-${V}.jpg`, label: "" },
  { local: "white-c02-set", file: `ai-white-c02-${V}.jpg`, label: "" },
  { local: "sheet-to-pieces", file: `ai-sheet-to-pieces-${V}.jpg`, label: "" },
  { local: "colored-solid-mix", file: `ai-solid-colors-${V}.jpg`, label: "" },
];
const KEEP_OLD = ["photo-glitter-round-hand-v1.jpg", "photo-glitter-charms-tray-v1.jpg", "photo-butterfly-pieces-v1.jpg", "photo-purple-piece-hand-v1.jpg"];
const urlOf = (f) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;
const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
if (row.name !== EXPECT) die(`สินค้า ${ID} ชื่อ "${row.name}" ไม่ใช่ "${EXPECT}"`);
const d = row.data;
const imgs = Array.isArray(d.images) ? d.images : [];
const base = imgs[0] ?? { emoji: "🔷", gradient: "from-sky-100 to-teal-200" };
const kept = KEEP_OLD.map((f) => imgs.find((g) => g.src === urlOf(f))).filter(Boolean);
console.log(`# ${row.name} ตอนนี้ ${imgs.length} รูป · จะเป็น ${NEW.length} ใหม่ + เก็บเดิม ${kept.length} = ${NEW.length + kept.length}`);
if (NEW.length + kept.length > MAX_PHOTOS) die(`เกิน ${MAX_PHOTOS}`);
if (!APPLY) { console.log(NEW.map((n) => "  + " + n.file).join("\n")); console.log("dry-run — ใส่ --apply เพื่อเขียนจริง"); process.exit(0); }
mkdirSync(".cache/acrylic-sheet-ai", { recursive: true });
const bk = `.cache/acrylic-sheet-ai/backup-images-${Date.now()}.json`;
writeFileSync(bk, JSON.stringify({ imageSrc: d.imageSrc, images: imgs }, null, 1));
console.log("  💾 สำรองเดิม →", bk);
const added = [];
for (const n of NEW) {
  const buf = await sharp(join(DIR, n.local + ".png")).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${n.file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`upload ${n.file}: ${up.error.message}`);
  const head = await fetch(urlOf(n.file), { method: "HEAD" });
  if (!head.ok) die(`ดึง ${n.file} ไม่ได้ ${head.status}`);
  console.log(`  ↑ ${n.file} ${(buf.length / 1024).toFixed(0)} KB`);
  added.push({ ...base, src: urlOf(n.file), label: n.label });
}
const images = [...added, ...kept];
const savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...d, images, imageSrc: images[0].src, savedAt } }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
const ok = b.savedAt === savedAt && b.images.length === images.length && b.imageSrc === images[0].src && images.every((a, i) => b.images[i]?.src === a.src);
if (!ok) die(`อ่านกลับไม่ตรง: ${JSON.stringify(b.images.map((g) => g.src.split("/").pop()))}`);
console.log(`  ✓ เขียนแล้ว อ่านกลับตรง ${b.images.length} รูป ปก=${b.imageSrc.split("/").pop()}\nเสร็จ`);
