/**
 * 📱 เพิ่มชุดเทมเพลตเคส iPhone X / XS · XR · XS Max (เจ้าของร้านส่งไฟล์ 16 ต.ค. 69) + ผูกกับเคสพรีเมี่ยมใส/ขอบขาว-ดำ
 *
 *   npx tsx scripts/case-ix-templates.mts            # dry-run
 *   npx tsx scripts/case-ix-templates.mts --write    # อัปไฟล์ + สร้างชุด + ผูกสินค้า
 *
 * ไฟล์ต้นฉบับ: /Volumes/iDuckyShop/All Template/3. Case เคส/3.0 เคสมือถือ/iPhone/เคสพรีเมี่ยมขอบใส-ขาว-ดำ/
 *   ix uv พรีเมี่ยม.ai      → "iPhone X / XS"  ⚠️ อาร์ตบอร์ด A3 เส้นไดคัทอยู่มุมขวาล่าง → ขนาดงานใช้ ArtBox 72.6×144.9 มม. (ไฟล์อัปตามต้นฉบับ)
 *   ixr uv พรีเเมี่ยม.ai    → "iPhone XR"       79.7×154.8
 *   ixs max uv พรีเมี่ยม.ai → "iPhone XS Max"   81.4×161.4
 * สกิน/พรีวิว = PNG ที่เรนเดอร์จากเส้นไดคัท (เตรียมไว้ใน scratchpad ด้วย pymupdf) · ชื่อชุดต้องตรงค่าในกลุ่ม "รุ่นมือถือ" (calTemplates จับคู่จากชื่อ)
 * รันซ้ำได้: id ชุดคงที่ · ชุดที่มีอยู่แล้วเขียนทับ
 */
import { readFileSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const SRC = process.env.CASE_SRC ?? "/Volumes/iDuckyShop/All Template/3. Case เคส/3.0 เคสมือถือ/iPhone/เคสพรีเมี่ยมขอบใส-ขาว-ดำ";
const PNG = process.env.CASE_PNG ?? "";
if (!PNG) { console.error("✗ ตั้ง CASE_PNG=<โฟลเดอร์ที่มี <key>-skin.png / <key>-preview.png>"); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string): never => { console.error("✗", m); process.exit(1); };
const BUCKET = "design-templates";
const PRODUCTS = ["case-premium-clear", "case-premium-edge"];

const SETS = [
  { key: "ix", id: "tpl-case-ix", name: "iPhone X / XS", file: "ix uv พรีเมี่ยม.ai", widthMm: 72.6, heightMm: 144.9, sort: 167 },
  { key: "ixr", id: "tpl-case-ixr", name: "iPhone XR", file: "ixr uv พรีเเมี่ยม.ai", widthMm: 79.7, heightMm: 154.8, sort: 168 },
  { key: "ixsmax", id: "tpl-case-ixsmax", name: "iPhone XS Max", file: "ixs max uv พรีเมี่ยม.ai", widthMm: 81.4, heightMm: 161.4, sort: 169 },
];

async function upload(local: string, kind: "file" | "preview", ext: string, stem: string): Promise<string> {
  const ct = ext === "png" ? "image/png" : "application/postscript";
  const path = `${kind}/${randomUUID().slice(0, 8)}-${stem}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(local), { contentType: ct, upsert: false });
  if (error) die(`อัป ${local}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

const ids: string[] = [];
for (const s of SETS) {
  const src = `${SRC}/${s.file}`;
  const size = statSync(src).size;
  const skin = `${PNG}/${s.key}-skin.png`, prev = `${PNG}/${s.key}-preview.png`;
  statSync(skin); statSync(prev);
  const { data: old } = await sb.from("products").select("data").eq("id", `__template_${s.id}`).maybeSingle();
  console.log(`\n📐 ${s.name} (${s.id}) ← ${s.file} · ${(size / 1024).toFixed(0)} KB · ${s.widthMm}×${s.heightMm} มม.${old ? " · มีอยู่แล้ว → เขียนทับ" : " · ชุดใหม่"}`);
  ids.push(s.id);
  if (!WRITE) continue;
  const fileUrl = await upload(src, "file", "ai", `${s.key}-uv`);
  const skinUrl = await upload(skin, "preview", "png", `${s.key}-uv-skin`);
  const previewUrl = await upload(prev, "preview", "png", `${s.key}-uv-preview`);
  const tpl: DesignTemplate = {
    ...((old?.data as DesignTemplate | undefined) ?? {}),
    id: s.id, name: s.name, category: "เคสมือถือ", sort: s.sort,
    files: [{ id: `f-${s.key}-uv`, fileName: s.file, fileSize: size, fileUrl, skinUrl, previewUrl, widthMm: s.widthMm, heightMm: s.heightMm }],
    savedAt: new Date().toISOString(),
  } as DesignTemplate;
  const { error } = await sb.from("products").upsert(
    { id: `__template_${s.id}`, name: `(เทมเพลต) ${s.name}`, category: "__templates__", price: 0, sold: 0, featured: false, badge: null, sort: 0, data: tpl },
    { onConflict: "id" },
  );
  if (error) die(error.message);
  console.log(`   ✅ บันทึกชุด · ${fileUrl}`);
}

for (const pid of PRODUCTS) {
  const { data, error } = await sb.from("products").select("data").eq("id", pid).single();
  if (error || !data) die(`อ่าน ${pid} ไม่ได้: ${error?.message}`);
  const p = data.data as Product;
  const cur = p.templateIds ?? [];
  const add = ids.filter((id) => !cur.includes(id));
  console.log(`\n🔗 ${p.name}: ผูกอยู่ ${cur.length} ชุด → เพิ่ม ${add.length} (${add.join(", ") || "-"})`);
  if (!WRITE || !add.length) continue;
  const next: Product = { ...p, templateIds: [...cur, ...add], savedAt: new Date().toISOString() };
  const { error: e2 } = await sb.from("products").update({ data: next }).eq("id", pid);
  if (e2) die(e2.message);
  const { data: chk } = await sb.from("products").select("data").eq("id", pid).single();
  console.log(`   ✅ ตอนนี้ ${((chk!.data as Product).templateIds ?? []).length} ชุด`);
}
if (!WRITE) console.log("\n(dry-run — ใส่ --write เพื่อบันทึก)");
