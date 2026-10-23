/**
 * 🚪 ป้ายแขวนประตู (Door Hanger · สินค้า mdf) ผูกเทมเพลตหมวด "ป้ายแขวนประตู" 4 ชุด + เปิดออกแบบบนเว็บ + รองขาวเฉพาะอะคริลิค
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่มการออกแบบบนเว็บให้ด้วย · มีเลเยอร์รองขาวด้วย เฉพาะอะคริลิค")
 *
 *   npx tsx scripts/door-hanger-template-link.mts            # ดูผล (ไม่เขียน) + ภาพตรวจเส้นตัดใน $TMPDIR/door-hanger-cut/
 *   npx tsx scripts/door-hanger-template-link.mts --write    # บันทึก + ล้างแคชหน้าสินค้า/ชุดบนเว็บจริง
 *
 * ชุดผูกกลุ่ม "ชนิดวัสดุ" (optionLabel) — ไฟล์ละค่าวัสดุ:
 *   UV (MDF)                 ← tpl-vyv5ip97b · .ai หน้าแรกว่าง (ทรงจริงล้นอาร์ตบอร์ด) → สกินเป็น "ช่องโปร่ง" (ขาวทึบรอบนอก)
 *                              เส้นตัด = skin-outline-cut.py --window · อาร์ตบอร์ด = ขนาดสกิน 107.7×235.03 (เดิม 107.6×230.7 สกินโดนบีบ)
 *   อะคริลิค (ทรงรูกลม)       ← tpl-1liauh1d9 · เส้นตัด + รูกลม Ø65 = เวกเตอร์ใน .ai (red-outer-cut.py --any-color --holes) · whiteUnder
 *   อะคริลิค 2 (ทรงตะขอ)      ← tpl-nkwfrtlwk · เส้นตัด = เส้นแดงในสกิน (เส้นเทาใน .ai = ขอบตัดตก 102×244) · whiteUnder
 *   กระดาษ (กระดาษ/PET)      ← tpl-ix3eh83m1 · เส้นตัด = เส้นแดงในสกิน · อาร์ตบอร์ด .ai 300×320 (ทรงวางกลางแผ่น) ≠ สกินที่ครอปแล้ว
 *                              → อาร์ตบอร์ด = ขนาดสกิน 105.07×245.11
 * อะคริลิคมี 2 ทรง → เพิ่มกลุ่ม "ทรงป้าย" (โชว์เฉพาะวัสดุอะคริลิค · ไม่บวกราคา) + when ที่ไฟล์อะคริลิค (เจ้าของร้านเลือก 23 ต.ค. 69)
 * รองขาว: เฉพาะไฟล์อะคริลิค (PET เนื้อใสมีกลุ่ม "พิมพ์รองขาว" ของตัวเอง — ไม่แตะ)
 * สินค้า: templateIds = 4 ชุด · calendarStudio { yearLabel: "", formats } (คงค่าอื่น) · ถอด studioOff
 * 🔄 2 ด้าน (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่มออกแบบ 2 ด้าน (หน้า/หลัง) ตอนเลือกสกรีน/พิมพ์ 2 ด้าน"):
 *   formats = tpl2 เมื่อ การสกรีน = สกรีน 2 ด้าน (MDF/อะคริลิค) หรือ การพิมพ์ = พิมพ์ 2 ด้าน (กระดาษ/PET) → จอ 2 หน้า ด้านหน้า/ด้านหลัง
 *   ทรงตะขอ (UV · อะคริลิค 2 · กระดาษ) ด้านหลังเห็นกลับข้าง → ไฟล์ไกด์ backGuide (สกิน + เส้นตัดกลับซ้าย-ขวา) แบบ Candy bag
 *   ทรงแคปซูลรูกลมสมมาตร → ด้านหลังใช้ไกด์เดียวกับด้านหน้า ไม่ต้องมี backGuide
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, templateFrame, type DesignTemplate, type TemplateCurve, type TemplateFile } from "../src/lib/design-templates";
import type { Product, ProductOption } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const PRODUCT = "mdf";
const MAT = "ชนิดวัสดุ";
const SHAPE = "ทรงป้าย";
const ACRYLIC = ["อะคริลิคใส", "อะคริลิคขาวขุ่น C-02", "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)"];
const HOOK = "ทรงตะขอ";
const ROUND = "ทรงแคปซูล รูกลม";
/** cut: "ai" = เวกเตอร์ใน .ai (ธง red-outer-cut.py) · "skin" = สกิน (ธง skin-outline-cut.py) · skinSize = ใช้ขนาดสกินเป็นอาร์ตบอร์ด */
/** mirrorBack = ทรงไม่สมมาตร ด้านหลังกลับข้าง (ตะขออยู่อีกฝั่ง) → สร้างไฟล์ไกด์ด้านหลัง */
type Pair = { tpl: string; choices: string[]; shape?: string; white: boolean; cut: "ai" | "skin"; flags: string[]; holes?: number; skinSize?: { w: number; h: number }; mirrorBack?: boolean };
const PAIRS: Pair[] = [
  { tpl: "tpl-vyv5ip97b", choices: ["MDF"], white: false, cut: "skin", flags: ["--window"], skinSize: { w: 107.7, h: 235.03 }, mirrorBack: true },
  { tpl: "tpl-1liauh1d9", choices: ACRYLIC, shape: ROUND, white: true, cut: "ai", flags: ["--any-color", "--holes"], holes: 1 },
  { tpl: "tpl-nkwfrtlwk", choices: ACRYLIC, shape: HOOK, white: true, cut: "skin", flags: [], mirrorBack: true },
  { tpl: "tpl-ix3eh83m1", choices: ["กระดาษเกาหลี 300 แกรม", "PET เนื้อใส", "PET เนื้อขาว"], white: false, cut: "skin", flags: [], skinSize: { w: 105.07, h: 245.11 }, mirrorBack: true },
];
type Fmt = { format: string; when?: { label: string; choices: string[] }[] };
const FORMATS: Fmt[] = [
  { format: "tpl2", when: [{ label: "การสกรีน", choices: ["สกรีน 2 ด้าน"] }] },
  { format: "tpl2", when: [{ label: "การพิมพ์", choices: ["พิมพ์ 2 ด้าน"] }] },
];
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
const PY_AI = new URL("./py/red-outer-cut.py", import.meta.url).pathname;
const PY_SKIN = new URL("./py/skin-outline-cut.py", import.meta.url).pathname;
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/door-hanger-cut/`;
mkdirSync(OUT, { recursive: true });
const flat = (cs?: TemplateCurve[]) => JSON.stringify((cs ?? []).map((c) => [c.s, c.g]));
const whenKey = (f: TemplateFile) => JSON.stringify(f.when ?? null);

const { data: prow, error: pe } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (pe || !prow) die(`อ่านสินค้า ${PRODUCT} ไม่ได้: ${pe?.message}`);
const product = prow!.data as Product;
const matGroup = product.options.find((o) => o.label === MAT) ?? die(`${PRODUCT} ไม่มีกลุ่ม "${MAT}"`);
for (const f of FORMATS)
  for (const w of f.when ?? []) {
    const g = product.options.find((o) => o.label === w.label) ?? die(`${PRODUCT} ไม่มีกลุ่ม "${w.label}"`);
    for (const c of w.choices) if (!g.choices.some((x) => x.name === c)) die(`${PRODUCT} กลุ่ม "${w.label}" ไม่มีค่า "${c}"`);
  }
for (const p of PAIRS) for (const c of p.choices) if (!matGroup.choices.some((x) => x.name === c)) die(`กลุ่ม "${MAT}" ไม่มีค่า "${c}"`);
const mapped = PAIRS.flatMap((p) => p.choices);
const unmapped = matGroup.choices.map((c) => c.name).filter((n) => !mapped.includes(n));
if (unmapped.length) die(`ค่าวัสดุที่ไม่มีเทมเพลต: ${unmapped.join(", ")} — เพิ่มใน PAIRS ก่อน`);

type Row = { id: string; data: DesignTemplate };
type BackFile = TemplateFile & { mirrorOf?: string };
const plans: { pair: Pair; row: Row; next: DesignTemplate | null }[] = [];
const skins: Record<string, string> = {};
for (const pair of PAIRS) {
  const { data: trow } = await sb.from("products").select("id,data").eq("id", `__template_${pair.tpl}`).single();
  const row = (trow as Row | null) ?? die(`ไม่พบชุด ${pair.tpl}`);
  const t = row.data;
  // ไฟล์ไกด์ด้านหลัง (backGuide · ไม่มี .ai ของตัวเอง) แยกออกก่อน — สคริปต์นี้สร้างเองจาก mirrorBack
  const files = (t.files ?? []).filter((x) => !x.backGuide);
  const oldBack = (t.files ?? []).find((x) => x.backGuide) as BackFile | undefined;
  if (files.length !== 1 || !files[0].fileUrl || !files[0].widthMm || !files[0].heightMm || !files[0].skinUrl) die(`ชุด "${t.name}" ต้องมีไฟล์ .ai เดียวที่รู้ขนาด + มีสกิน`);
  const f0 = files[0];
  if (t.optionLabel && t.optionLabel !== MAT) die(`ชุด "${t.name}" ผูกกลุ่ม "${t.optionLabel}" อยู่แล้ว — ตรวจก่อน`);
  type Res = { error?: string; w: number; h: number; curves: TemplateCurve[]; box: number[]; holes?: number };
  let res: Res;
  const skinLocal = `${OUT}${t.id}-skin.png`;
  writeFileSync(skinLocal, Buffer.from(await (await fetch(f0.skinUrl!)).arrayBuffer()));
  skins[t.id] = skinLocal;
  if (pair.cut === "ai") {
    const local = `${OUT}${t.id}.ai`;
    writeFileSync(local, Buffer.from(await (await fetch(f0.fileUrl!)).arrayBuffer()));
    res = JSON.parse(execFileSync(PYTHON, ["-I", PY_AI, local, ...pair.flags], { encoding: "utf8" })) as Res;
  } else {
    res = JSON.parse(execFileSync(PYTHON, ["-I", PY_SKIN, skinLocal, ...pair.flags], { encoding: "utf8" })) as Res;
  }
  if (res.error) die(`${t.name}: ${res.error}`);
  const want = pair.skinSize ?? { w: f0.widthMm!, h: f0.heightMm! };
  if (Math.abs(res.w - want.w) > 0.3 || Math.abs(res.h - want.h) > 0.3) die(`${t.name}: ขนาด ${res.w}×${res.h} ≠ ${want.w}×${want.h} (ไฟล์/สกินเปลี่ยน — วัดใหม่)`);
  if ((res.holes ?? 0) !== (pair.holes ?? 0)) die(`${t.name}: เจอรู ${res.holes ?? 0} (คาด ${pair.holes ?? 0})`);
  const [bx, by, bw, bh] = res.box;
  if (bx < 0 || by < 0 || bx + bw > want.w + 0.01 || by + bh > want.h + 0.01) die(`${t.name}: กรอบหลุดอาร์ตบอร์ด`);
  writeFileSync(`${OUT}${t.id}-cut.json`, JSON.stringify(res));

  const { whiteUnder: _w, when: _wh, choice: _c, choices: _cs, ...fBase } = f0;
  const nf: TemplateFile = {
    ...fBase,
    widthMm: want.w,
    heightMm: want.h,
    choices: pair.choices,
    ...(pair.shape ? { when: [{ label: SHAPE, choices: [pair.shape] }] } : {}),
    cutCurves: res.curves,
    ...(pair.white ? { whiteUnder: true } : {}),
  };
  // 🪞 ไกด์ด้านหลังกลับข้าง (สกิน + เส้นตัด) — ค่าวัสดุ/ทรงเดียวกับด้านหน้า (filesForSelections includeEmpty ต้องหาเจอ)
  let back: BackFile | null = null;
  if (pair.mirrorBack) {
    const mx = (x: number) => Math.round((want.w - x) * 1000) / 1000;
    const mirrored = res.curves.map((c) => ({ s: [mx(c.s[0]), c.s[1]] as [number, number], g: c.g.map((g) => [mx(g[0]), g[1], mx(g[2]), g[3], mx(g[4]), g[5]] as TemplateCurve["g"][number]) }));
    back = {
      id: oldBack?.id ?? `f-${Math.random().toString(36).slice(2, 11)}`,
      side: "ด้านหลัง",
      backGuide: true,
      fileName: `${(f0.fileName ?? t.name).replace(/\.[^.]+$/, "")} · ด้านหลัง (กลับข้าง)`,
      widthMm: want.w,
      heightMm: want.h,
      choices: pair.choices,
      ...(pair.shape ? { when: [{ label: SHAPE, choices: [pair.shape] }] } : {}),
      skinUrl: oldBack?.mirrorOf === f0.skinUrl ? oldBack?.skinUrl : undefined, // ว่าง = ทำสกินกลับข้างใหม่ตอนเขียน
      mirrorOf: f0.skinUrl,
      cutCurves: mirrored,
      ...(pair.white ? { whiteUnder: true } : {}),
    };
  }
  const backSame = back
    ? !!oldBack && !!back.skinUrl && flat(oldBack.cutCurves) === flat(back.cutCurves) && whenKey(oldBack) === whenKey(back) &&
      JSON.stringify(oldBack.choices ?? []) === JSON.stringify(back.choices) && !!oldBack.whiteUnder === pair.white && oldBack.widthMm === want.w
    : !oldBack;
  const nt: DesignTemplate = { ...t, optionLabel: MAT, optionProductId: PRODUCT, files: back ? [nf, back] : [nf] };
  const sel = { [MAT]: pair.choices[0], ...(pair.shape ? { [SHAPE]: pair.shape } : {}) };
  if (filesForSelections(nt, sel).length !== 1 || !templateFrame(nt, nf)) die(`${t.name}: จอออกแบบหากรอบงานไม่ได้`);
  const same =
    backSame &&
    t.optionLabel === MAT &&
    JSON.stringify(f0.choices ?? []) === JSON.stringify(nf.choices) &&
    whenKey(f0) === whenKey(nf) &&
    flat(f0.cutCurves) === flat(nf.cutCurves) &&
    !!f0.whiteUnder === pair.white &&
    f0.widthMm === want.w &&
    f0.heightMm === want.h;
  console.log(
    `🚪 "${t.name}" (${t.id}) ← ${pair.choices.join(" | ")}${pair.shape ? ` · ${SHAPE}=${pair.shape}` : ""}` +
      `\n   อาร์ตบอร์ด ${f0.widthMm}×${f0.heightMm} → ${want.w}×${want.h} · เส้นตัด (${bx},${by}) ${bw}×${bh}${res.holes ? ` + รู ${res.holes}` : ""}${pair.white ? " · รองขาว" : ""} · ${same ? "✓" : "✎"}` +
      (back ? `\n   🪞 ด้านหลังกลับข้าง ${backSame ? "✓" : "✎"}${back.skinUrl ? "" : " (ทำสกินกลับข้างใหม่)"}` : ""),
  );
  plans.push({ pair, row, next: same ? null : nt });
}

// 🔷 กลุ่ม "ทรงป้าย" — โชว์เฉพาะวัสดุอะคริลิค ต่อจาก "สีอะคริลิค" (ไม่บวกราคา)
// ภาพ = สกินทรงนั้นวางกลางจัตุรัส เห็นเต็มชิ้น — การ์ดตัวเลือกครอปภาพเป็นจัตุรัส สกินแนวตั้งตรง ๆ เลยเห็นแค่กลางชิ้น (เจ้าของร้านทัก 23 ต.ค. 69)
const THUMB_V = "v1";
const thumbPath = (tpl: string) => `preview/door-hanger-shape-${tpl}-${THUMB_V}.png`;
const skinOf = (tpl: string) => sb.storage.from("design-templates").getPublicUrl(thumbPath(tpl)).data.publicUrl;
const shapeGroup: ProductOption = {
  label: SHAPE,
  display: "cards",
  section: matGroup.section,
  showWhen: { label: MAT, choices: ACRYLIC },
  choices: [
    { name: HOOK, desc: "ทรงตะขอเกี่ยวลูกบิด ขนาดประมาณ 10 × 24 ซม.", imageSrc: skinOf("tpl-nkwfrtlwk") },
    { name: ROUND, desc: "ทรงมนหัวท้าย เจาะรูกลมสวมลูกบิด ขนาดประมาณ 9 × 20 ซม.", imageSrc: skinOf("tpl-1liauh1d9") },
  ],
} as ProductOption;
const ids = PAIRS.map((p) => p.tpl);
const hasShape = product.options.some((o) => o.label === SHAPE);
const fmtKey = (fs?: Fmt[]) => JSON.stringify((fs ?? []).map((f) => [f.format, (f.when ?? []).map((w) => [w.label, w.choices])]));
const curShape = product.options.find((o) => o.label === SHAPE);
const thumbsChanged = !curShape || shapeGroup.choices.some((c) => curShape.choices.find((x) => x.name === c.name)?.imageSrc !== c.imageSrc);
const prodChanged =
  thumbsChanged ||
  !hasShape ||
  JSON.stringify(product.templateIds ?? []) !== JSON.stringify(ids) ||
  !product.calendarStudio ||
  product.studioOff === true ||
  fmtKey(product.calendarStudio.formats) !== fmtKey(FORMATS);
console.log(
  `\n📦 ${product.name} (${PRODUCT}) · ${prodChanged ? "✎" : "✓"} templateIds ${JSON.stringify(product.templateIds ?? [])} → ${JSON.stringify(ids)}` +
    ` · calendarStudio ${product.calendarStudio ? "มี" : "-"} · กลุ่ม "${SHAPE}" ${hasShape ? "มีแล้ว" : "เพิ่มใหม่"}`,
);
// formats ที่ไม่ใช่ tpl2 (ขนาดกำหนดเอง card/canvas@…) = มีคนตั้งเอง ไม่ทับ
if (product.calendarStudio?.formats?.some((f) => f.format !== "tpl2")) die(`${PRODUCT} ตั้ง calendarStudio.formats ไว้เอง — ไม่แตะ`);

// ภาพตรวจ: เส้นตัด (แดง) + รู ทับสกิน
for (const p of plans) {
  const id = p.row.data.id;
  execFileSync(PYTHON, [
    "-I",
    "-c",
    `import json,sys
from PIL import Image, ImageDraw
im=Image.open(sys.argv[1]).convert('RGBA'); r=json.load(open(sys.argv[2])); S=im.width/r['w']
bg=Image.new('RGBA',im.size,(220,235,255,255)); bg.alpha_composite(im); d=ImageDraw.Draw(bg)
for c in r['curves']:
  pts=[tuple(c['s'])]+[(g[4],g[5]) for g in c['g']]
  d.line([(x*S,y*S) for x,y in pts+[pts[0]]],fill=(0,160,255,255),width=5)
bg.convert('RGB').resize((im.width//3,im.height//3)).save(sys.argv[3])`,
    skins[id],
    `${OUT}${id}-cut.json`,
    `${OUT}${id}-check.png`,
  ]);
}
console.log(`   ภาพตรวจเส้นตัด: ${OUT}*-check.png`);

if (!plans.some((p) => p.next) && !prodChanged) {
  console.log("✅ ครบแล้ว — ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(dry-run — ใส่ --write เพื่อบันทึก)`);
  process.exit(0);
}
for (const p of plans) {
  if (!p.next) continue;
  // 🪞 สกินด้านหลังกลับข้างที่ยังไม่มี → พลิกสกินด้านหน้าแนวนอนแล้วอัป
  const bk = p.next.files?.find((x) => x.backGuide) as BackFile | undefined;
  if (bk && !bk.skinUrl && bk.mirrorOf) {
    const src = skins[p.row.data.id];
    const dst = `${OUT}${p.row.data.id}-back-skin.png`;
    execFileSync(PYTHON, ["-I", "-c", "import sys\nfrom PIL import Image, ImageOps\nImage.MAX_IMAGE_PIXELS=None\nImageOps.mirror(Image.open(sys.argv[1])).save(sys.argv[2])", src, dst]);
    const path = `preview/${randomUUID().slice(0, 8)}-${p.row.data.id}-back-mirror.png`;
    const { error: ue } = await sb.storage.from("design-templates").upload(path, readFileSync(dst), { contentType: "image/png", upsert: false });
    if (ue) die(`อัปสกินกลับข้าง: ${ue.message}`);
    bk.skinUrl = sb.storage.from("design-templates").getPublicUrl(path).data.publicUrl;
    console.log(`   🪞 สกินด้านหลังกลับข้าง → ${path}`);
  }
  const { error } = await sb.from("products").update({ data: { ...p.next, savedAt: new Date().toISOString() } }).eq("id", p.row.id);
  if (error) die(`บันทึกชุด ${p.row.data.id}: ${error.message}`);
  console.log(`   ✅ ชุด "${p.row.data.name}" ผูกวัสดุ + เส้นตัด${p.pair.white ? " + รองขาว" : ""}`);
}
if (prodChanged) {
  if (thumbsChanged)
    for (const tpl of ["tpl-nkwfrtlwk", "tpl-1liauh1d9"]) {
      const dst = `${OUT}${tpl}-shape-thumb.png`;
      execFileSync(PYTHON, [
        "-I",
        "-c",
        `import sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGBA'); N=800; m=int(N*0.06)
k=min((N-2*m)/im.width,(N-2*m)/im.height); im=im.resize((round(im.width*k),round(im.height*k)),Image.LANCZOS)
bg=Image.new('RGBA',(N,N),(255,255,255,255)); bg.alpha_composite(im,((N-im.width)//2,(N-im.height)//2)); bg.convert('RGB').save(sys.argv[2])`,
        skins[tpl],
        dst,
      ]);
      const { error: ue } = await sb.storage.from("design-templates").upload(thumbPath(tpl), readFileSync(dst), { contentType: "image/png", upsert: true });
      if (ue) die(`อัปภาพทรงป้าย: ${ue.message}`);
      console.log(`   🖼 ภาพทรงป้าย → ${thumbPath(tpl)}`);
    }
  // อ่านสินค้าล่าสุดก่อนเขียน แล้วแตะเฉพาะ options (เพิ่มทรงป้าย) / templateIds / calendarStudio / studioOff
  const { data: fresh } = await sb.from("products").select("data").eq("id", PRODUCT).single();
  const cur = (fresh?.data ?? product) as Product;
  const opts = [...cur.options];
  const si = opts.findIndex((o) => o.label === SHAPE);
  // มีกลุ่มแล้ว → เปลี่ยนเฉพาะภาพของแต่ละทรง (คงข้อความที่อาจแก้ในหลังบ้าน)
  if (si >= 0)
    opts[si] = { ...opts[si], choices: opts[si].choices.map((c) => ({ ...c, imageSrc: shapeGroup.choices.find((x) => x.name === c.name)?.imageSrc ?? c.imageSrc })) };
  else {
    const at = opts.findIndex((o) => o.label === "สีอะคริลิค");
    opts.splice(at >= 0 ? at + 1 : opts.findIndex((o) => o.label === MAT) + 1, 0, shapeGroup);
  }
  const next: Product = {
    ...cur,
    options: opts,
    templateIds: ids,
    calendarStudio: { ...(cur.calendarStudio ?? {}), yearLabel: cur.calendarStudio?.yearLabel ?? "", formats: FORMATS },
    savedAt: new Date().toISOString(),
  };
  delete next.studioOff;
  const { error } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
  if (error) die(`บันทึกสินค้า ${PRODUCT}: ${error.message}`);
  console.log(`   ✅ ${product.name}: ทรงป้าย + ผูก 4 ชุด + ออกแบบบนเว็บ (2 ด้าน = tpl2)`);
}
await revalidateLive(env, { productIds: [PRODUCT], templateIds: ids });
