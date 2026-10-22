/**
 * 👜 กระเป๋าจุกจิก 3 ตัว ผูกเทมเพลตหมวด "knickknack bag" + เปิดออกแบบบนเว็บ + เส้นตัด/รองขาว
 * (เจ้าของร้านสั่ง 22 ต.ค. 69 "ลิ้งค์กับเทมเพลต สำหรับ ตำแหน่งงาน: ไม่เน้นตำแหน่ง · เพิ่มการออกแบบบนเว็บ · มีเลเยอร์รองขาวด้วย")
 *
 *   npx tsx scripts/knickknack-bag-template-link.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/knickknack-bag-template-link.mts --write    # บันทึก + ล้างแคชหน้าสินค้า/ชุดบนเว็บจริง
 *
 * สินค้าทั้ง 3 ไม่มีกลุ่ม "ตำแหน่งงาน" (ข้อความติดมาจากผ้าขนหนู) และไม่มีกลุ่มที่แยกไฟล์ → ผูกชุดตรง ๆ ไม่ตั้ง optionLabel/when (แบบป้ายขาตั้ง)
 *   candy-bag (CANDY BAG)        ← tpl-k83wfdovg "Candy bag" · ⚠️ PDF ที่ฝังใน .ai เป็นเวอร์ชันเก่า (หน้า 112.5×95 · กรอบ 88×80) ไม่ตรงงานจริง —
 *     สกิน F-01 (ส่งออกจาก Illustrator 300 dpi = 1335×1182 px) = อาร์ตบอร์ดจริง 113.03×100.08 มม. → จอยืดสกินผิดสัดส่วน เส้นตัดกับสกินเหลื่อม
 *     → ยึดสกิน: widthMm/heightMm = 113.03×100.08 · รูร้อยโซ่ ศูนย์กลาง (93.43, 91.27) Ø5.1 (วัดเส้นแดงในสกิน)
 *     เส้นตัด/รองขาว = "ขอบนอกสุดของถุง" (หัวถุง + แถบซิป + ขอบหยักสองข้าง) ลากจากสกินด้วย scripts/py/skin-outline-cut.py
 *     (เคยตัดใต้ซิปด้วย --min-y-mm 18.12 แล้วเจ้าของร้านสั่งถอยกลับ "สกรีนได้ถึงซิป" 22 ต.ค. 69)
 *     (เจ้าของร้านทัก 22 ต.ค. 69 "มันสามารถสกรีนได้เต็มชิ้นงาน" — รอบแรกใช้กรอบในเส้นแดง 85×81 ลายเลยไม่เต็มถุง)
 *   passport-case → ⚠️ ย้ายไป scripts/passport-2side-templates.mts แล้ว (22 ต.ค. 69 เทมเพลตใหม่ 1 ด้าน/2 ด้าน + ด้านใน) — ห้ามใส่กลับที่นี่ จะทับ when/เส้นตัดใหม่
 *   hologram-bag (กระเป๋าโฮโลแกรม) ← tpl-ewsr369y6 "ZipLock" 210×153 · พิมพ์ได้เฉพาะ "ช่องกลาง" ของสกิน (เขตโปร่ง 163.2×106.2 @23.45)
 *     กรอบโฮโลแกรมรอบช่อง = เนื้อถุงโฮโลแกรม ไม่พิมพ์ (เจ้าของร้านวงแดง 22 ต.ค. 69 "ถ้าภาพวางเกินตรงเส้นสีแดง ให้ตัดทึบไปเลย" — รอบแรกใช้ขอบถุง 204×147 ลายเลยทับกรอบ)
 *     → เส้นตัด/รองขาว = ช่องกลาง (skin-outline-cut.py --window) + skinOpaque (จอวางกรอบโฮโลทึบทับลายที่เกิน)
 * เส้นตัดดึงจากไฟล์ .ai ด้วย scripts/py/red-outer-cut.py (ธงต่อไฟล์ด้านล่าง) → TemplateFile.cutCurves + whiteUnder: true
 *   → จอออกแบบครอปลายตามกรอบ · .ai มีเลเยอร์ "รองขาว (White)" + "เส้นตัด (CutContour)" · .pdf มีหน้ารองขาว/เส้นไดคัท
 * สินค้า: templateIds += ชุดของตัวเอง · calendarStudio { yearLabel: "", formats } (คงค่าอื่นที่มีอยู่ เช่น mock3d) · ถอด studioOff
 *   formats ต่อสินค้า (PAIRS.formats · ไม่ตั้ง = []): Candy bag "สกรีน 2 ด้าน" = tpl2 → จอ 2 หน้า ด้านหน้า/ด้านหลัง ใช้เทมเพลตเดียวกัน
 *   (เจ้าของร้านสั่ง 22 ต.ค. 69 "เพิ่มสกรีน 2 ด้านให้หน่อย" · โครงเดียวกับผ้าขนหนู/พัด) · Passport "2ด้าน" ยังหน้าเดียว (ด้านในได้แค่ 1 ฝั่ง — ไม่มีเทมเพลตด้านใน)
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, templateFrame, type DesignTemplate, type TemplateCurve, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
/**
 * ค่าจากสกิน: w/h = ขนาดสกินจริง (มม.) · hole = รูกลม (ต่อท้าย) · window = เส้นตัดคือช่องโปร่งกลางสกิน (ไม่ใช่ขอบนอก) · opaque = TemplateFile.skinOpaque
 * fullFace = TemplateFile.fullFace — ช่องรูปว่างโชว์เต็มเส้นตัด ไม่เดาหน้างานจากเส้นแดงในสกิน (Candy bag 22 ต.ค. 69 "ขยายกรอบนี้หน่อย เพราะมันสกรีนเต็มได้")
 */
type SkinOverride = { w: number; h: number; hole?: { cx: number; cy: number; r: number }; window?: boolean; opaque?: boolean; fullFace?: boolean; minYMm?: number; mirrorBack?: boolean };
type Fmt = { format: string; when?: { label: string; choices: string[] }[] };
const PAIRS: { product: string; tpl: string; flags: string[]; holes: number; skin?: SkinOverride; formats?: Fmt[] }[] = [
  {
    product: "candy-bag",
    tpl: "tpl-k83wfdovg",
    flags: [],
    holes: 1,
    formats: [{ format: "tpl2", when: [{ label: "สกรีนกี่ด้าน", choices: ["สกรีน 2 ด้าน"] }] }],
    // เต็มถุงรวมแถบซิป + หัวถุง (เจ้าของร้านสั่ง 22 ต.ค. 69 "กลับไปแบบเดิม สกรีนได้ถึงซิป" — เคยลองตัดใต้ซิป minYMm 18.12 แล้วถอยกลับ)
    // mirrorBack: ด้านหลังถุงเห็นกลับข้าง — แถบเทา/รูร้อยโซ่อยู่ฝั่งซ้าย (เจ้าของร้านทัก 22 ต.ค. 69 "ควรจะหักคนละฝั่งกับด้านหน้า เพราะมันเป็นด้านหลัง")
    skin: { w: 113.03, h: 100.08, hole: { cx: 93.43, cy: 91.27, r: 2.55 }, fullFace: true, mirrorBack: true },
  },
  { product: "hologram-bag", tpl: "tpl-ewsr369y6", flags: [], holes: 0, skin: { w: 210.06, h: 153.08, window: true, opaque: true } },
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
const PY = new URL("./py/red-outer-cut.py", import.meta.url).pathname;
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/knickknack-cut/`;
mkdirSync(OUT, { recursive: true });
const flat = (cs?: TemplateCurve[]) => JSON.stringify((cs ?? []).map((c) => [c.s, c.g]));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** รูกลมจากค่าที่วัดในสกิน (4 เบซิเยร์ kappa 0.5523) */
function holeCurve(o: SkinOverride): TemplateCurve {
  const { cx, cy, r } = o.hole!;
  const k = 0.5523 * r;
  const hole: TemplateCurve = {
    s: [r3(cx + r), r3(cy)],
    g: [
      [cx + r, cy + k, cx + k, cy + r, cx, cy + r],
      [cx - k, cy + r, cx - r, cy + k, cx - r, cy],
      [cx - r, cy - k, cx - k, cy - r, cx, cy - r],
      [cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ].map((s) => s.map(r3)) as TemplateCurve["g"],
  };
  return hole;
}
const PY_OUTLINE = new URL("./py/skin-outline-cut.py", import.meta.url).pathname;

type Row = { id: string; data: DesignTemplate };
type Plan = { pair: (typeof PAIRS)[number]; row: Row; nextTpl: DesignTemplate | null; product: Product; prodChanged: boolean; ids: string[]; studio: NonNullable<Product["calendarStudio"]> };
const plans: Plan[] = [];
for (const pair of PAIRS) {
  const { data: trow } = await sb.from("products").select("id,data").eq("id", `__template_${pair.tpl}`).single();
  const row = (trow as Row | null) ?? die(`ไม่พบชุด ${pair.tpl}`);
  const t = row.data;
  // ไฟล์ไกด์ด้านหลัง (backGuide · ไม่มี .ai ของตัวเอง) แยกออกก่อน — สคริปต์นี้สร้างเองจาก mirrorBack
  const files = (t.files ?? []).filter((x) => !x.backGuide);
  const oldBack = (t.files ?? []).find((x) => x.backGuide) as (TemplateFile & { mirrorOf?: string }) | undefined;
  if (files.length !== 1 || !files[0].fileUrl || !files[0].widthMm || !files[0].heightMm) die(`ชุด "${t.name}" ต้องมีไฟล์ .ai เดียวที่รู้ขนาด`);
  if (t.optionLabel || files[0].choice || files[0].when) die(`ชุด "${t.name}" มี optionLabel/choice/when ค้างอยู่ — ตรวจก่อน`);
  const f0 = files[0];
  // สกินที่สัดส่วนไม่ตรงอาร์ตบอร์ดเกิน 1% = ไฟล์มี PDF เก่าฝังอยู่ → ต้องมี skin override (ไม่เดา)
  type Res = { error?: string; w: number; h: number; curves: TemplateCurve[]; box: number[]; holes: number };
  let res: Res;
  if (pair.skin) {
    const o = pair.skin;
    if (!f0.skinUrl) die(`${t.name}: ไม่มีสกินให้ลากขอบ`);
    const local = `${OUT}${t.id}-skin.png`;
    writeFileSync(local, Buffer.from(await (await fetch(f0.skinUrl!)).arrayBuffer()));
    const out = JSON.parse(execFileSync(PYTHON, ["-I", PY_OUTLINE, local, ...(o.window ? ["--window"] : []), ...(o.minYMm ? ["--min-y-mm", String(o.minYMm)] : [])], { encoding: "utf8" })) as Res;
    if (out.error) die(`${t.name}: ${out.error}`);
    if (Math.abs(out.w - o.w) > 0.1 || Math.abs(out.h - o.h) > 0.1) die(`${t.name}: สกิน ${out.w}×${out.h} ≠ ${o.w}×${o.h} (สกินเปลี่ยน — วัดใหม่)`);
    res = { ...out, curves: o.hole ? [...out.curves, holeCurve(o)] : out.curves, holes: o.hole ? 1 : 0 };
  } else {
    const local = `${OUT}${t.id}.ai`;
    writeFileSync(local, Buffer.from(await (await fetch(f0.fileUrl!)).arrayBuffer()));
    res = JSON.parse(execFileSync(PYTHON, ["-I", PY, local, ...pair.flags], { encoding: "utf8" })) as Res;
    if (res.error) die(`${t.name}: ${res.error}`);
    if (Math.abs(res.w - f0.widthMm!) > 0.3 || Math.abs(res.h - f0.heightMm!) > 0.3) die(`${t.name}: อาร์ตบอร์ด ${res.w}×${res.h} ≠ ${f0.widthMm}×${f0.heightMm}`);
  }
  // ขนาดอาร์ตบอร์ดเปลี่ยนเฉพาะเมื่อสกินต่างจากเดิมเกิน 0.3 มม. (Candy bag PDF เก่า) — ZipLock สกินตรงอยู่แล้ว คงค่าเดิม
  const f =
    pair.skin && (Math.abs(pair.skin.w - f0.widthMm!) > 0.3 || Math.abs(pair.skin.h - f0.heightMm!) > 0.3) ? { ...f0, widthMm: pair.skin.w, heightMm: pair.skin.h } : f0;
  const [bx, by, bw, bh] = res.box;
  if (bx < 0 || by < 0 || bx + bw > res.w + 0.01 || by + bh > res.h + 0.01) die(`${t.name}: กรอบหลุดอาร์ตบอร์ด`);
  if (res.holes !== pair.holes) die(`${t.name}: เจอรู ${res.holes} (คาด ${pair.holes})`);
  const nf = { ...f, cutCurves: res.curves, whiteUnder: true, ...(pair.skin?.opaque ? { skinOpaque: true } : {}), ...(pair.skin?.fullFace ? { fullFace: true } : {}) };
  // 🪞 ไกด์ด้านหลังกลับข้าง (สกิน + เส้นตัด + รู) — จอออกแบบหน้า "back" ใช้ผ่าน guide.back
  let back: (TemplateFile & { mirrorOf?: string }) | null = null;
  let backSame = !oldBack;
  if (pair.skin?.mirrorBack) {
    const Wm = f.widthMm!;
    const mx = (x: number) => r3(Wm - x);
    const mirrored = res.curves.map((c) => ({ s: [mx(c.s[0]), c.s[1]] as [number, number], g: c.g.map((g) => [mx(g[0]), g[1], mx(g[2]), g[3], mx(g[4]), g[5]] as TemplateCurve["g"][number]) }));
    back = {
      id: oldBack?.id ?? `f-${Math.random().toString(36).slice(2, 11)}`,
      side: "ด้านหลัง",
      backGuide: true,
      fileName: `${f.fileName ?? t.name} · ด้านหลัง (กลับข้าง)`,
      widthMm: f.widthMm,
      heightMm: f.heightMm,
      skinUrl: oldBack?.mirrorOf === f0.skinUrl ? oldBack?.skinUrl : undefined, // ว่าง = ต้องทำสกินกลับข้างใหม่ตอนเขียน
      mirrorOf: f0.skinUrl,
      cutCurves: mirrored,
      whiteUnder: true,
      ...(pair.skin.fullFace ? { fullFace: true } : {}),
    };
    backSame = !!oldBack && !!back.skinUrl && flat(oldBack.cutCurves) === flat(mirrored);
  }
  const nt: DesignTemplate = { ...t, files: back ? [nf, back] : [nf] };
  const tplSame =
    backSame &&
    flat(f0.cutCurves) === flat(res.curves) && f0.whiteUnder === true && f0.widthMm === f.widthMm && f0.heightMm === f.heightMm && !!f0.skinOpaque === !!pair.skin?.opaque && !!f0.fullFace === !!pair.skin?.fullFace;
  if (filesForSelections(nt, {}).length !== 1 || !templateFrame(nt, nf)) die(`${t.name}: จอออกแบบหากรอบงานไม่ได้`);

  const { data: prow, error } = await sb.from("products").select("data").eq("id", pair.product).single();
  if (error || !prow) die(`อ่านสินค้า ${pair.product} ไม่ได้: ${error?.message}`);
  const product = prow!.data as Product;
  const wantFormats = pair.formats ?? [];
  // formats ที่ตั้งไว้แต่ไม่ใช่ของสคริปต์นี้ (ขนาดกำหนดเอง card/canvas@…) = มีคนตั้งเอง ไม่ทับ
  if (product.calendarStudio?.formats?.some((f) => f.format !== "tpl2")) die(`${pair.product} ตั้ง calendarStudio.formats ไว้เอง — ไม่แตะ`);
  for (const f of wantFormats)
    for (const w of f.when ?? []) {
      const g = product.options?.find((o) => o.label === w.label) ?? die(`${pair.product} ไม่มีกลุ่ม "${w.label}"`);
      for (const c of w.choices) if (!g.choices.some((x) => x.name === c)) die(`${pair.product} กลุ่ม "${w.label}" ไม่มีค่า "${c}"`);
    }
  const cur = product.templateIds ?? [];
  const ids = cur.includes(t.id) ? cur : [...cur, t.id];
  const studio = { ...(product.calendarStudio ?? {}), yearLabel: product.calendarStudio?.yearLabel ?? "", formats: wantFormats };
  const fmtKey = (fs?: Fmt[]) => JSON.stringify((fs ?? []).map((f) => [f.format, (f.when ?? []).map((w) => [w.label, w.choices])]));
  const prodChanged = ids.length !== cur.length || !product.calendarStudio || product.studioOff === true || fmtKey(product.calendarStudio?.formats) !== fmtKey(wantFormats);
  console.log(
    `👜 ${product.name} (${pair.product}) ← "${t.name}" (${t.id}) · อาร์ตบอร์ด ${f.widthMm}×${f.heightMm} · เส้นตัด (${bx},${by}) ${bw}×${bh}${res.holes ? ` + รู ${res.holes}` : ""} · whiteUnder` +
      `\n   ชุด ${tplSame ? "✓" : "✎"} · สินค้า ${prodChanged ? "✎" : "✓"} templateIds ${JSON.stringify(cur)} → ${JSON.stringify(ids)} · calendarStudio ${product.calendarStudio ? "มี" : "-"} · studioOff ${product.studioOff ?? "-"}`,
  );
  plans.push({ pair, row, nextTpl: tplSame ? null : nt, product, prodChanged, ids, studio });
  if (back) console.log(`   🪞 ด้านหลังกลับข้าง ${backSame ? "✓" : "✎"}${back.skinUrl ? "" : " (ทำสกินกลับข้างใหม่)"}`);
}
if (!plans.some((p) => p.nextTpl || p.prodChanged)) {
  console.log("✅ ครบแล้ว — ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(dry-run — ใส่ --write เพื่อบันทึก)`);
  process.exit(0);
}
for (const p of plans) {
  if (p.nextTpl) {
    // 🪞 สกินด้านหลังกลับข้างที่ยังไม่มี → พลิกสกินด้านหน้าแนวนอนแล้วอัป
    const bk = p.nextTpl.files?.find((x) => x.backGuide) as (TemplateFile & { mirrorOf?: string }) | undefined;
    if (bk && !bk.skinUrl && bk.mirrorOf) {
      const src = `${OUT}${p.row.data.id}-front-skin.png`;
      const dst = `${OUT}${p.row.data.id}-back-skin.png`;
      writeFileSync(src, Buffer.from(await (await fetch(bk.mirrorOf)).arrayBuffer()));
      execFileSync(PYTHON, ["-I", "-c", "import sys\nfrom PIL import Image, ImageOps\nImage.MAX_IMAGE_PIXELS=None\nImageOps.mirror(Image.open(sys.argv[1])).save(sys.argv[2])", src, dst]);
      const path = `preview/${randomUUID().slice(0, 8)}-${p.row.data.id}-back-mirror.png`;
      const { error: ue } = await sb.storage.from("design-templates").upload(path, readFileSync(dst), { contentType: "image/png", upsert: false });
      if (ue) die(`อัปสกินกลับข้าง: ${ue.message}`);
      bk.skinUrl = sb.storage.from("design-templates").getPublicUrl(path).data.publicUrl;
      console.log(`   🪞 สกินด้านหลังกลับข้าง → ${path}`);
    }
    const { error } = await sb.from("products").update({ data: { ...p.nextTpl, savedAt: new Date().toISOString() } }).eq("id", p.row.id);
    if (error) die(`บันทึกชุด ${p.row.data.id}: ${error.message}`);
    console.log(`   ✅ ชุด "${p.row.data.name}" เส้นตัด + รองขาว`);
  }
  if (p.prodChanged) {
    // อ่านสินค้าล่าสุดก่อนเขียน แล้วแตะเฉพาะ templateIds / calendarStudio / studioOff
    const { data: fresh } = await sb.from("products").select("data").eq("id", p.pair.product).single();
    const cur = (fresh?.data ?? p.product) as Product;
    const curIds = cur.templateIds ?? [];
    const next: Product = {
      ...cur,
      templateIds: curIds.includes(p.row.data.id) ? curIds : [...curIds, p.row.data.id],
      calendarStudio: { ...(cur.calendarStudio ?? {}), yearLabel: cur.calendarStudio?.yearLabel ?? "", formats: p.studio.formats },
      savedAt: new Date().toISOString(),
    };
    delete next.studioOff;
    const { error } = await sb.from("products").update({ data: next }).eq("id", p.pair.product);
    if (error) die(`บันทึกสินค้า ${p.pair.product}: ${error.message}`);
    console.log(`   ✅ ${p.product.name}: ผูกชุด + เปิดออกแบบบนเว็บ`);
  }
}
await revalidateLive(env, { productIds: PAIRS.map((p) => p.product), templateIds: PAIRS.map((p) => p.tpl) });
