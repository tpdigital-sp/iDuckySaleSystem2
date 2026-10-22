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
 *     เส้นตัด/รองขาว = "ขอบนอกสุดของถุง" (หัวถุง + ขอบหยักสองข้าง) ลากจากสกินด้วย scripts/py/skin-outline-cut.py
 *     (เจ้าของร้านทัก 22 ต.ค. 69 "มันสามารถสกรีนได้เต็มชิ้นงาน" — รอบแรกใช้กรอบในเส้นแดง 85×81 ลายเลยไม่เต็มถุง)
 *   passport-case (PASSPORT CASE) ← tpl-zml0082mh "Passport" 221×149 · เลเยอร์ "นอก" กรอบมุมมนแดง 216×144 @2.5 = ขอบปกกาง (สัน 7.4 มม. ไม่ใช่เส้นตัด)
 *   hologram-bag (กระเป๋าโฮโลแกรม) ← tpl-ewsr369y6 "ZipLock" 210×153 · กรอบมุมมน "ดำ" 204×147 @3 = ขอบถุง (เลเยอร์ "เอาออก" = รูปโฮโลแกรมตัวอย่าง)
 * เส้นตัดดึงจากไฟล์ .ai ด้วย scripts/py/red-outer-cut.py (ธงต่อไฟล์ด้านล่าง) → TemplateFile.cutCurves + whiteUnder: true
 *   → จอออกแบบครอปลายตามกรอบ · .ai มีเลเยอร์ "รองขาว (White)" + "เส้นตัด (CutContour)" · .pdf มีหน้ารองขาว/เส้นไดคัท
 * สินค้า: templateIds += ชุดของตัวเอง · calendarStudio { yearLabel: "", formats: [] } (คงค่าอื่นที่มีอยู่) · ถอด studioOff
 * ⚠️ "สกรีน 2 ด้าน" ของ Candy bag / Passport ยังเป็นจอหน้าเดียว (ไฟล์ร้านมีผืนเดียว) — ถ้าต้องการหน้า 2 ต้องเพิ่ม formats tpl2 + when แบบผ้าขนหนู
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, templateFrame, type DesignTemplate, type TemplateCurve } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
type SkinOverride = { w: number; h: number; hole: { cx: number; cy: number; r: number } };
const PAIRS: { product: string; tpl: string; flags: string[]; holes: number; skin?: SkinOverride }[] = [
  {
    product: "candy-bag",
    tpl: "tpl-k83wfdovg",
    flags: [],
    holes: 1,
    skin: { w: 113.03, h: 100.08, hole: { cx: 93.43, cy: 91.27, r: 2.55 } },
  },
  { product: "passport-case", tpl: "tpl-zml0082mh", flags: [], holes: 0 },
  { product: "hologram-bag", tpl: "tpl-ewsr369y6", flags: ["--any-color"], holes: 0 },
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
  const { cx, cy, r } = o.hole;
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
  const files = t.files ?? [];
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
    const out = JSON.parse(execFileSync(PYTHON, ["-I", PY_OUTLINE, local], { encoding: "utf8" })) as Res;
    if (out.error) die(`${t.name}: ${out.error}`);
    if (Math.abs(out.w - o.w) > 0.1 || Math.abs(out.h - o.h) > 0.1) die(`${t.name}: สกิน ${out.w}×${out.h} ≠ ${o.w}×${o.h} (สกินเปลี่ยน — วัดรูใหม่)`);
    res = { ...out, curves: [...out.curves, holeCurve(o)], holes: 1 };
  } else {
    const local = `${OUT}${t.id}.ai`;
    writeFileSync(local, Buffer.from(await (await fetch(f0.fileUrl!)).arrayBuffer()));
    res = JSON.parse(execFileSync(PYTHON, ["-I", PY, local, ...pair.flags], { encoding: "utf8" })) as Res;
    if (res.error) die(`${t.name}: ${res.error}`);
    if (Math.abs(res.w - f0.widthMm!) > 0.3 || Math.abs(res.h - f0.heightMm!) > 0.3) die(`${t.name}: อาร์ตบอร์ด ${res.w}×${res.h} ≠ ${f0.widthMm}×${f0.heightMm}`);
  }
  const f = pair.skin ? { ...f0, widthMm: pair.skin.w, heightMm: pair.skin.h } : f0;
  const [bx, by, bw, bh] = res.box;
  if (bx < 0 || by < 0 || bx + bw > res.w + 0.01 || by + bh > res.h + 0.01) die(`${t.name}: กรอบหลุดอาร์ตบอร์ด`);
  if (res.holes !== pair.holes) die(`${t.name}: เจอรู ${res.holes} (คาด ${pair.holes})`);
  const nf = { ...f, cutCurves: res.curves, whiteUnder: true };
  const nt: DesignTemplate = { ...t, files: [nf] };
  const tplSame = flat(f0.cutCurves) === flat(res.curves) && f0.whiteUnder === true && f0.widthMm === f.widthMm && f0.heightMm === f.heightMm;
  if (filesForSelections(nt, {}).length !== 1 || !templateFrame(nt, nf)) die(`${t.name}: จอออกแบบหากรอบงานไม่ได้`);

  const { data: prow, error } = await sb.from("products").select("data").eq("id", pair.product).single();
  if (error || !prow) die(`อ่านสินค้า ${pair.product} ไม่ได้: ${error?.message}`);
  const product = prow!.data as Product;
  if (product.calendarStudio?.formats?.length) die(`${pair.product} ตั้ง calendarStudio.formats ไว้เอง — ไม่แตะ`);
  const cur = product.templateIds ?? [];
  const ids = cur.includes(t.id) ? cur : [...cur, t.id];
  const studio = { ...(product.calendarStudio ?? {}), yearLabel: product.calendarStudio?.yearLabel ?? "", formats: [] as { format: string }[] };
  const prodChanged = ids.length !== cur.length || !product.calendarStudio || product.studioOff === true;
  console.log(
    `👜 ${product.name} (${pair.product}) ← "${t.name}" (${t.id}) · อาร์ตบอร์ด ${f.widthMm}×${f.heightMm} · เส้นตัด (${bx},${by}) ${bw}×${bh}${res.holes ? ` + รู ${res.holes}` : ""} · whiteUnder` +
      `\n   ชุด ${tplSame ? "✓" : "✎"} · สินค้า ${prodChanged ? "✎" : "✓"} templateIds ${JSON.stringify(cur)} → ${JSON.stringify(ids)} · calendarStudio ${product.calendarStudio ? "มี" : "-"} · studioOff ${product.studioOff ?? "-"}`,
  );
  plans.push({ pair, row, nextTpl: tplSame ? null : nt, product, prodChanged, ids, studio });
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
      calendarStudio: cur.calendarStudio ?? p.studio,
      savedAt: new Date().toISOString(),
    };
    delete next.studioOff;
    const { error } = await sb.from("products").update({ data: next }).eq("id", p.pair.product);
    if (error) die(`บันทึกสินค้า ${p.pair.product}: ${error.message}`);
    console.log(`   ✅ ${p.product.name}: ผูกชุด + เปิดออกแบบบนเว็บ`);
  }
}
await revalidateLive(env, { productIds: PAIRS.map((p) => p.product), templateIds: PAIRS.map((p) => p.tpl) });
