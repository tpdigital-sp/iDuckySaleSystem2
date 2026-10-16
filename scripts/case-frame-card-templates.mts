/**
 * 📱 เทมเพลต Case Frame Card — ธรรมดา + Magsafe (เจ้าของร้านสั่ง 16 ต.ค. 69) + ผูกกับสินค้า case-frame-card
 *
 *   tools/cutout-py/.venv/bin/python -I scripts/py/case-frame-card-skins.py <PNG>   # เรนเดอร์สกิน/พรีวิวก่อน
 *   CASE_PNG=<PNG> npx tsx scripts/case-frame-card-templates.mts            # dry-run
 *   CASE_PNG=<PNG> npx tsx scripts/case-frame-card-templates.mts --write    # อัปไฟล์ + สร้างชุด + ผูกสินค้า
 *
 * ไฟล์ต้นฉบับ: /Volumes/iDuckyShop/All Template/3. Case เคส/3.0 เคสมือถือ/iPhone/
 *   case frame/<รุ่น>.ai                  → ประเภทเคส "ธรรมดา"  (11 · 12 · 13 mini · 13-14-15 · 13P–16PM = 14 ไฟล์)
 *   case frame ms/case frame ms/<รุ่น> ms.ai → ประเภทเคส "Magsafe" (13-14-15 · 13P–16PM · 17 · 17 Air · 17P · 17PM = 15 ไฟล์)
 *
 * โครง: 1 ชุด = 1 รุ่น (ชื่อชุด = ค่าในกลุ่ม "รุ่นมือถือ" ของสินค้า เพื่อให้ calTemplates/tplModelMissing จับคู่จากชื่อได้)
 *   ในชุดมีไฟล์ได้ 2 ไฟล์ แยกด้วย TemplateFile.when { label: "ประเภทเคส", choices: ["ธรรมดา"|"Magsafe"] }
 *   → ลูกค้าเลือกประเภทไหน filesForSelections คืนไฟล์ของประเภทนั้นไฟล์เดียว (ไม่โผล่ 2 ไฟล์จนเข้าใจว่าหน้า-หลัง)
 *   หมวด "Frame PhoneCase" (มีในรายชื่อหมวดอยู่แล้ว) แยกจาก "เคสมือถือ" ของเคสพรีเมี่ยมที่ชื่อชุดซ้ำกัน (iPhone 16 ฯลฯ)
 * ขนาดงาน: อาร์ตบอร์ดทุกไฟล์ 99.9×179.3 มม. แต่เส้นไดคัทจริงอยู่ใน ArtBox (ต่างกันตามรุ่น)
 *   → widthMm/heightMm = ArtBox (+เผื่อเส้น 1pt) จาก sizes.json ที่สคริปต์ python เขียนไว้ · สกิน = ครอป ArtBox พื้นโปร่ง
 * ไม่แตะ studioOff (สินค้านี้ปิดวางลายบนเว็บอยู่ = true) และไม่ตั้ง calendarStudio — เจ้าของร้านเลือกเองว่าจะเปิดเมื่อไร
 * รันซ้ำได้: id ชุดคงที่ (tpl-cfc-<key>) · ชุดที่มีอยู่แล้วเขียนทับ · ผูกเฉพาะ id ที่ยังไม่มี
 */
import { readFileSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { DesignTemplate, TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const BASE = process.env.CASE_SRC ?? "/Volumes/iDuckyShop/All Template/3. Case เคส/3.0 เคสมือถือ/iPhone";
const SRC = { plain: `${BASE}/case frame`, ms: `${BASE}/case frame ms/case frame ms` } as const;
const PNG = process.env.CASE_PNG ?? "";
if (!PNG) { console.error("✗ ตั้ง CASE_PNG=<โฟลเดอร์ที่ python เขียน <key>-<type>-skin.png / -preview.png / sizes.json>"); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string): never => { console.error("✗", m); process.exit(1); };
const BUCKET = "design-templates";
const PRODUCT = "case-frame-card";
const CATEGORY = "Frame PhoneCase";
const TYPE_LABEL = "ประเภทเคส";
const MODEL_LABEL = "รุ่นมือถือ";
type Typ = keyof typeof SRC;
const TYPE_CHOICE: Record<Typ, string> = { plain: "ธรรมดา", ms: "Magsafe" };
const sizes = JSON.parse(readFileSync(`${PNG}/sizes.json`, "utf8")) as Record<string, { file: string; widthMm: number; heightMm: number }>;

/** key = ชื่อไฟล์ตัดนามสกุล/" ms" (16+ → 16plus) · name = ค่าในกลุ่ม "รุ่นมือถือ" ของสินค้าตรงตัว · types = ประเภทที่มีไฟล์ */
const SETS: { key: string; name: string; types: Typ[] }[] = [
  { key: "11", name: "iPhone 11", types: ["plain"] },
  { key: "12", name: "iPhone 12", types: ["plain"] },
  { key: "13mini", name: "iPhone 13 Mini", types: ["plain"] },
  { key: "13-14-15", name: "iPhone 13 / 14 / 15", types: ["plain", "ms"] },
  { key: "13p", name: "iPhone 13 Pro", types: ["plain", "ms"] },
  { key: "13pm", name: "iPhone 13 Pro Max", types: ["plain", "ms"] },
  { key: "14p", name: "iPhone 14 Pro", types: ["plain", "ms"] },
  { key: "14pm", name: "iPhone 14 Pro Max", types: ["plain", "ms"] },
  { key: "15p", name: "iPhone 15 Pro", types: ["plain", "ms"] },
  { key: "15pm", name: "iPhone 15 Pro Max", types: ["plain", "ms"] },
  { key: "16", name: "iPhone 16", types: ["plain", "ms"] },
  { key: "16plus", name: "iPhone 16 Plus", types: ["plain", "ms"] },
  { key: "16p", name: "iPhone 16 Pro", types: ["plain", "ms"] },
  { key: "16pm", name: "iPhone 16 Pro Max", types: ["plain", "ms"] },
  { key: "17", name: "iPhone 17", types: ["ms"] },
  { key: "17air", name: "iPhone 17 Air", types: ["ms"] },
  { key: "17p", name: "iPhone 17 Pro / 18 Pro", types: ["ms"] },
  { key: "17pm", name: "iPhone 17 Pro Max / 18 Pro Max", types: ["ms"] },
];

// ด่าน: ชื่อชุดต้องจับคู่กับค่าในกลุ่มรุ่นของสินค้าได้จริง (กติกาเดียวกับ calTemplates ใน ProductDetail)
const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (perr || !prow) die(`อ่าน ${PRODUCT} ไม่ได้: ${perr?.message}`);
const product = prow.data as Product;
const norm = (v: string) => v.toLowerCase().replace(/iphone/g, "").replace(/[\s\-_]/g, "");
const modelKeys = new Set((product.options.find((o) => o.label === MODEL_LABEL)?.choices ?? []).flatMap((c) => c.name.split("/").map(norm)));
const typeChoices = product.options.find((o) => o.label === TYPE_LABEL)?.choices.map((c) => c.name) ?? [];
for (const t of Object.values(TYPE_CHOICE)) if (!typeChoices.includes(t)) die(`สินค้าไม่มีค่า "${t}" ในกลุ่ม ${TYPE_LABEL}`);
for (const s of SETS) {
  const keys = s.name.split("/").map(norm).filter(Boolean);
  if (!keys.some((k) => modelKeys.has(k))) die(`ชื่อชุด "${s.name}" ไม่ตรงค่ารุ่นไหนในสินค้า`);
  for (const typ of s.types) { const k = `${s.key}-${typ}`; if (!sizes[k]) die(`ไม่มีขนาดของ ${k} ใน sizes.json`); statSync(`${PNG}/${k}-skin.png`); statSync(`${PNG}/${k}-preview.png`); statSync(`${SRC[typ]}/${sizes[k].file}`); }
}

async function upload(local: string, kind: "file" | "preview", ext: string, stem: string): Promise<string> {
  const ct = ext === "png" ? "image/png" : "application/postscript";
  const path = `${kind}/${randomUUID().slice(0, 8)}-${stem}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(local), { contentType: ct, upsert: false });
  if (error) die(`อัป ${local}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

const ids: string[] = [];
let sort = 200;
for (const s of SETS) {
  const id = `tpl-cfc-${s.key}`;
  ids.push(id);
  const { data: old } = await sb.from("products").select("data").eq("id", `__template_${id}`).maybeSingle();
  console.log(`\n📐 ${s.name} (${id}) · sort ${sort}${old ? " · มีอยู่แล้ว → เขียนทับ" : " · ชุดใหม่"}`);
  const files: TemplateFile[] = [];
  for (const typ of s.types) {
    const k = `${s.key}-${typ}`;
    const sz = sizes[k];
    const src = `${SRC[typ]}/${sz.file}`;
    const size = statSync(src).size;
    console.log(`   ${TYPE_CHOICE[typ].padEnd(7)} ← ${sz.file} · ${(size / 1024).toFixed(0)} KB · ${sz.widthMm}×${sz.heightMm} มม.`);
    if (!WRITE) continue;
    const stem = `cfc-${s.key}-${typ}`;
    const fileUrl = await upload(src, "file", "ai", stem);
    const skinUrl = await upload(`${PNG}/${k}-skin.png`, "preview", "png", `${stem}-skin`);
    const previewUrl = await upload(`${PNG}/${k}-preview.png`, "preview", "png", `${stem}-preview`);
    files.push({
      id: `f-${stem}`, fileName: sz.file, fileSize: size, fileUrl, skinUrl, previewUrl,
      widthMm: sz.widthMm, heightMm: sz.heightMm,
      when: { label: TYPE_LABEL, choices: [TYPE_CHOICE[typ]] },
    });
  }
  if (WRITE) {
    const tpl: DesignTemplate = {
      ...((old?.data as DesignTemplate | undefined) ?? {}),
      id, name: s.name, category: CATEGORY, sort,
      note: `Case Frame Card · ${s.types.map((t) => TYPE_CHOICE[t]).join(" + ")}`,
      files,
      savedAt: new Date().toISOString(),
    } as DesignTemplate;
    const { error } = await sb.from("products").upsert(
      { id: `__template_${id}`, name: `(เทมเพลต) ${s.name}`, category: "__templates__", price: 0, sold: 0, featured: false, badge: null, sort: 0, data: tpl },
      { onConflict: "id" },
    );
    if (error) die(error.message);
    console.log(`   ✅ บันทึกชุด ${files.length} ไฟล์`);
  }
  sort += 1;
}

const cur = product.templateIds ?? [];
const add = ids.filter((id) => !cur.includes(id));
console.log(`\n🔗 ${product.name}: ผูกอยู่ ${cur.length} ชุด → เพิ่ม ${add.length} · studioOff=${String(product.studioOff)} (ไม่แตะ)`);
if (WRITE && add.length) {
  const { data: fresh } = await sb.from("products").select("data").eq("id", PRODUCT).single();
  const p = fresh!.data as Product;
  const next: Product = { ...p, templateIds: [...(p.templateIds ?? []), ...add], savedAt: new Date().toISOString() };
  const { error } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
  if (error) die(error.message);
  const { data: chk } = await sb.from("products").select("data").eq("id", PRODUCT).single();
  console.log(`   ✅ ตอนนี้ ${((chk!.data as Product).templateIds ?? []).length} ชุด`);
}
if (!WRITE) console.log("\n(dry-run — ใส่ --write เพื่อบันทึก)");
