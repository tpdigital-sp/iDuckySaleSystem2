/**
 * 📌🎨 เข็มกลัดพลาสติก (broochbadge-th) — ผูกชุดเทมเพลตหมวด "เข็มกลัดพลาสติก" 5 ชุด + เปิดจอออกแบบบนเว็บ
 *      + ถาม "ลายเดียว / คละลาย" ในจอออกแบบเหมือนโปสการ์ด (เจ้าของร้านสั่ง 16 ต.ค. 69)
 *
 *   npx tsx scripts/brooch-badge-design-studio.mts            # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/brooch-badge-design-studio.mts --write    # บันทึกชุดเทมเพลต + สินค้า
 *
 * ชุดเทมเพลตในคลังเป็น "ชุดละขนาด ไฟล์เดียว" ไม่ได้ผูกกลุ่มตัวเลือก (optionLabel ว่าง) และชื่อชุดไม่ตรงค่าตัวเลือก
 *   ("(ex) PinnCircle 2.5cm" ≠ "ทรงกลม 25mm (1 เซตได้ 10 ชิ้น)") → หน้าสินค้าจับคู่ด้วยชื่อชุดไม่ได้ จะหยิบชุดแรกทุกขนาด
 * วิธี: ตั้ง TemplateFile.when = [{ label: "ขนาด", choices: [<ค่าตัวเลือกขนาด>] }] ให้ไฟล์ของแต่ละชุด
 *   → filesForSelections คืนเฉพาะไฟล์ที่ตรงขนาดที่เลือก = ทั้งกล่องโหลดเทมเพลต (📐) · ไกด์ในจอออกแบบ (calGuide)
 *     และขนาดผืน (tplFormatKey → tpl@กว้างxสูง มม. จากอาร์ตบอร์ด) ตามขนาดที่เลือกจริง
 * สินค้า: templateIds = 5 ชุด · calendarStudio = { yearLabel: "", formats: [] } (ขนาดงานมาจากเทมเพลตล้วน แบบเคสมือถือ)
 *   · ไม่ตั้ง studioOff (ผู้ใช้สั่งเปิดจอ) — ถ้าเคยปิดไว้ ปลดให้
 * ลายเดียว/คละลาย: หน้าสินค้าต่อ "-c<N>" ให้ tpl@ เองเมื่อสินค้ามีระบบจำนวนลาย (เรทที่ 1 minPerDesign 1 ✓)
 *   และ 1 หน่วยได้หลายชิ้น (perUnit ของตัวเลือกขนาด 10/5 ✓) → จอออกแบบถามลายเดียว/คละลาย + แถบรูปย่อรายชิ้น
 *   (โค้ดเดียวกับโปสการ์ด print@…-c8 · 16 ต.ค. 69) — ไม่ต้องแก้โค้ด
 * รันซ้ำได้ · ไม่แตะราคา/ตัวเลือก/ไฟล์ในชุด
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, whenList, type DesignTemplate, type TemplateFile } from "../src/lib/design-templates";
import { perUnitCapacity, type Product } from "../src/lib/products";

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

const PRODUCT = "broochbadge-th";
const SIZE = "ขนาด";
const CATEGORY = "เข็มกลัดพลาสติก";

/* ── 1. สินค้า + ตัวเลือกขนาด ── */
const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (perr || !prow) die(`อ่าน ${PRODUCT} ไม่ได้: ${perr?.message}`);
const product = prow!.data as Product;
const sizeChoices = product.options.find((o) => o.label === SIZE)?.choices.map((c) => c.name) ?? die(`${PRODUCT} ไม่มีกลุ่ม "${SIZE}"`);

/** ค่าตัวเลือก "ขนาด" ที่ชุดเทมเพลตนี้ใช้ — อ่านจากชื่อชุด: "PinnCircle 2.5cm" → ทรงกลม 25mm · "PinHeart …" → ทรงหัวใจ */
function sizeChoiceOf(t: DesignTemplate): string | null {
  const n = t.name;
  if (/heart/i.test(n)) return sizeChoices.find((c) => /^ทรงหัวใจ/.test(c)) ?? null;
  const m = /circle\s*(\d+(?:\.\d+)?)\s*cm/i.exec(n);
  if (!m) return null;
  const mm = Math.round(Number(m[1]) * 10);
  return sizeChoices.find((c) => new RegExp(`^ทรงกลม\\s*${mm}\\s*mm`).test(c)) ?? null;
}

/* ── 2. ชุดเทมเพลตหมวดเข็มกลัดพลาสติก ── */
const { data: trows } = await sb.from("products").select("id,data").eq("category", "__templates__");
type Row = { id: string; data: DesignTemplate & { retiredPaths?: string[] } };
const sets = ((trows ?? []) as Row[]).filter((r) => (r.data.category ?? "").trim() === CATEGORY && !r.data.hidden);
if (!sets.length) die(`ไม่มีชุดเทมเพลตหมวด "${CATEGORY}"`);

const plan: { row: Row; choice: string; file: TemplateFile; next: TemplateFile; changed: boolean }[] = [];
for (const row of sets) {
  const t = row.data;
  const choice = sizeChoiceOf(t) ?? die(`ชุด "${t.name}" (${t.id}) อ่านขนาดจากชื่อไม่ออก / ไม่ตรงตัวเลือกไหนใน "${SIZE}"`);
  const files = t.files ?? [];
  if (files.length !== 1) die(`ชุด "${t.name}" มี ${files.length} ไฟล์ (คาดว่า 1 ไฟล์ต่อชุด)`);
  const f = files[0];
  if (!f.fileUrl || !f.widthMm || !f.heightMm) die(`ชุด "${t.name}" ไฟล์ยังไม่มี .ai หรือไม่รู้ขนาดอาร์ตบอร์ด`);
  const want = [{ label: SIZE, choices: [choice] }];
  const changed = JSON.stringify(whenList(f)) !== JSON.stringify(want);
  plan.push({ row, choice, file: f, next: { ...f, when: want }, changed });
}
// ขนาดเดียวต้องมีชุดเดียว · ทุกขนาดต้องมีชุด
const byChoice = new Map<string, typeof plan>();
for (const p of plan) byChoice.set(p.choice, [...(byChoice.get(p.choice) ?? []), p]);
for (const [c, ps] of byChoice) if (ps.length > 1) die(`ขนาด "${c}" มีชุดเทมเพลตซ้ำ ${ps.length} ชุด: ${ps.map((p) => p.row.data.name).join(" · ")}`);
const noTpl = sizeChoices.filter((c) => !byChoice.has(c));

/* ── 3. รูปแบบจอออกแบบที่หน้าสินค้าจะได้ (จำลองกติกาใน ProductDetail: tpl@กว้างxสูง[-cN]) ── */
console.log(`📌 ${product.name} (${PRODUCT}) · ชุดเทมเพลตหมวด "${CATEGORY}" ${sets.length} ชุด`);
const seenPreview = new Map<string, string>();
for (const c of sizeChoices) {
  const p = byChoice.get(c);
  if (!p) {
    console.log(`   ⚠️ ${c} → ไม่มีชุดเทมเพลต (จอออกแบบจะไม่รู้ขนาด)`);
    continue;
  }
  const { row, file, next, changed } = p[0];
  const sel = { [SIZE]: c };
  const per = perUnitCapacity(product, sel);
  const tplKey = `tpl@${Math.round(file.widthMm! * 10) / 10}x${Math.round(file.heightMm! * 10) / 10}`;
  const fmt = per && per > 1 && per <= 20 ? `${tplKey}-c${per}` : tplKey;
  // ไฟล์ซ้ำกันข้ามขนาด (พรีวิว/ขนาดอาร์ตบอร์ดเท่ากัน) = น่าจะอัปไฟล์ผิดชุด
  const sig = `${file.previewUrl ? await md5Of(file.previewUrl) : ""}|${file.widthMm}x${file.heightMm}`;
  const dup = file.previewUrl && seenPreview.get(sig);
  if (file.previewUrl) seenPreview.set(sig, c);
  console.log(
    `   ${changed ? "✎" : "✓"} ${c} ← "${row.data.name}" (${row.data.id}) · อาร์ตบอร์ด ${file.widthMm}×${file.heightMm} มม. · จอ ${fmt}${per ? ` (เซตละ ${per} ชิ้น → ถามลายเดียว/คละลาย)` : ""}` +
      (changed ? ` · ตั้ง when ${SIZE}=${next.when![0].choices[0]}` : ""),
  );
  if (dup) console.log(`      ⚠️ ไฟล์/ขนาดอาร์ตบอร์ดเหมือนชุดของ "${dup}" ทุกประการ — ตรวจว่าอัปไฟล์ถูกชุดไหม`);
  // ยืนยันว่าหลังตั้ง when แล้ว filesForSelections หยิบไฟล์นี้ไฟล์เดียวจริง
  const after = filesForSelections({ ...row.data, files: [next] }, sel);
  if (after.length !== 1 || after[0].id !== file.id) die(`${c}: filesForSelections หลังตั้ง when ได้ ${after.length} ไฟล์`);
  for (const other of sizeChoices.filter((x) => x !== c)) {
    if (filesForSelections({ ...row.data, files: [next] }, { [SIZE]: other }).length) die(`${c}: ไฟล์ยังโผล่ตอนเลือก "${other}"`);
  }
}
/** md5 ของรูปพรีวิว — ระบบเรนเดอร์พรีวิวจากไฟล์ .ai ตอนอัป ไฟล์เนื้อหาเดียวกันจะได้รูปเดียวกัน */
async function md5Of(url: string): Promise<string> {
  try {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    return createHash("md5").update(buf).digest("hex");
  } catch {
    return url;
  }
}
if (noTpl.length) console.log(`   ⚠️ ขนาดที่ยังไม่มีชุดเทมเพลต: ${noTpl.join(", ")}`);

const ids = product.templateIds ?? [];
const addIds = sets.map((s) => s.data.id).filter((id) => !ids.includes(id));
const hasStudio = !!product.calendarStudio && !(product.calendarStudio.formats?.length);
const productChanged = addIds.length > 0 || !hasStudio || product.studioOff === true;
console.log(`🎨 สินค้า: templateIds ${ids.length} → ${ids.length + addIds.length} ชุด · calendarStudio ${hasStudio ? "ตั้งแล้ว" : "ตั้งใหม่ (formats ว่าง = ขนาดจากเทมเพลต)"} · studioOff ${product.studioOff === true ? "true → ปลด (เปิดปุ่ม 🎨 ออกแบบบนเว็บ)" : "ไม่ได้ตั้ง (ปุ่มเปิด)"}`);
const nTpl = plan.filter((p) => p.changed).length;
if (!nTpl && !productChanged) {
  console.log("✅ ตั้งครบแล้ว — ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(dry-run — จะแก้ชุดเทมเพลต ${nTpl} ชุด${productChanged ? " + สินค้า" : ""} · ใส่ --write เพื่อบันทึก)`);
  process.exit(0);
}

/* ── 4. เขียน ── */
for (const p of plan.filter((x) => x.changed)) {
  const data = { ...p.row.data, files: [p.next], savedAt: new Date().toISOString() };
  const { error } = await sb.from("products").update({ data }).eq("id", p.row.id);
  if (error) die(`บันทึกชุด ${p.row.data.id} ไม่สำเร็จ: ${error.message}`);
  console.log(`   ✅ ชุด "${p.row.data.name}" ตั้ง when ${SIZE}=${p.choice}`);
}
if (productChanged) {
  const next: Product = {
    ...product,
    templateIds: [...ids, ...addIds],
    calendarStudio: hasStudio ? product.calendarStudio : { yearLabel: "", formats: [] },
    savedAt: new Date().toISOString(),
  };
  delete next.studioOff;
  const { error } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
  if (error) die(`บันทึกสินค้าไม่สำเร็จ: ${error.message}`);
  const { data: chk } = await sb.from("products").select("data").eq("id", PRODUCT).single();
  const back = chk!.data as Product;
  if (!sets.every((s) => back.templateIds?.includes(s.data.id)) || !back.calendarStudio || back.studioOff === true) die("อ่านกลับมาไม่ตรง (templateIds / calendarStudio / studioOff)");
  console.log(`   ✅ ${product.name}: ผูก ${sets.length} ชุด + เปิดจอออกแบบบนเว็บ (calendarStudio) — หน้าเว็บจริงแคช 1 ชม. ถ้าอยากเห็นทันทีให้บันทึกสินค้าจากหลังบ้าน 1 ครั้ง`);
}
