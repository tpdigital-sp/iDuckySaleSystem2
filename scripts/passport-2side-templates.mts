/**
 * 🛂 Passport case: เทมเพลตใหม่จาก NAS แยก "สกรีน 1 ด้าน" / "สกรีน 2 ด้าน" + จอออกแบบ 2 หน้า (ด้านนอก/ด้านใน)
 * (เจ้าของร้านสั่ง 22 ต.ค. 69 "Passport.ai · (2ด้าน)Passport.ai — สกรีน 1 ด้าน และ สกรีน 2 ด้าน ใช้เทมเพลตนี้แทน")
 *
 *   npx tsx scripts/passport-2side-templates.mts            # ดูผล (เรนเดอร์ไว้ในเครื่อง ไม่อัป ไม่เขียน)
 *   npx tsx scripts/passport-2side-templates.mts --write    # อัป + บันทึก + ล้างแคชเว็บจริง
 *
 * ไฟล์: …/6. กระเป๋า/11.5 passport/Passport.ai (1 อาร์ตบอร์ด = ด้านนอก หลัง|สัน|หน้า)
 *       …/(2ด้าน)Passport.ai (2 อาร์ตบอร์ด: หน้า 1 ด้านนอก · หน้า 2 ด้านใน = พิมพ์ได้แค่แผงขวา 61.9×144 มม. @156.6) · ทุกอาร์ตบอร์ด 221×149
 * สกิน = เลเยอร์ "Template" (เส้นแดง) พื้นโปร่ง 300 dpi · พรีวิว = ทุกเลเยอร์ (scripts/py/artboard-skin-cut.py)
 * เส้นตัด/รองขาว: ด้านนอก = กรอบมุมมนแดง 216×144 @2.5 · ด้านใน = แผงขวา 61.9×144 @(156.59,2.51) มุมขวามน · whiteUnder + fullFace ทุกหน้า
 * ชุดเดิม tpl-zml0082mh "Passport" → แทนไฟล์ด้วย Passport.ai + when สกรีนกี่ด้าน = "1 ด้าน (ด้านนอก)" (ไฟล์เก่าเก็บ retiredPaths)
 * ชุดใหม่ "(2ด้าน)Passport" หมวด knickknack bag: ไฟล์ 1 = ด้านนอก (.ai 2 อาร์ตบอร์ด) · ไฟล์ 2 = ด้านใน backGuide (ไม่มี .ai ของตัวเอง)
 *   ทั้งสองไฟล์ when = "2ด้าน (ด้านในได้แค่ 1 ฝั่ง)" → ProductDetail ส่งไฟล์ 2 เป็น guide.back ให้ CalendarStudio หน้า "back"
 * สินค้า passport-case: templateIds = [เดิม, ใหม่] · calendarStudio.formats = tpl2 when 2ด้าน (จอ 2 หน้า)
 * รันซ้ำ: เจอชุด "(2ด้าน)Passport" แล้ว = อัปเดตแทนสร้างซ้ำ · ไฟล์ .ai เหมือนเดิมทุกไบต์ = ไม่อัปใหม่
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, type DesignTemplate, type TemplateCurve, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const DIR = "/Volumes/iDuckyShop/All Template/6. กระเป๋า/11.5 passport";
const ONE_FILE = `${DIR}/Passport.ai`;
const TWO_FILE = `${DIR}/(2ด้าน)Passport.ai`;
const PRODUCT = "passport-case";
const OLD_SET = "tpl-zml0082mh";
const NEW_NAME = "(2ด้าน)Passport";
const CATEGORY = "knickknack bag";
const SIDES = "สกรีนกี่ด้าน";
const ONE = "1 ด้าน (ด้านนอก)";
const TWO = "2ด้าน (ด้านในได้แค่ 1 ฝั่ง)";
// ด้านในพิมพ์ได้แค่ "แผงขวา" 61.9×144 มุมขวามน (เจ้าของร้านวงแดง 22 ต.ค. 69 — รอบแรกใช้ช่องซ้าย 76.5×123 ผิด)
const INNER_NEAR = "156.59,2.51,61.91,143.98";
const BUCKET = "design-templates";
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};
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
const PY = new URL("./py/artboard-skin-cut.py", import.meta.url).pathname;
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/passport-2side`;
mkdirSync(OUT, { recursive: true });
statSync(ONE_FILE);
statSync(TWO_FILE);
const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 11)}`;
const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");

type Art = { widthMm: number; heightMm: number; skin: string; preview: string; curves: TemplateCurve[]; box: number[]; error?: string };
const art = (file: string, page: number, stem: string, near?: string): Art => {
  const r = JSON.parse(execFileSync(PYTHON, ["-I", PY, file, String(page), OUT, stem, ...(near ? ["--near", near] : [])], { encoding: "utf8" })) as Art;
  if (r.error) die(`${stem} หน้า ${page}: ${r.error}`);
  if (Math.abs(r.widthMm - 221) > 0.5 || Math.abs(r.heightMm - 149) > 0.5) die(`${stem} หน้า ${page}: อาร์ตบอร์ด ${r.widthMm}×${r.heightMm} ไม่ใช่ 221×149`);
  return r;
};
const one = art(ONE_FILE, 0, "one");
const twoOut = art(TWO_FILE, 0, "two");
const twoIn = art(TWO_FILE, 1, "two", INNER_NEAR);
for (const [n, a] of [["1 ด้าน", one], ["2 ด้าน · นอก", twoOut], ["2 ด้าน · ใน", twoIn]] as const)
  console.log(`🛂 ${n}: ${a.widthMm}×${a.heightMm} · เส้นตัด (${a.box[0]},${a.box[1]}) ${a.box[2]}×${a.box[3]} มม.`);

/* ── สินค้า + ชุดเดิม/ใหม่ ── */
const { data: prow } = await sb.from("products").select("data").eq("id", PRODUCT).single();
const product = (prow?.data as Product) ?? die(`ไม่พบสินค้า ${PRODUCT}`);
const sides = product.options.find((o) => o.label === SIDES)?.choices.map((c) => c.name) ?? die(`ไม่มีกลุ่ม ${SIDES}`);
if (!sides.includes(ONE) || !sides.includes(TWO)) die(`กลุ่ม ${SIDES} ไม่มี "${ONE}" / "${TWO}" (มี: ${sides.join(" · ")})`);
type Row = { id: string; data: DesignTemplate & { retiredPaths?: string[] } };
const { data: trows } = await sb.from("products").select("id,data").eq("category", "__templates__");
const all = (trows ?? []) as Row[];
const oldRow = all.find((r) => r.data.id === OLD_SET) ?? die(`ไม่พบชุด ${OLD_SET}`);
const newRow = all.find((r) => r.data.name === NEW_NAME && (r.data.category ?? "") === CATEGORY);
console.log(`   ชุดเดิม ${OLD_SET} "${oldRow.data.name}" · ชุด 2 ด้าน ${newRow ? `มีแล้ว ${newRow.data.id}` : "ยังไม่มี → สร้างใหม่"}`);

if (!WRITE) {
  console.log(`\n(dry-run — สกิน/พรีวิวอยู่ที่ ${OUT} · ใส่ --write เพื่ออัปและบันทึก)`);
  process.exit(0);
}

/* ── อัป ── */
async function upload(local: Buffer, kind: "file" | "preview", stem: string, e: string): Promise<string> {
  const ct = e === "png" ? "image/png" : "application/postscript";
  const safe = stem.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 50) || "template";
  const path = `${kind}/${randomUUID().slice(0, 8)}-${safe}.${e}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, local, { contentType: ct, upsert: false });
  if (error) die(`อัป ${kind}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
const pathOf = (u?: string) => (u ? u.split(`/${BUCKET}/`)[1] : undefined);
const now = () => new Date().toISOString();
const flags = { whiteUnder: true, fullFace: true } as const;

// 1) ชุดเดิม → Passport.ai (1 ด้าน)
const oneBytes = readFileSync(ONE_FILE);
const old = oldRow.data.files![0];
const sameOne = old.fileSize === oneBytes.length && old.fileName === "Passport.ai";
const oneFileUrl = sameOne ? old.fileUrl! : await upload(oneBytes, "file", "Passport", "ai");
const oneSkin = await upload(readFileSync(one.skin), "preview", "Passport-F-01", "png");
const onePrev = await upload(readFileSync(one.preview), "preview", "Passport-preview", "png");
const oneNext: TemplateFile = {
  id: old.id,
  fileUrl: oneFileUrl,
  fileName: "Passport.ai",
  fileSize: oneBytes.length,
  widthMm: one.widthMm,
  heightMm: one.heightMm,
  skinUrl: oneSkin,
  previewUrl: onePrev,
  cutCurves: one.curves,
  ...flags,
  when: [{ label: SIDES, choices: [ONE] }],
};
const retired = [...new Set([...(oldRow.data.retiredPaths ?? []), ...(sameOne ? [] : [pathOf(old.fileUrl)]), pathOf(old.skinUrl), pathOf(old.previewUrl)].filter(Boolean) as string[])];
{
  const { error } = await sb
    .from("products")
    .update({ data: { ...oldRow.data, previewUrl: onePrev, files: [oneNext], retiredPaths: retired, savedAt: now() } })
    .eq("id", oldRow.id);
  if (error) die(`บันทึกชุด ${OLD_SET}: ${error.message}`);
  console.log(`   ✅ ${OLD_SET} "Passport" ← Passport.ai (${sameOne ? "ไฟล์เดิม" : "อัปใหม่"}) · when ${ONE}`);
}

// 2) ชุด 2 ด้าน
const twoBytes = readFileSync(TWO_FILE);
const prevOut = newRow?.data.files?.find((f) => !f.backGuide);
const sameTwo = !!prevOut && prevOut.fileSize === twoBytes.length && md5(twoBytes) === (prevOut as TemplateFile & { md5?: string }).md5;
const twoFileUrl = sameTwo ? prevOut!.fileUrl! : await upload(twoBytes, "file", "2side-Passport", "ai");
const twoSkin0 = await upload(readFileSync(twoOut.skin), "preview", "2side-Passport-F-01", "png");
const twoPrev0 = await upload(readFileSync(twoOut.preview), "preview", "2side-Passport-preview", "png");
const twoSkin1 = await upload(readFileSync(twoIn.skin), "preview", "2side-Passport-F-02", "png");
const twoPrev1 = await upload(readFileSync(twoIn.preview), "preview", "2side-Passport-inner-preview", "png");
const whenTwo = [{ label: SIDES, choices: [TWO] }];
const outFile: TemplateFile & { md5?: string } = {
  id: prevOut?.id ?? rid("f"),
  side: "ด้านนอก",
  fileUrl: twoFileUrl,
  fileName: "(2ด้าน)Passport.ai",
  fileSize: twoBytes.length,
  md5: md5(twoBytes),
  widthMm: twoOut.widthMm,
  heightMm: twoOut.heightMm,
  skinUrl: twoSkin0,
  previewUrl: twoPrev0,
  cutCurves: twoOut.curves,
  ...flags,
  when: whenTwo,
};
const inFile: TemplateFile = {
  id: newRow?.data.files?.find((f) => f.backGuide)?.id ?? rid("f"),
  side: "ด้านใน",
  backGuide: true,
  fileName: "(2ด้าน)Passport.ai · ด้านใน",
  widthMm: twoIn.widthMm,
  heightMm: twoIn.heightMm,
  skinUrl: twoSkin1,
  previewUrl: twoPrev1,
  cutCurves: twoIn.curves,
  ...flags,
  when: whenTwo,
};
const maxSort = Math.max(-1, ...all.map((r) => r.data.sort ?? -1));
const newId = newRow?.data.id ?? rid("tpl");
const t2: DesignTemplate = {
  ...(newRow?.data ?? {}),
  id: newId,
  name: NEW_NAME,
  category: CATEGORY,
  previewUrl: twoPrev0,
  sort: newRow?.data.sort ?? maxSort + 1,
  files: [outFile, inFile],
  savedAt: now(),
};
// เลือก 2 ด้าน → ได้ไฟล์ดาวน์โหลด 1 ไฟล์ (ด้านนอก/.ai 2 อาร์ตบอร์ด) · ไกด์ด้านในมาจาก includeEmpty
if (filesForSelections(t2, { [SIDES]: TWO }).length !== 1) die("ชุด 2 ด้าน: เลือก 2 ด้านแล้วไม่ได้ไฟล์เดียว");
if (filesForSelections(t2, { [SIDES]: ONE }).length) die("ชุด 2 ด้าน: ไฟล์โผล่ตอนเลือก 1 ด้าน");
{
  const { error } = await sb
    .from("products")
    .upsert({ id: `__template_${newId}`, name: `(เทมเพลต) ${NEW_NAME}`, category: "__templates__", price: 0, data: t2 }, { onConflict: "id" });
  if (error) die(`บันทึกชุด 2 ด้าน: ${error.message}`);
  console.log(`   ✅ ${newId} "${NEW_NAME}" ← (2ด้าน)Passport.ai (${sameTwo ? "ไฟล์เดิม" : "อัปใหม่"}) · ด้านนอก + ด้านใน (backGuide) · when ${TWO}`);
}

// 3) สินค้า
{
  const { data: fresh } = await sb.from("products").select("data").eq("id", PRODUCT).single();
  const cur = (fresh?.data ?? product) as Product;
  const ids = [...new Set([...(cur.templateIds ?? []), OLD_SET, newId])];
  const next: Product = {
    ...cur,
    templateIds: ids,
    calendarStudio: { ...(cur.calendarStudio ?? {}), yearLabel: cur.calendarStudio?.yearLabel ?? "", formats: [{ format: "tpl2", when: whenTwo }] },
    savedAt: now(),
  };
  delete next.studioOff;
  const { error } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
  if (error) die(`บันทึกสินค้า: ${error.message}`);
  console.log(`   ✅ ${product.name}: templateIds ${JSON.stringify(ids)} · จอ 2 หน้าเมื่อ "${TWO}"`);
}
await revalidateLive(env, { productIds: [PRODUCT], templateIds: [OLD_SET, newId] });
