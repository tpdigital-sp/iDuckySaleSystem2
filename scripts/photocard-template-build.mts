/**
 * 📐 ชุดเทมเพลต "Photocard ปฏิทิน" ใน /admin/templates — ไฟล์ตามชนิดกระดาษ + แนวตั้ง/แนวนอน (13 ต.ค. 69 — ผู้ใช้ขอ)
 *
 *   npx tsx scripts/photocard-template-build.mts            # สร้างไฟล์แนวนอน + พรีวิว ลงเครื่อง (ไม่อัป ไม่เขียน DB)
 *   npx tsx scripts/photocard-template-build.mts --write    # อัปไฟล์ + สร้าง/อัปเดตชุด + ผูกกับปฏิทินโฟโต้การ์ด
 *
 * ไฟล์ต้นฉบับ (ผู้ใช้กำหนด):
 *   1. Photocard 300g + - 20 ชิ้น.ai     → กระดาษทั้งหมด ยกเว้น PET / โฮโลแกรม / สีเงิน / สีทอง
 *   2. Photocard PET ใส -.ai             → PET (ขาว / ใส — ตัวเลือกกระดาษเดียวกัน "พลาสติก PET 250 แกรม")
 *   3. Photocard holo(rainbow) 300g.ai   → โฮโลแกรม / กระดาษสีเงิน / กระดาษสีทอง
 * ทุกไฟล์สร้างใหม่เป็น PDF (pdf-lib) เหลือแค่กรอบการ์ด + ตัดตก 1.05 มม. (ไม่มีหัวข้อ/คำอธิบาย) · แนวนอนหมุน 90° เป็น 85×55
 *   (ตำแหน่งการ์ดวัดจากเส้นตัดสีแดงของไฟล์จริง · PDF ใหม่ไม่มี AIPrivateData → Illustrator เปิดตามที่หมุน)
 * จับคู่: optionLabel "ชนิดกระดาษ" · ไฟล์เดียวหลายค่า (TemplateFile.choices) · แนวนอน = when { แนวการ์ด: แนวนอน }
 *   ไฟล์แนวตั้งไม่ตั้ง when = ค่าเริ่มต้น (preferWhen ใน design-templates เลือกไฟล์แนวนอนเมื่อเลือกแนวนอน)
 * ผูกกับ calendar-photocard ทาง templateIds — ⚠️ ไม่ตั้ง studioOff (ตั้งแล้วจอสร้างปฏิทินปิดไปด้วย)
 * รันซ้ำได้: id ชุดคงที่ · อัปไฟล์ใหม่ทุกครั้ง (ชื่อสุ่ม) แล้วเขียนทับชุด
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import { whenList, type DesignTemplate, type TemplateFile, type TemplateWhen } from "../src/lib/design-templates";
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

const TPL_ID = "tpl-calendar-photocard";
const PRODUCT = "calendar-photocard";
const PAPER = "ชนิดกระดาษ";
const ORI = "แนวการ์ด";
const CORNER = "มุม";
const BUCKET = "design-templates";
const OUT = new URL("./assets/photocard-templates/", import.meta.url).pathname;
const PT = 25.4 / 72;
/**
 * ตัดตกรอบเส้นตัด 2.5 มม. → อาร์ตบอร์ด 60×90 มม. = มาตรฐานไฟล์ผลิตจริงของร้าน (วัดจากงานโฮโลแกรม 597 ชิ้น · 13 ต.ค. 69)
 * เดิม 1.05 (เท่าเทมเพลต Photocard 300g เก่า) — ภาพเลยเส้นตัดน้อยเกิน · ต้องตรงกับ CARD_BLEED ใน lib/calendar-card
 */
const PAD = 2.5 / PT;

/** การ์ดในไฟล์ (pt · y ชี้ขึ้น) — วัดจากเส้นตัดแดงของไฟล์จริงที่เรนเดอร์ 3000px (13 ต.ค. 69) */
type Card = { x0: number; x1: number; y0: number; y1: number };
/**
 * ไฟล์ต้นฉบับของร้าน (13 ต.ค. 69 — ผู้ใช้ส่งไฟล์ใหม่ครบ 3 ไฟล์ · การ์ดเดียว · มีเลเยอร์)
 * cards = เส้นตัดสีแดง (pt · วัดจากไฟล์เรนเดอร์ 4000px) · pad = ตัดตกของไฟล์นั้น (pt) → อาร์ตบอร์ดเท่าต้นฉบับ
 * แนวตั้งมุมมนส่ง .ai ตัวจริง (ลูกค้าได้เลเยอร์ครบ) · แนวนอน/มุมแหลมสร้างจากขนาดของไฟล์นั้น
 * ⚠️ ตัดตกไม่เท่ากัน: 300g/PET ≈1.0 มม. (57.1×87.1) · holo 2.5 มม. (60.1×90.1) — จอปฏิทินอ่านตามเทมเพลตที่ตรงสเปค
 */
const SOURCES: { key: string; path: string; label: string; cards: Card[]; pad: number }[] = [
  {
    key: "paper",
    path: "/Users/iduckshop/Desktop/testCowork2/Photocard 300g.ai",
    label: "กระดาษทั่วไป",
    cards: [{ x0: 2.778, x1: 159.035, y0: 2.84, y1: 244.171 }],
    pad: 2.778,
  },
  {
    key: "pet",
    // ไฟล์มีเลเยอร์ "ฝากรองขาว" (เปิด) + "รูป" (ปิด)
    path: "/Users/iduckshop/Desktop/testCowork2/Photocard PET.ai",
    label: "PET",
    cards: [{ x0: 2.781, x1: 159.235, y0: 2.842, y1: 244.382 }],
    pad: 2.781,
  },
  {
    key: "holo",
    // การ์ดเดียว อาร์ตบอร์ด 60.1×90.1 (ตัดตก 2.5) · มีเลเยอร์ หน้า/หลัง/รองขาว (ซ่อนไว้) · ใช้กับโฮโลแกรม + สีเงิน + สีทอง
    path: "/Users/iduckshop/Desktop/testCowork2/Photocard holo.ai",
    label: "โฮโลแกรม / เงิน / ทอง",
    cards: [{ x0: 7.08633, x1: 163.292, y0: 7.08728, y1: 248.332 }], // = ArtBox (เส้นตัด) ของไฟล์
    pad: 7.087,
  },
];

/* ── 1. กระดาษของสินค้า → แบ่ง 3 กลุ่ม ── */
const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (perr || !prow) die(`อ่าน ${PRODUCT} ไม่ได้: ${perr?.message}`);
const product = prow!.data as Product;
const papers = product.options.find((o) => o.label === PAPER)?.choices.map((c) => c.name) ?? die(`${PRODUCT} ไม่มีกลุ่ม "${PAPER}"`);
const oris = product.options.find((o) => o.label === ORI)?.choices.map((c) => c.name) ?? die(`${PRODUCT} ไม่มีกลุ่ม "${ORI}"`);
if (!oris.includes("แนวตั้ง") || !oris.includes("แนวนอน")) die(`กลุ่ม "${ORI}" เปลี่ยน: ${oris}`);
const isPet = (n: string) => /PET/i.test(n);
const isShiny = (n: string) => /โฮโลแกรม|กระดาษสีเงิน|กระดาษสีทอง/.test(n);
const groupOf: Record<string, string[]> = {
  paper: papers.filter((n) => !isPet(n) && !isShiny(n)),
  pet: papers.filter(isPet),
  // วัสดุเงา 3 แบบแยกเทมเพลตกัน (13 ต.ค. 69 — เดิมใช้ไฟล์เดียวกัน ลูกค้าแยกไม่ออกว่าเทมเพลตเปลี่ยน)
  holo: papers.filter((n) => /โฮโลแกรม/.test(n)),
  silver: papers.filter((n) => /กระดาษสีเงิน/.test(n)),
  gold: papers.filter((n) => /กระดาษสีทอง/.test(n)),
};
for (const [k, v] of Object.entries(groupOf)) if (!v.length) die(`กลุ่ม ${k} ไม่มีกระดาษ`);

/* ── 2. ไฟล์แนวนอน (pdf-lib) + พรีวิว (sips) ── */
mkdirSync(OUT, { recursive: true });
const stem = (p: string) => p.split("/").pop()!.replace(/\.[^.]+$/, "");
async function rebuild(src: (typeof SOURCES)[number], rotate: boolean) {
  const bytes = readFileSync(src.path);
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const page = srcDoc.getPage(0);
  const { width: W, height: H } = page.getSize();
  /**
   * เหลือแค่กรอบการ์ด (ผู้ใช้สั่ง 13 ต.ค. 69 "ลบ detail ออก ให้เหลือแค่กรอบของ photocard") — ตัดหัวข้อ/คำอธิบายทิ้ง
   * อาร์ตบอร์ด = การ์ด + ตัดตก 1.05 มม. · แนวนอนหมุน 90°
   * ⚠️ สร้างหน้าใหม่ "ในเอกสารเดิม" ไม่ใช่ PDFDocument.create() — ไฟล์ร้านมีเลเยอร์ซ่อน (ตัดตกสีเทา · พื้นโฮโลแกรม · ข้อความเก่า)
   * ก๊อปข้ามเอกสารแล้ว OCProperties ไม่ตามมา เลเยอร์ซ่อนโผล่หมด · หน้าใหม่ไม่มี PieceInfo → Illustrator เปิดตาม PDF
   */
  const c = src.cards[0];
  const pd = src.pad;
  const card = await srcDoc.embedPage(page, { left: c.x0 - pd, bottom: c.y0 - pd, right: c.x1 + pd, top: c.y1 + pd });
  const NW = rotate ? card.height : card.width;
  const NH = rotate ? card.width : card.height;
  const out = srcDoc.addPage([NW, NH]);
  // หมุน 90° ทวนเข็ม: มุมล่างซ้ายของการ์ดเดิมอยู่ที่ (x, 0) แล้วแกนกว้างชี้ขึ้น → กล่องจริง [x − NW, x] × [0, NH]
  out.drawPage(card, rotate ? { x: NW, y: 0, rotate: degrees(90) } : { x: 0, y: 0 });
  srcDoc.removePage(0); // หน้าเดิม (ที่มี AIPrivateData) ออก เหลือหน้าใหม่หน้าเดียว
  const file = `${OUT}${stem(src.path)}${rotate ? " (แนวนอน)" : ""}.pdf`;
  writeFileSync(file, await srcDoc.save());
  return { file, wMm: NW * PT, hMm: NH * PT, srcWMm: W * PT, srcHMm: H * PT };
}
function preview(file: string, key: string) {
  const tmp = `${OUT}_tmp-${key}.pdf`;
  copyFileSync(file, tmp); // sips อ่าน .ai ไม่ได้ตรง ๆ (นามสกุล) — ก๊อปเป็น .pdf ก่อน
  const png = `${OUT}preview-${key}.png`;
  execFileSync("sips", ["-s", "format", "png", "-Z", "1200", tmp, "--out", png], { stdio: "ignore" });
  execFileSync("rm", ["-f", tmp]);
  return png;
}

/**
 * ⬜ กรอบมุมแหลม (ตัวเลือก "มุม" = มุมแหลม · 13 ต.ค. 69) — ไฟล์ร้านมีแต่มุมมน จึงวาดใหม่ขนาดเท่ากัน
 * อาร์ตบอร์ดเท่าไฟล์มุมมน · เส้นตัดแดงสี่เหลี่ยมที่ระยะตัดตกของไฟล์นั้น
 */
async function squareFrame(src: (typeof SOURCES)[number], rotate: boolean, wMm: number, hMm: number) {
  const doc = await PDFDocument.create();
  const W = wMm / PT;
  const H = hMm / PT;
  const page = doc.addPage([W, H]);
  // PET ไฟล์ใหม่ของร้านพื้นขาว (13 ต.ค. 69) — ไม่ปูเทาแล้ว
  const pd = src.pad; // ตัดตกเท่าไฟล์ต้นฉบับของวัสดุนั้น
  page.drawRectangle({ x: pd, y: pd, width: W - pd * 2, height: H - pd * 2, borderColor: rgb(0.86, 0.15, 0.15), borderWidth: 0.5 });
  const file = `${OUT}${stem(src.path)} (${rotate ? "แนวนอน · " : ""}มุมแหลม).pdf`;
  writeFileSync(file, await doc.save());
  return file;
}


type Built = { key: string; ori: "P" | "L"; sq: boolean; path: string; name: string; ext: string; wMm: number; hMm: number; png: string; skin?: string };
const built: Built[] = [];
for (const s of SOURCES) {
  const L = await rebuild(s, true);
  // แนวตั้งมุมมน = ไฟล์ .ai ต้นฉบับของร้านตรง ๆ (การ์ดเดียวพอดีอาร์ตบอร์ด · เลเยอร์ครบ) · P ไว้ใช้ขนาด
  const P = await rebuild(s, false);
  built.push({ key: s.key, ori: "P", sq: false, path: s.path, name: `${stem(s.path)}.ai`, ext: "ai", wMm: P.srcWMm, hMm: P.srcHMm, png: preview(s.path, `${s.key}-P`) });
  built.push({ key: s.key, ori: "L", sq: false, path: L.file, name: `${stem(s.path)} (แนวนอน).pdf`, ext: "pdf", wMm: L.wMm, hMm: L.hMm, png: preview(L.file, `${s.key}-L`) });
  for (const [ori, R] of [["P", P], ["L", L]] as const) {
    const f = await squareFrame(s, ori === "L", R.wMm, R.hMm);
    built.push({ key: s.key, ori, sq: true, path: f, name: f.split("/").pop()!, ext: "pdf", wMm: R.wMm, hMm: R.hMm, png: preview(f, `${s.key}-${ori}-sq`) });
  }
  if (s.key === "holo") {
    // วัสดุเงา 3 แบบใช้ไฟล์ชุดเดียวกัน (Photocard holo.ai) · แยกกลุ่มไว้ (เผื่อร้านมีไฟล์เฉพาะเงิน/ทองทีหลัง)
    // แนวตั้งมุมมน = ไฟล์ .ai ต้นฉบับ (ไม่ต้องสร้างใหม่ — การ์ดเดียวพอดีอาร์ตบอร์ดอยู่แล้ว)
    const frames = built.filter((x) => x.key === "holo");
    for (let i = built.length - 1; i >= 0; i--) if (built[i].key === "holo") built.splice(i, 1);
    for (const mat of ["holo", "silver", "gold"])
      for (const f0 of frames) {
        const R = f0.ori === "L" ? L : P;
        // ไม่ใส่แถบสีวัสดุแล้ว (ผู้ใช้สั่ง 13 ต.ค. 69 "ในเทมเพลตไม่มีพื้นหลัง ควรเป็นสีขาวปกติ") — จอปฏิทินใช้รูปเทมเพลตจริง
        void R;
        built.push({ ...f0, key: mat });
      }
  }


}
for (const b of built)
  console.log(`   ${b.ori === "P" ? "แนวตั้ง" : "แนวนอน"} ${b.sq ? "มุมแหลม" : "มุมมน"} · ${b.name} · ${b.wMm.toFixed(1)}×${b.hMm.toFixed(1)} มม. · ใช้กับ ${groupOf[b.key].length} กระดาษ`);

/* ── 3. อัปขึ้น storage + เขียนชุด + ผูกสินค้า ── */
const uploaded = new Map<string, string>(); // ไฟล์เดียวกันใช้หลายกลุ่ม (holo/เงิน/ทอง) → อัปครั้งเดียว
async function upload(local: string, kind: "file" | "preview", ext: string): Promise<string> {
  const hit = uploaded.get(local);
  if (hit) return hit;
  const ct = ext === "png" ? "image/png" : ext === "pdf" ? "application/pdf" : "application/postscript";
  const safe = stem(local).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 50) || "template";
  const path = `${kind}/${randomUUID().slice(0, 8)}-${safe}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(local), { contentType: ct, upsert: false });
  if (error) die(`อัป ${local}: ${error.message}`);
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  uploaded.set(local, url);
  return url;
}

const files: TemplateFile[] = [];
for (const b of built) {
  const group = groupOf[b.key];
  const fileUrl = WRITE ? await upload(b.path, "file", b.ext) : `(dry-run) ${b.name}`;
  const previewUrl = WRITE ? await upload(b.png, "preview", "png") : undefined;
  const skinUrl = WRITE && b.skin ? await upload(b.skin, "preview", "png") : undefined;
  files.push({
    id: `${TPL_ID}-${b.key}-${b.ori}${b.sq ? "-sq" : ""}`,
    choice: group[0],
    ...(group.length > 1 ? { choices: group.slice(1) } : {}),
    // ไฟล์มุมมนแนวตั้ง = ค่าเริ่มต้น (ไม่มีเงื่อนไข) · ที่เหลือเจาะจงด้วยเงื่อนไข (preferWhen เลือกตัวที่ตรงมากข้อสุด)
    ...((): { when?: TemplateWhen[] } => {
      const w: TemplateWhen[] = [
        ...(b.ori === "L" ? [{ label: ORI, choices: ["แนวนอน"] }] : []),
        ...(b.sq ? [{ label: CORNER, choices: ["มุมแหลม"] }] : []),
      ];
      return w.length ? { when: w } : {};
    })(),
    fileUrl,
    fileName: b.name,
    fileSize: readFileSync(b.path).length,
    ...(previewUrl ? { previewUrl } : {}),
    ...(skinUrl ? { skinUrl } : {}),
    widthMm: Math.round(b.wMm * 10) / 10,
    heightMm: Math.round(b.hMm * 10) / 10,
  });
}
const tpl: DesignTemplate = {
  id: TPL_ID,
  name: "Photocard ปฏิทิน 5.5×8.5 ซม. (ตามกระดาษ · แนวตั้ง/แนวนอน · มุมมน/มุมแหลม)",
  note: "การ์ดขนาด 55×85 มม. · ตัดตก 2.5 มม. (อาร์ตบอร์ด 60×90) · วางลายให้เลยเส้นตัดสีแดงออกไป · เซฟเป็น .ai/.pdf โหมดสี CMYK · ตัวหนังสือ create outline",
  category: "Photocard",
  optionLabel: PAPER,
  optionProductId: PRODUCT,
  bleedMm: 2.5,
  safeMm: 3,
  files,
  savedAt: new Date().toISOString(),
};
console.log(`\n📐 ${tpl.name} (${TPL_ID}) · ${files.length} ไฟล์`);
for (const f of files)
  console.log(`   ${f.fileName} ← ${[f.choice, ...(f.choices ?? [])].length} กระดาษ · ${whenList(f).map((w) => `${w.label} ${w.choices.join("/")}`).join(" + ") || "ค่าเริ่มต้น (แนวตั้ง มุมมน)"}`);
if (!WRITE) {
  console.log(`\n(dry-run — ไฟล์แนวนอน/พรีวิวอยู่ที่ ${OUT} · ใส่ --write เพื่ออัปและบันทึก)`);
  process.exit(0);
}
// ไฟล์รอบก่อนของชุดนี้ (รันซ้ำ) — เก็บไว้อีก 1 รอบ (retiredPaths) ลบเฉพาะของ 2 รอบก่อน
// หน้าที่ลูกค้า/ทีมเปิดค้างไว้ยังชี้ไฟล์รอบก่อน — ลบทันทีแล้วจอปฏิทินโหลดเทมเพลตไม่ขึ้น (13 ต.ค. 69)
const { data: oldRow } = await sb.from("products").select("data").eq("id", `__template_${TPL_ID}`).maybeSingle();
const oldTpl = oldRow?.data as (DesignTemplate & { retiredPaths?: string[] }) | undefined;
const nowPaths = new Set(
  files.flatMap((f) => [f.fileUrl, f.previewUrl, f.skinUrl]).map((u) => (u ? u.split(`/${BUCKET}/`)[1] : undefined)).filter(Boolean) as string[],
);
const prevPaths = [...new Set(
  (oldTpl?.files ?? [])
    .flatMap((f) => [f.fileUrl, f.previewUrl, f.skinUrl])
    .map((u) => (u ? u.split(`/${BUCKET}/`)[1] : undefined))
    .filter((x): x is string => !!x && !nowPaths.has(x)),
)];
const oldPaths = (oldTpl?.retiredPaths ?? []).filter((x) => !nowPaths.has(x) && !prevPaths.includes(x));
(tpl as DesignTemplate & { retiredPaths?: string[] }).retiredPaths = prevPaths;
const { error: tErr } = await sb.from("products").upsert(
  { id: `__template_${TPL_ID}`, name: `(เทมเพลต) ${tpl.name}`.slice(0, 120), category: "__templates__", price: 0, data: tpl },
  { onConflict: "id" },
);
if (tErr) die(`บันทึกชุดไม่สำเร็จ: ${tErr.message}`);
if (oldPaths.length) {
  const { error } = await sb.storage.from(BUCKET).remove(oldPaths);
  console.log(error ? `   ⚠️ ลบไฟล์ 2 รอบก่อนไม่สำเร็จ: ${error.message}` : `   🗑 ลบไฟล์ 2 รอบก่อน ${oldPaths.length} ไฟล์ (รอบก่อน ${prevPaths.length} ไฟล์เก็บไว้ให้หน้าที่เปิดค้าง)`);
}
const ids = product.templateIds ?? [];
if (!ids.includes(TPL_ID)) {
  const next: Product = { ...product, templateIds: [...ids, TPL_ID], savedAt: new Date().toISOString() };
  const { error } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
  if (error) die(`ผูกกับสินค้าไม่สำเร็จ: ${error.message}`);
}
const { data: chk } = await sb.from("products").select("data").eq("id", PRODUCT).single();
const back = chk!.data as Product;
if (!back.templateIds?.includes(TPL_ID) || back.studioOff === true) die("อ่านกลับมาไม่ตรง (templateIds / studioOff)");
console.log(`   ✅ บันทึกชุดแล้ว + ผูกกับ ${PRODUCT} (studioOff ไม่แตะ — จอปฏิทินยังเปิด)`);
