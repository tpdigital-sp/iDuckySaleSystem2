/**
 * 📐 ชุดเทมเพลต "ปฏิทินตั้งโต๊ะ 6×8 นิ้ว" ใน /admin/templates — แยกตามแนวปฏิทิน (13 ต.ค. 69 — ผู้ใช้ขอ)
 *
 *   npx tsx scripts/calendar-desktop-template-build.mts            # สร้างพรีวิวลงเครื่อง (ไม่อัป ไม่เขียน DB)
 *   npx tsx scripts/calendar-desktop-template-build.mts --write    # อัปไฟล์ + สร้าง/อัปเดตชุด + ผูกกับ calendar-desktop
 *
 * ไฟล์ต้นฉบับ (ผู้ใช้กำหนด) — ส่ง .ai ตรง ๆ (เลเยอร์ "รูเจาะ" ครบ):
 *   Calendar แนวตั้ง 6x8.ai → แนวปฏิทิน: แนวตั้ง (อาร์ตบอร์ด 155×205.7 มม. · เส้นตัดข้าง 152.4)
 *   Calendar แนวนอน 8x6.ai → แนวปฏิทิน: แนวนอน (205.7×155)
 * ใช้ได้ทั้ง 8 แผ่น / 14 แผ่น (ไม่ตั้งเงื่อนไขขนาด) · ผูกทาง templateIds — ⚠️ ไม่ตั้ง studioOff · รันซ้ำได้ (id คงที่ · retiredPaths)
 * สินค้าอยู่ใน DB ชื่อ id "3x3-7-62cm" (slug calendar-desktop)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import type { DesignTemplate, TemplateFile } from "../src/lib/design-templates";
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

const TPL_ID = "tpl-calendar-desktop";
const PRODUCT = "3x3-7-62cm";
const ORI = "แนวปฏิทิน";
const BUCKET = "design-templates";
const OUT = new URL("./assets/calendar-desktop-templates/", import.meta.url).pathname;
const PT = 25.4 / 72;
const SOURCES = [
  { ori: "แนวตั้ง", path: "/Users/iduckshop/Desktop/testCowork2/Calendar แนวตั้ง 6x8.ai" },
  { ori: "แนวนอน", path: "/Users/iduckshop/Desktop/testCowork2/Calendar แนวนอน 8x6.ai" },
];

const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (perr || !prow) die(`อ่าน ${PRODUCT} ไม่ได้: ${perr?.message}`);
const product = prow!.data as Product;
const oris = product.options.find((o) => o.label === ORI)?.choices.map((c) => c.name) ?? die(`ไม่มีกลุ่ม "${ORI}"`);
for (const s of SOURCES) if (!oris.includes(s.ori)) die(`กลุ่ม "${ORI}" ไม่มี "${s.ori}"`);

mkdirSync(OUT, { recursive: true });
const stem = (p: string) => p.split("/").pop()!.replace(/\.[^.]+$/, "");
const built: { ori: string; path: string; wMm: number; hMm: number; png: string }[] = [];
for (const s of SOURCES) {
  const doc = await PDFDocument.load(readFileSync(s.path), { ignoreEncryption: true, updateMetadata: false });
  const { width, height } = doc.getPage(0).getSize();
  const tmp = `${OUT}_tmp.pdf`;
  copyFileSync(s.path, tmp); // sips อ่าน .ai ตรง ๆ ไม่ได้ — ก๊อปเป็น .pdf ก่อน (หน้าแรก)
  const png = `${OUT}preview-${s.ori === "แนวตั้ง" ? "P" : "L"}.png`;
  execFileSync("sips", ["-s", "format", "png", "-Z", "1200", tmp, "--out", png], { stdio: "ignore" });
  execFileSync("rm", ["-f", tmp]);
  /**
   * 🧹 พรีวิว = เส้นช่วยในจอสร้างปฏิทิน (ไฟล์ .ai ที่ลูกค้าโหลดไม่แตะ) — ผู้ใช้สั่ง 13 ต.ค. 69
   *  1) ไม่เอากรอบเส้นดำรอบอาร์ตบอร์ด → พิกเซลเข้ม (ไม่ใช่แดง) ที่ขอบ 1 มม. ทำให้ใส
   *  2) เส้นตัดแดง "ชนมุม" → ขยายรูปเป็นขนาดผืนของจอ (6×8 นิ้ว + ตัดตก 2 มม. = FULL) แล้วลากเส้นแดงทุกเส้นยาวสุดขอบ
   *     (อาร์ตบอร์ดเทมเพลตเล็กกว่าผืน 0.7 มม./ด้าน · เส้นแดงอยู่ 1.3 มม. จากขอบอาร์ตบอร์ด = ตรงเส้นตัดของจอพอดี)
   */
  const FULL = s.ori === "แนวตั้ง" ? [6 * 25.4 + 4, 8 * 25.4 + 4] : [8 * 25.4 + 4, 6 * 25.4 + 4];
  {
    const { data, info } = await sharp(readFileSync(png)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pw = info.width;
    const ph = info.height;
    const pxmm = pw / (width * PT);
    const edge = Math.ceil(pxmm * 1);
    const isRed = (i: number) => data[i + 3] > 60 && data[i] > 150 && data[i + 1] < 110 && data[i + 2] < 110;
    for (let y = 0; y < ph; y++)
      for (let x = 0; x < pw; x++) {
        if (x >= edge && y >= edge && x < pw - edge && y < ph - edge) continue;
        const i = (y * pw + x) * 4;
        if (!isRed(i)) data[i + 3] = 0;
      }
    // ผืนเต็มของจอ (px) · วางอาร์ตบอร์ดกึ่งกลาง
    const W2 = Math.round(FULL[0] * pxmm);
    const H2 = Math.round(FULL[1] * pxmm);
    const ox = Math.round((W2 - pw) / 2);
    const oy = Math.round((H2 - ph) / 2);
    const out = Buffer.alloc(W2 * H2 * 4);
    for (let y = 0; y < ph; y++) data.copy(out, ((y + oy) * W2 + ox) * 4, y * pw * 4, (y + 1) * pw * 4);
    // แถว/คอลัมน์ที่เป็นเส้นแดง (แดงเกินครึ่ง) → ระบายแดงตลอดแนว
    const red = [225, 12, 22, 255];
    for (let y = 0; y < ph; y++) {
      let n = 0;
      for (let x = 0; x < pw; x++) if (isRed((y * pw + x) * 4)) n++;
      if (n > pw * 0.5) for (let x = 0; x < W2; x++) out.set(red, ((y + oy) * W2 + x) * 4);
    }
    for (let x = 0; x < pw; x++) {
      let n = 0;
      for (let y = 0; y < ph; y++) if (isRed((y * pw + x) * 4)) n++;
      if (n > ph * 0.5) for (let y = 0; y < H2; y++) out.set(red, (y * W2 + x + ox) * 4);
    }
    writeFileSync(png, await sharp(out, { raw: { width: W2, height: H2, channels: 4 } }).png().toBuffer());
  }
  built.push({ ori: s.ori, path: s.path, wMm: FULL[0], hMm: FULL[1], png });
}

async function upload(local: string, kind: "file" | "preview", ext: string): Promise<string> {
  const ct = ext === "png" ? "image/png" : "application/postscript";
  const safe = stem(local).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 50) || "template";
  const path = `${kind}/${randomUUID().slice(0, 8)}-${safe}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(local), { contentType: ct, upsert: false });
  if (error) die(`อัป ${local}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
const files: TemplateFile[] = [];
for (const b of built)
  files.push({
    id: `${TPL_ID}-${b.ori === "แนวตั้ง" ? "P" : "L"}`,
    choice: b.ori,
    fileUrl: WRITE ? await upload(b.path, "file", "ai") : `(dry-run) ${stem(b.path)}.ai`,
    fileName: `${stem(b.path)}.ai`,
    fileSize: readFileSync(b.path).length,
    ...(WRITE ? { previewUrl: await upload(b.png, "preview", "png") } : {}),
    widthMm: Math.round(b.wMm * 10) / 10,
    heightMm: Math.round(b.hMm * 10) / 10,
  });
const tpl: DesignTemplate = {
  id: TPL_ID,
  name: "ปฏิทินตั้งโต๊ะ 6×8 นิ้ว (แนวตั้ง / แนวนอน)",
  note: "ขนาด 6×8 นิ้ว · เส้นสีแดง = เส้นตัด · สี่เหลี่ยมดำด้านบน = ตำแหน่งรูเจาะห่วง (อย่าวางตัวหนังสือ/ของสำคัญทับ) · เซฟเป็น .ai/.pdf โหมดสี CMYK · ตัวหนังสือ create outline",
  category: "ปฏิทิน",
  optionLabel: ORI,
  optionProductId: PRODUCT,
  files,
  savedAt: new Date().toISOString(),
};
console.log(`📐 ${tpl.name} (${TPL_ID})`);
for (const f of files) console.log(`   ${f.fileName} · ${f.widthMm}×${f.heightMm} มม. ← ${ORI}: ${f.choice}`);
if (!WRITE) {
  console.log(`\n(dry-run — พรีวิวอยู่ที่ ${OUT} · ใส่ --write เพื่ออัปและบันทึก)`);
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
