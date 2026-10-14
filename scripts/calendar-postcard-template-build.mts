/**
 * 📐 ชุดเทมเพลต "โปสการ์ดปฏิทิน 4×6 นิ้ว" ใน /admin/templates — ไฟล์ตามชนิดกระดาษ + แนวตั้ง/แนวนอน (13 ต.ค. 69 — ผู้ใช้ขอ)
 *
 *   npx tsx scripts/calendar-postcard-template-build.mts            # สร้างไฟล์แนวนอน + พรีวิว ลงเครื่อง (ไม่อัป ไม่เขียน DB)
 *   npx tsx scripts/calendar-postcard-template-build.mts --write    # อัปไฟล์ + สร้าง/อัปเดตชุด + ผูกกับโปสการ์ดปฏิทิน
 *
 * ไฟล์ต้นฉบับ (ผู้ใช้กำหนด · ชุดใหม่ 14 ต.ค. 69 แทนชุด 13 ต.ค.):
 *   1. (2ด้าน)อาร์ตมัน 300g + - 4x6นิ้ว.ai → พิมพ์ 2 ด้าน · กระดาษทั้งหมด + PET ยกเว้นโฮโลแกรม / สีเงิน / สีทอง (2 หน้า หน้า/หลัง · ตัดตก ~1 มม.)
 *   2. (2ด้าน)holo 300g + - 4x6นิ้ว.ai     → พิมพ์ 2 ด้าน · โฮโลแกรม / กระดาษสีเงิน / กระดาษสีทอง (2 หน้า · ตัดตก ~2.5 มม.)
 *   3. อาร์ตมัน 300g + holo  - 4x6นิ้ว.ai   → พิมพ์ 1 ด้าน · กระดาษทุกชนิด (101.6×152.4 พอดีเส้นตัด)
 * แนวตั้ง = ส่ง .ai ต้นฉบับตรง ๆ · แนวนอน = สร้างใหม่ในเอกสารเดิมด้วย pdf-lib หมุน 90° ทุกหน้า (เลเยอร์ซ่อนไม่โผล่)
 * จับคู่: optionLabel "ชนิดกระดาษ" · ไฟล์เดียวหลายค่า (choices) · ทุกไฟล์ตั้ง when 2 ข้อ = "พิมพ์" (1/2 ด้าน) + "แนวโปสการ์ด"
 *   → สเปคไหนก็ได้ไฟล์เดียวพอดี (preferWhen นับจำนวน when เท่ากันทุกไฟล์)
 * ผูกกับ calendar-postcard ทาง templateIds — ⚠️ ไม่ตั้ง studioOff · รันซ้ำได้ (id คงที่ · retiredPaths เก็บไฟล์รอบก่อนไว้ 1 รอบ)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, degrees } from "pdf-lib";
import { whenList, type DesignTemplate, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";

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

const TPL_ID = "tpl-calendar-postcard";
const PRODUCT = "calendar-postcard";
const PAPER = "ชนิดกระดาษ";
const ORI = "แนวโปสการ์ด";
const SIDE = "พิมพ์";
const BUCKET = "design-templates";
const OUT = new URL("./assets/calendar-postcard-templates/", import.meta.url).pathname;
const PT = 25.4 / 72;

const DIR = "/Users/iduckshop/Desktop/testCowork2/";
const SOURCES = [
  { key: "paper2", path: `${DIR}(2ด้าน)อาร์ตมัน 300g + - 4x6นิ้ว.ai`, papers: "paper", sides: "two" },
  { key: "holo2", path: `${DIR}(2ด้าน)holo 300g + - 4x6นิ้ว.ai`, papers: "holo", sides: "two" },
  { key: "one", path: `${DIR}อาร์ตมัน 300g + holo  - 4x6นิ้ว.ai`, papers: "all", sides: "one" },
] as const;

/* ── 1. กระดาษของสินค้า → 2 กลุ่ม ── */
const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (perr || !prow) die(`อ่าน ${PRODUCT} ไม่ได้: ${perr?.message}`);
const product = prow!.data as Product;
const papers = product.options.find((o) => o.label === PAPER)?.choices.map((c) => c.name) ?? die(`${PRODUCT} ไม่มีกลุ่ม "${PAPER}"`);
const oris = product.options.find((o) => o.label === ORI)?.choices.map((c) => c.name) ?? die(`${PRODUCT} ไม่มีกลุ่ม "${ORI}"`);
if (!oris.includes("แนวตั้ง") || !oris.includes("แนวนอน")) die(`กลุ่ม "${ORI}" เปลี่ยน: ${oris}`);
const isShiny = (n: string) => /โฮโลแกรม|กระดาษสีเงิน|กระดาษสีทอง/.test(n);
const groupOf: Record<string, string[]> = { paper: papers.filter((n) => !isShiny(n)), holo: papers.filter(isShiny), all: papers };
for (const [k, v] of Object.entries(groupOf)) if (!v.length) die(`กลุ่ม ${k} ไม่มีกระดาษ`);
const sideChoices = product.options.find((o) => o.label === SIDE)?.choices.map((c) => c.name) ?? die(`${PRODUCT} ไม่มีกลุ่ม "${SIDE}"`);
const sidesOf: Record<string, string[]> = { one: sideChoices.filter((n) => /1\s*ด้าน/.test(n)), two: sideChoices.filter((n) => /2\s*ด้าน/.test(n)) };
if (!sidesOf.one.length || !sidesOf.two.length || sidesOf.one.length + sidesOf.two.length !== sideChoices.length) die(`กลุ่ม "${SIDE}" เปลี่ยน: ${sideChoices}`);

/* ── 2. ไฟล์แนวนอน + พรีวิว ── */
mkdirSync(OUT, { recursive: true });
const stem = (p: string) => p.split("/").pop()!.replace(/\.[^.]+$/, "");
async function landscape(path: string) {
  const doc = await PDFDocument.load(readFileSync(path), { ignoreEncryption: true, updateMetadata: false });
  const n = doc.getPageCount();
  const { width: W, height: H } = doc.getPage(0).getSize();
  // 4×6 นิ้วแนวตั้ง + ตัดตกไม่เกินข้างละ 3 มม. (ไฟล์ 2 ด้านมีตัดตกในอาร์ตบอร์ด)
  const okSize = (w: number, h: number) => w * PT >= 101.1 && w * PT <= 107.7 && h * PT >= 151.9 && h * PT <= 158.5;
  if (!okSize(W, H)) die(`${stem(path)} ไม่ใช่ 4×6 นิ้วแนวตั้ง (${(W * PT).toFixed(1)}×${(H * PT).toFixed(1)})`);
  // หมุนทุกหน้า (ไฟล์ 2 ด้าน = หน้า/หลัง) ต่อท้าย แล้วลบหน้าเดิม
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
  return { file, wMm: H * PT, hMm: W * PT, srcW: W * PT, srcH: H * PT };
}
function preview(file: string, key: string) {
  const tmp = `${OUT}_tmp-${key}.pdf`;
  copyFileSync(file, tmp);
  const png = `${OUT}preview-${key}.png`;
  execFileSync("sips", ["-s", "format", "png", "-Z", "1200", tmp, "--out", png], { stdio: "ignore" });
  execFileSync("rm", ["-f", tmp]);
  return png;
}
type Built = { key: string; papers: string; sides: string; ori: "P" | "L"; path: string; name: string; ext: string; wMm: number; hMm: number; png: string };
const built: Built[] = [];
for (const s of SOURCES) {
  const L = await landscape(s.path);
  built.push({ key: s.key, papers: s.papers, sides: s.sides, ori: "P", path: s.path, name: `${stem(s.path)}.ai`, ext: "ai", wMm: L.srcW, hMm: L.srcH, png: preview(s.path, `${s.key}-P`) });
  built.push({ key: s.key, papers: s.papers, sides: s.sides, ori: "L", path: L.file, name: `${stem(s.path)} (แนวนอน).pdf`, ext: "pdf", wMm: L.wMm, hMm: L.hMm, png: preview(L.file, `${s.key}-L`) });
}

/* ── 3. อัป + เขียนชุด + ผูกสินค้า ── */
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
  name: "โปสการ์ดปฏิทิน 4×6 นิ้ว (ตามกระดาษ · 1/2 ด้าน · แนวตั้ง/แนวนอน)",
  note: "ขนาด 4×6 นิ้ว (101.6×152.4 มม.) · เส้นสีแดง = เส้นตัด · วางลายเลยเส้นตัดออกไปถึงขอบอาร์ตบอร์ด · พิมพ์ 2 ด้าน = ไฟล์มี 2 หน้า (หน้า/หลัง) · เซฟเป็น .ai/.pdf โหมดสี CMYK · ตัวหนังสือ create outline",
  category: "Postcard",
  optionLabel: PAPER,
  optionProductId: PRODUCT,
  bleedMm: 2,
  safeMm: 4,
  files,
  savedAt: new Date().toISOString(),
};
console.log(`📐 ${tpl.name} (${TPL_ID}) · ${files.length} ไฟล์`);
for (const f of files)
  console.log(
    `   ${f.fileName} · ${f.widthMm}×${f.heightMm} ← ${[f.choice, ...(f.choices ?? [])].length} กระดาษ (${[f.choice, ...(f.choices ?? [])].join(", ").slice(0, 80)}…) · ${whenList(f).map((w) => `${w.label} ${w.choices.join("/")}`).join(" + ") || "ค่าเริ่มต้น (แนวตั้ง)"}`,
  );
if (!WRITE) {
  console.log(`\n(dry-run — ไฟล์แนวนอน/พรีวิวอยู่ที่ ${OUT} · ใส่ --write เพื่ออัปและบันทึก)`);
  process.exit(0);
}
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
if (!ids.includes(TPL_ID)) {
  const { error } = await sb.from("products").update({ data: { ...product, templateIds: [...ids, TPL_ID], savedAt: new Date().toISOString() } }).eq("id", PRODUCT);
  if (error) die(`ผูกกับสินค้าไม่สำเร็จ: ${error.message}`);
}
const { data: chk } = await sb.from("products").select("data").eq("id", PRODUCT).single();
const back = chk!.data as Product;
if (!back.templateIds?.includes(TPL_ID) || back.studioOff === true) die("อ่านกลับมาไม่ตรง (templateIds / studioOff)");
console.log(`   ✅ บันทึกชุดแล้ว + ผูกกับ ${PRODUCT}`);
