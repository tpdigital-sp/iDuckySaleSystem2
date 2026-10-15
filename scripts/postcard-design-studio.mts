/**
 * 🎨 โปสการ์ด (postcard-th) ออกแบบบนเว็บเหมือนแผ่นรองเมาส์ + เทมเพลต 4×6 / 5×7 นิ้ว (15 ต.ค. 69 — ผู้ใช้ขอ)
 *
 *   npx tsx scripts/postcard-design-studio.mts              # ดูผล + สร้างไฟล์แนวนอน/พรีวิวลงเครื่อง (ไม่อัป ไม่เขียน DB)
 *   npx tsx scripts/postcard-design-studio.mts --write      # อัปไฟล์ + สร้าง/อัปเดตชุดเทมเพลต + ผูกสินค้า + ตั้ง calendarStudio (ปุ่มยังปิด studioOff)
 *   npx tsx scripts/postcard-design-studio.mts --studio-on  # เปิดปุ่ม 🎨 ออกแบบบนเว็บ (ถอด studioOff) — รันหลัง deploy โค้ดรูปแบบ print@ แล้ว
 *
 * ไฟล์ต้นฉบับ (ผู้ใช้กำหนด · แก้รอบ 2 15 ต.ค. 69 ให้ไฟล์ 2 ด้านแยกตามกระดาษ):
 *   4×6 นิ้ว: อาร์ตมัน 300g + holo  - 4x6นิ้ว.ai (1 ด้าน · กระดาษทุกตัว · 101.6×152.4 พอดีเส้นตัด)
 *             (2ด้าน)อาร์ตมัน 300g + - 4x6นิ้ว.ai (2 ด้าน · ทุกกระดาษยกเว้นโฮโลแกรม/สีเงิน/สีทอง · ตัดตก 1 มม.)
 *             (2ด้าน)holo 300g + - 4x6นิ้ว.ai (2 ด้าน · โฮโลแกรม/สีเงิน/สีทอง · ตัดตก 2.5 มม.)
 *   5×7 นิ้ว: อาร์ตมัน 300g + - 5x7นิ้ว.ai (1 ด้าน · ทุกตัว · 127.5×178.3) · (2ด้าน)อาร์ตมัน 300g + - 5x7นิ้ว.ai (ยกเว้นโฮโล/เงิน/ทอง · ตัดตก 1) · (2ด้าน)holo 300g + - 5x7นิ้ว.ai (โฮโล/เงิน/ทอง · ตัดตก 2.5)
 * ชุดเทมเพลต tpl-postcard · optionLabel "ชนิดกระดาษ" · ไฟล์เดียวหลายค่า (choice + choices) เหมือน calendar-postcard-template-build
 *   when 3 ข้อทุกไฟล์ = "ขนาด" + "จำนวนด้านที่พิมพ์" + "แนวโปสการ์ด" → สเปคไหนก็ได้ไฟล์เดียวพอดี (preferWhen นับจำนวน when เท่ากัน)
 *   แนวตั้ง = .ai ต้นฉบับ · แนวนอน = สร้างใหม่ด้วย pdf-lib หมุน 90° ทุกหน้า
 *
 * Product.calendarStudio = { yearLabel: "", formats: ขนาด × แนว × ด้าน → "print@<กว้าง>x<สูง>" / "print2@…" (มม. งานหลังตัด) }
 *   รูปแบบ print@ อยู่ใน lib/calendar-card (ยังไม่ขึ้นเว็บจริงจนกว่าจะ deploy) → --write ตั้ง studioOff: true กันหน้าเว็บจริงเปิดจอด้วยรูปแบบที่โค้ดเก่าไม่รู้จัก
 *   เปิดปุ่มทีหลังด้วย --studio-on หรือสวิตช์ 🎨 วางลายเอง ใน /admin/templates / หน้าแก้ไขสินค้า
 * รันซ้ำได้ (id ชุดคงที่ · retiredPaths เก็บไฟล์รอบก่อน 1 รอบ)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, degrees } from "pdf-lib";
import { whenList, type DesignTemplate, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const STUDIO_ON = process.argv.includes("--studio-on");
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

const TPL_ID = "tpl-postcard";
const PRODUCT = "postcard-th";
const PAPER = "ชนิดกระดาษ";
const SIZE = "ขนาด";
const ORI = "แนวโปสการ์ด";
const SIDE = "จำนวนด้านที่พิมพ์";
const BUCKET = "design-templates";
const OUT = new URL("./assets/postcard-templates/", import.meta.url).pathname;
const PT = 25.4 / 72;
const IN = 25.4;

const DIR = "/Users/iduckshop/Desktop/testCowork2/";
/** ขนาดงานหลังตัด (มม. แนวตั้ง) ตามชื่อตัวเลือก "ขนาด" */
const SIZES: { choice: RegExp; w: number; h: number; tag: string }[] = [
  { choice: /^4\s*[x×]\s*6/, w: 4 * IN, h: 6 * IN, tag: "4x6" },
  { choice: /^5\s*[x×]\s*7/, w: 5 * IN, h: 7 * IN, tag: "5x7" },
];
const SOURCES = [
  { key: "4x6-one", size: "4x6", sides: "one", papers: "all", path: `${DIR}อาร์ตมัน 300g + holo  - 4x6นิ้ว.ai` },
  { key: "4x6-paper2", size: "4x6", sides: "two", papers: "paper", path: `${DIR}(2ด้าน)อาร์ตมัน 300g + - 4x6นิ้ว.ai` },
  { key: "4x6-holo2", size: "4x6", sides: "two", papers: "holo", path: `${DIR}(2ด้าน)holo 300g + - 4x6นิ้ว.ai` },
  { key: "5x7-one", size: "5x7", sides: "one", papers: "all", path: `${DIR}อาร์ตมัน 300g + - 5x7นิ้ว.ai` },
  { key: "5x7-paper2", size: "5x7", sides: "two", papers: "paper", path: `${DIR}(2ด้าน)อาร์ตมัน 300g + - 5x7นิ้ว.ai` },
  { key: "5x7-holo2", size: "5x7", sides: "two", papers: "holo", path: `${DIR}(2ด้าน)holo 300g + - 5x7นิ้ว.ai` },
] as const;

/* ── 1. ตัวเลือกของสินค้า ── */
const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (perr || !prow) die(`อ่าน ${PRODUCT} ไม่ได้: ${perr?.message}`);
const product = prow!.data as Product;
const opt = (label: string) => product.options.find((o) => o.label === label)?.choices.map((c) => c.name) ?? die(`${PRODUCT} ไม่มีกลุ่ม "${label}"`);
const sizeChoices = opt(SIZE);
const papers = opt(PAPER);
const isShiny = (n: string) => /โฮโลแกรม|กระดาษสีเงิน|กระดาษสีทอง/.test(n);
const groupOf: Record<string, string[]> = { paper: papers.filter((n) => !isShiny(n)), holo: papers.filter(isShiny), all: papers };
for (const [k, v] of Object.entries(groupOf)) if (!v.length) die(`กลุ่มกระดาษ ${k} ว่าง`);
if (groupOf.holo.length !== 6) die(`กระดาษโฮโลแกรม/เงิน/ทอง ควรมี 6 ตัว ได้ ${groupOf.holo.length}: ${groupOf.holo}`);
const oris = opt(ORI);
const sideChoices = opt(SIDE);
if (!oris.includes("แนวตั้ง") || !oris.includes("แนวนอน")) die(`กลุ่ม "${ORI}" เปลี่ยน: ${oris}`);
const sizeNameOf = (tag: string) => {
  const sz = SIZES.find((s) => s.tag === tag)!;
  return sizeChoices.find((n) => sz.choice.test(n)) ?? die(`ไม่มีตัวเลือกขนาด ${tag} ใน "${SIZE}": ${sizeChoices}`);
};
const sidesOf: Record<string, string[]> = { one: sideChoices.filter((n) => /1\s*ด้าน/.test(n)), two: sideChoices.filter((n) => /2\s*ด้าน/.test(n)) };
if (!sidesOf.one.length || !sidesOf.two.length || sidesOf.one.length + sidesOf.two.length !== sideChoices.length) die(`กลุ่ม "${SIDE}" เปลี่ยน: ${sideChoices}`);

/* ── --studio-on: แค่ถอด studioOff ── */
if (STUDIO_ON) {
  if (!product.calendarStudio?.formats?.length) die("สินค้ายังไม่มี calendarStudio — รัน --write ก่อน");
  if (!product.templateIds?.includes(TPL_ID)) die(`สินค้ายังไม่ได้ผูกชุด ${TPL_ID} — รัน --write ก่อน`);
  if (product.studioOff !== true) {
    console.log("✅ ปุ่ม 🎨 ออกแบบบนเว็บ เปิดอยู่แล้ว");
    process.exit(0);
  }
  const { studioOff: _off, ...rest } = product;
  const { error } = await sb.from("products").update({ data: { ...rest, savedAt: new Date().toISOString() } }).eq("id", PRODUCT);
  if (error) die(error.message);
  console.log(`✅ เปิดปุ่ม 🎨 ออกแบบบนเว็บ ของ ${product.name} แล้ว (ถอด studioOff) — หน้าเว็บจริงแคช 1 ชม. ถ้าอยากเห็นทันทีให้บันทึกสินค้าจากหลังบ้าน 1 ครั้ง`);
  process.exit(0);
}

/* ── 2. ไฟล์แนวนอน + พรีวิว ── */
mkdirSync(OUT, { recursive: true });
const stem = (p: string) => p.split("/").pop()!.replace(/\.[^.]+$/, "");
async function landscape(path: string, size: { w: number; h: number }) {
  const doc = await PDFDocument.load(readFileSync(path), { ignoreEncryption: true, updateMetadata: false });
  const n = doc.getPageCount();
  const { width: W, height: H } = doc.getPage(0).getSize();
  // แนวตั้งขนาดตรงตัวเลือก + ตัดตกไม่เกินข้างละ 3 มม. (ไฟล์ 2 ด้านมีตัดตกในอาร์ตบอร์ด)
  const okSize = (w: number, h: number) => w * PT >= size.w - 0.5 && w * PT <= size.w + 6.1 && h * PT >= size.h - 0.5 && h * PT <= size.h + 6.1;
  if (!okSize(W, H)) die(`${stem(path)} ไม่ใช่ ${size.w}×${size.h} มม. แนวตั้ง (${(W * PT).toFixed(1)}×${(H * PT).toFixed(1)})`);
  for (let i = 0; i < n; i++) {
    const page = doc.getPage(i);
    const s = page.getSize();
    if (Math.abs(s.width - W) > 0.5 || Math.abs(s.height - H) > 0.5) die(`${stem(path)} หน้า ${i + 1} ขนาดไม่เท่าหน้าแรก`);
    const card = await doc.embedPage(page);
    const out = doc.addPage([H, W]);
    out.drawPage(card, { x: H, y: 0, rotate: degrees(90) });
  }
  for (let i = 0; i < n; i++) doc.removePage(0);
  const file = `${OUT}${stem(path)} (แนวนอน).pdf`;
  writeFileSync(file, await doc.save());
  return { file, wMm: H * PT, hMm: W * PT, srcW: W * PT, srcH: H * PT, pages: n };
}
function preview(file: string, key: string) {
  const tmp = `${OUT}_tmp-${key}.pdf`;
  copyFileSync(file, tmp);
  const png = `${OUT}preview-${key}.png`;
  execFileSync("sips", ["-s", "format", "png", "-Z", "1200", tmp, "--out", png], { stdio: "ignore" });
  execFileSync("rm", ["-f", tmp]);
  return png;
}
type Built = { key: string; size: string; sides: string; papers: string; ori: "P" | "L"; path: string; name: string; ext: string; wMm: number; hMm: number; png: string };
const built: Built[] = [];
for (const s of SOURCES) {
  const sz = SIZES.find((x) => x.tag === s.size)!;
  const L = await landscape(s.path, sz);
  if ((s.sides === "two") !== (L.pages === 2)) die(`${stem(s.path)} มี ${L.pages} หน้า ไม่ตรงกับพิมพ์ ${s.sides === "two" ? 2 : 1} ด้าน`);
  built.push({ key: s.key, size: s.size, sides: s.sides, papers: s.papers, ori: "P", path: s.path, name: `${stem(s.path)}.ai`, ext: "ai", wMm: L.srcW, hMm: L.srcH, png: preview(s.path, `${s.key}-P`) });
  built.push({ key: s.key, size: s.size, sides: s.sides, papers: s.papers, ori: "L", path: L.file, name: `${stem(s.path)} (แนวนอน).pdf`, ext: "pdf", wMm: L.wMm, hMm: L.hMm, png: preview(L.file, `${s.key}-L`) });
}

/* ── 3. ชุดเทมเพลต ── */
async function upload(local: string, kind: "file" | "preview", ext: string): Promise<string> {
  const ct = ext === "png" ? "image/png" : ext === "pdf" ? "application/pdf" : "application/postscript";
  const safe = stem(local).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 50) || "template";
  const path = `${kind}/${randomUUID().slice(0, 8)}-${safe}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(local), { contentType: ct, upsert: false });
  if (error) die(`อัป ${local}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
const files: TemplateFile[] = [];
for (const b of built) {
  const group = groupOf[b.papers];
  files.push({
    id: `${TPL_ID}-${b.key}-${b.ori}`,
    choice: group[0],
    ...(group.length > 1 ? { choices: group.slice(1) } : {}),
    when: [
      { label: SIZE, choices: [sizeNameOf(b.size)] },
      { label: SIDE, choices: sidesOf[b.sides] },
      { label: ORI, choices: [b.ori === "L" ? "แนวนอน" : "แนวตั้ง"] },
    ],
    fileUrl: WRITE ? await upload(b.path, "file", b.ext) : `(dry-run) ${b.name}`,
    fileName: b.name,
    fileSize: readFileSync(b.path).length,
    ...(WRITE ? { previewUrl: await upload(b.png, "preview", "png") } : {}),
    widthMm: Math.round(b.wMm * 10) / 10,
    heightMm: Math.round(b.hMm * 10) / 10,
  });
}
const tpl: DesignTemplate = {
  id: TPL_ID,
  name: "โปสการ์ด 4×6 / 5×7 นิ้ว (ตามกระดาษ · 1/2 ด้าน · แนวตั้ง/แนวนอน)",
  note: "พิมพ์ 1 ด้านใช้ไฟล์เดียวกันทุกกระดาษ · พิมพ์ 2 ด้าน โฮโลแกรม/สีเงิน/สีทอง ใช้ไฟล์ holo (ตัดตก 2.5 มม.) กระดาษอื่นใช้ไฟล์อาร์ตมัน (ตัดตก 1 มม.) · เส้นสีแดง = เส้นตัด · วางลายเลยเส้นตัดออกไปถึงขอบอาร์ตบอร์ด · พิมพ์ 2 ด้าน = ไฟล์มี 2 หน้า (หน้า/หลัง) · เซฟเป็น .ai/.pdf โหมดสี CMYK · ตัวหนังสือ create outline",
  category: "Postcard",
  optionLabel: PAPER,
  optionProductId: PRODUCT,
  bleedMm: 2,
  safeMm: 4,
  files,
  savedAt: new Date().toISOString(),
};

/* ── 4. รูปแบบจอออกแบบ (ขนาด × แนว × ด้าน) ── */
const formats = SIZES.flatMap((sz) =>
  (["แนวตั้ง", "แนวนอน"] as const).flatMap((ori) =>
    (["one", "two"] as const).map((sides) => {
      const [w, h] = ori === "แนวนอน" ? [sz.h, sz.w] : [sz.w, sz.h];
      const r = (v: number) => Math.round(v * 10) / 10;
      return {
        format: `print${sides === "two" ? "2" : ""}@${r(w)}x${r(h)}`,
        when: [
          { label: SIZE, choices: [sizeNameOf(sz.tag)] },
          { label: ORI, choices: [ori] },
          { label: SIDE, choices: sidesOf[sides] },
        ],
      };
    }),
  ),
);

console.log(`📐 ${tpl.name} (${TPL_ID}) · ${files.length} ไฟล์`);
for (const f of files)
  console.log(`   ${f.fileName} · ${f.widthMm}×${f.heightMm} ← ${[f.choice, ...(f.choices ?? [])].length} กระดาษ (${[f.choice, ...(f.choices ?? [])].join(", ").slice(0, 60)}…) · ${whenList(f).map((w) => `${w.label} ${w.choices.join("/")}`).join(" + ")}`);
console.log(`🎨 ${product.name} (${PRODUCT}) calendarStudio.formats`);
for (const f of formats) console.log(`   ${f.when.map((w) => w.choices.join("/")).join(" · ")} → ${f.format}`);
if (!WRITE) {
  console.log(`\n(dry-run — ไฟล์แนวนอน/พรีวิวอยู่ที่ ${OUT} · ใส่ --write เพื่ออัปและบันทึก)`);
  process.exit(0);
}

/* ── 5. เขียนชุด + ผูกสินค้า + calendarStudio (ปุ่มปิดไว้ก่อน) ── */
const { data: oldRow } = await sb.from("products").select("data").eq("id", `__template_${TPL_ID}`).maybeSingle();
const oldTpl = oldRow?.data as (DesignTemplate & { retiredPaths?: string[] }) | undefined;
const pathsOf = (fs: TemplateFile[]) => fs.flatMap((f) => [f.fileUrl, f.previewUrl]).map((u) => (u ? u.split(`/${BUCKET}/`)[1] : undefined)).filter(Boolean) as string[];
const nowPaths = new Set(pathsOf(files));
const prevPaths = [...new Set(pathsOf(oldTpl?.files ?? []).filter((x) => !nowPaths.has(x)))];
const oldPaths = (oldTpl?.retiredPaths ?? []).filter((x) => !nowPaths.has(x) && !prevPaths.includes(x));
(tpl as DesignTemplate & { retiredPaths?: string[] }).retiredPaths = prevPaths;
const { error: tErr } = await sb.from("products").upsert(
  { id: `__template_${TPL_ID}`, name: `(เทมเพลต) ${tpl.name}`.slice(0, 120), category: "__templates__", price: 0, data: tpl },
  { onConflict: "id" },
);
if (tErr) die(`บันทึกชุดไม่สำเร็จ: ${tErr.message}`);
if (oldPaths.length) await sb.storage.from(BUCKET).remove(oldPaths);

const ids = product.templateIds ?? [];
const hadStudio = !!product.calendarStudio;
const next: Product = {
  ...product,
  templateIds: ids.includes(TPL_ID) ? ids : [...ids, TPL_ID],
  calendarStudio: { yearLabel: "", formats },
  // ครั้งแรก = ปิดปุ่มไว้จน deploy โค้ด print@ (ถ้าเคยเปิดอยู่แล้ว ไม่แตะ)
  ...(hadStudio ? {} : { studioOff: true }),
  savedAt: new Date().toISOString(),
};
const { error: pErr } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
if (pErr) die(`บันทึกสินค้าไม่สำเร็จ: ${pErr.message}`);
const { data: chk } = await sb.from("products").select("data").eq("id", PRODUCT).single();
const back = chk!.data as Product;
if (!back.templateIds?.includes(TPL_ID) || back.calendarStudio?.formats?.length !== formats.length) die("อ่านกลับมาไม่ตรง (templateIds / calendarStudio)");
console.log(`   ✅ บันทึกชุดแล้ว + ผูกกับ ${PRODUCT} + ตั้ง calendarStudio ${formats.length} รูปแบบ`);
if (back.studioOff === true) console.log("   ⏸ ปุ่ม 🎨 ออกแบบบนเว็บ ยังปิด (studioOff) — deploy โค้ดแล้วรัน --studio-on หรือเปิดสวิตช์ 🎨 วางลายเอง ใน /admin/templates");
