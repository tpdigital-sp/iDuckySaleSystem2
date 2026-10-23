/**
 * 🧺 พรมเช็ดเท้า (doormat) ผูกเทมเพลตหมวด "พรมเช็ดเท้า" ตาม "ขนาด" + เปิดออกแบบบนเว็บ
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่มการออกแบบบนเว็บให้ด้วย · มีเลเยอร์รองขาวด้วย เฉพาะอะคริลิค"
 *  — สินค้านี้เป็นผ้าพรม ไม่มีวัสดุอะคริลิค → ไม่ตั้งรองขาว · ข้อความติดมาจากป้ายแขวนประตู)
 *
 *   npx tsx scripts/doormat-template-link.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/doormat-template-link.mts --write    # บันทึก + ล้างแคชหน้าสินค้าบนเว็บจริง (รันซ้ำได้)
 *
 * ชื่อชุด "พรม 60x40" / "พรม กลม 60" ≠ ชื่อค่า "40x60cm" / "ทรงกลม 60cm" → จับคู่ด้วยตาราง PAIRS (template-link-by-size จับกลมไม่ได้)
 * เส้นตัด = ขอบนอกพรม (เส้นแดงวงนอกในสกิน):
 *   สี่เหลี่ยม: เวกเตอร์ใน .ai ไม่ตรงสกิน (60x40 ได้ 575×370) → วาดมุมมน R50 ตามขนาดพรม กึ่งกลางอาร์ตบอร์ด (วัดจากสกิน 300 dpi)
 *   วงกลม: เวกเตอร์ใน .ai ตรง (red-outer-cut.py · วง Ø ตามขนาด)
 * finishedMm = ขนาดพรม · bleedMm ชุด = ส่วนเผื่อรอบพรม (ชื่อชุดกลมไม่มี AxB templateFrame ถอดเองไม่ได้)
 * ชุด "ผ้ารองจาน 40x30" อยู่หมวดเดียวกันแต่ไม่ใช่พรม — ไม่ผูก · 60x90cm / ทรงกลม 120cm ยังไม่มีเทมเพลต
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, templateFrame, type DesignTemplate, type TemplateCurve, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const PRODUCT = "doormat";
const SIZE = "ขนาด";
/** rect = พรมสี่เหลี่ยมมุมมน (มม.) · round = วงกลม Ø (มม.) — เส้นจาก .ai */
type Pair = { tpl: string; choice: string; rect?: { w: number; h: number; r: number }; round?: number };
const PAIRS: Pair[] = [
  { tpl: "tpl-wj12yly10", choice: "40x60cm", rect: { w: 600, h: 400, r: 50 } },
  { tpl: "tpl-dnmapz1jg", choice: "50x80cm", rect: { w: 800, h: 500, r: 50 } },
  { tpl: "tpl-ynj6z3x2k", choice: "ทรงกลม 60cm", round: 600 },
  { tpl: "tpl-2z2pvgq0y", choice: "ทรงกลม 80cm", round: 800 },
  { tpl: "tpl-t6ownrmd6", choice: "ทรงกลม 100cm", round: 1000 },
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
const PYTHON = new URL("../tools/cutout-py/.venv/bin/python", import.meta.url).pathname;
const OUT = `${process.env.TMPDIR ?? "/tmp"}/doormat-cut/`;
mkdirSync(OUT, { recursive: true });
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** jsonb เรียงคีย์ใหม่ตอนบันทึก → เทียบแบบเรียงคีย์ */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/** สี่เหลี่ยมมุมมน w×h รัศมี r วางที่ (x,y) — มุมละโค้งเบซิเยร์ 1 ช่วง (k 0.5523) · ด้านตรงละ 1 ช่วง */
function roundRect(x: number, y: number, w: number, h: number, r: number): TemplateCurve {
  const k = r * 0.5523;
  const L = (x0: number, y0: number, x1: number, y1: number) => [x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1];
  const X = x + w;
  const Y = y + h;
  const g = [
    L(x + r, y, X - r, y),
    [X - r + k, y, X, y + r - k, X, y + r],
    L(X, y + r, X, Y - r),
    [X, Y - r + k, X - r + k, Y, X - r, Y],
    L(X - r, Y, x + r, Y),
    [x + r - k, Y, x, Y - r + k, x, Y - r],
    L(x, Y - r, x, y + r),
    [x, y + r - k, x + r - k, y, x + r, y],
  ];
  return { s: [r3(x + r), r3(y)], g: g.map((s) => s.map(r3)) as TemplateCurve["g"] };
}

const { data: prow, error: pe } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (pe || !prow) die(`อ่านสินค้า ${PRODUCT} ไม่ได้: ${pe?.message}`);
const product = prow!.data as Product;
const sizeGroup = product.options.find((o) => o.label === SIZE) ?? die(`${PRODUCT} ไม่มีกลุ่ม "${SIZE}"`);
for (const p of PAIRS) if (!sizeGroup.choices.some((c) => c.name === p.choice)) die(`กลุ่ม "${SIZE}" ไม่มีค่า "${p.choice}"`);
for (const c of sizeGroup.choices) if (!PAIRS.some((p) => p.choice === c.name)) console.log(`   ⚠️ ${c.name} → ไม่มีชุดเทมเพลต (ไม่มีไฟล์ให้โหลด/ออกแบบ)`);

type Row = { id: string; data: DesignTemplate };
const plans: { pair: Pair; row: Row; next: DesignTemplate; changed: boolean }[] = [];
for (const pair of PAIRS) {
  const { data: trow } = await sb.from("products").select("id,data").eq("id", `__template_${pair.tpl}`).single();
  const row = (trow as Row | null) ?? die(`ไม่พบชุด ${pair.tpl}`);
  const t = row.data;
  const files = t.files ?? [];
  if (files.length !== 1 || !files[0].fileUrl || !files[0].widthMm || !files[0].heightMm) die(`ชุด "${t.name}" ต้องมีไฟล์ .ai เดียวที่รู้ขนาด`);
  const f0 = files[0];
  const W = f0.widthMm!;
  const H = f0.heightMm!;
  let cut: TemplateCurve;
  let fin: { w: number; h: number };
  if (pair.rect) {
    const { w, h, r } = pair.rect;
    if (w > W || h > H) die(`${t.name}: พรม ${w}×${h} ใหญ่กว่าอาร์ตบอร์ด ${W}×${H}`);
    cut = roundRect((W - w) / 2, (H - h) / 2, w, h, r);
    fin = { w, h };
  } else {
    const local = `${OUT}${t.id}.ai`;
    writeFileSync(local, Buffer.from(await (await fetch(f0.fileUrl!)).arrayBuffer()));
    const res = JSON.parse(execFileSync(PYTHON, ["-I", PY_AI, local], { encoding: "utf8" })) as { error?: string; curves: TemplateCurve[]; box: number[] };
    if (res.error) die(`${t.name}: ${res.error}`);
    const [bx, by, bw, bh] = res.box;
    const d = pair.round!;
    if (Math.abs(bw - d) > 0.5 || Math.abs(bh - d) > 0.5 || Math.abs(bx - (W - d) / 2) > 0.5) die(`${t.name}: วงใน .ai ${bw}×${bh} @${bx},${by} ≠ Ø${d} กึ่งกลาง (ไฟล์เปลี่ยน — วัดใหม่)`);
    cut = res.curves[0];
    fin = { w: d, h: d };
  }
  const bleed = Math.min((W - fin.w) / 2, (H - fin.h) / 2);
  const { when: _w, choice: _c, choices: _cs, whiteUnder: _wu, ...fBase } = f0;
  const nf: TemplateFile = { ...fBase, when: [{ label: SIZE, choices: [pair.choice] }], cutCurves: [cut], finishedMm: fin };
  const next: DesignTemplate = { ...t, files: [nf], bleedMm: bleed };
  const fr = templateFrame(next, nf);
  if (!fr || Math.abs(fr.trimWMm - fin.w) > 0.5 || Math.abs(fr.trimHMm - fin.h) > 0.5) die(`${t.name}: กรอบงานจอออกแบบ ${fr?.trimWMm}×${fr?.trimHMm} ≠ พรม ${fin.w}×${fin.h}`);
  if (filesForSelections(next, { [SIZE]: pair.choice }).length !== 1) die(`${t.name}: เลือก ${pair.choice} แล้วไม่ได้ไฟล์`);
  for (const o of sizeGroup.choices.filter((c) => c.name !== pair.choice)) if (filesForSelections(next, { [SIZE]: o.name }).length) die(`${t.name}: ไฟล์โผล่ตอนเลือก ${o.name}`);
  const { savedAt: _s, ...tCmp } = t as DesignTemplate & { savedAt?: string };
  const { savedAt: _s2, ...nCmp } = next as DesignTemplate & { savedAt?: string };
  const changed = stable(tCmp) !== stable(nCmp);
  plans.push({ pair, row, next, changed });
  console.log(`   ${changed ? "✎" : "✓"} ${pair.choice} ← "${t.name}" (${t.id}) · อาร์ตบอร์ด ${W}×${H} · พรม ${fin.w}×${fin.h} ${pair.rect ? `มุมมน R${pair.rect.r}` : "วงกลม"} · ตัดตก ${bleed}`);
}

const ids = product.templateIds ?? [];
const addIds = plans.map((p) => p.row.data.id).filter((id) => !ids.includes(id));
if (product.calendarStudio?.formats?.length) die("สินค้าตั้ง calendarStudio.formats ไว้เอง — ตรวจก่อน");
const studioChange = !product.calendarStudio || product.studioOff === true;
console.log(`   templateIds ${ids.length} → ${ids.length + addIds.length} · ออกแบบบนเว็บ ${studioChange ? "→ เปิด" : "เปิดอยู่แล้ว"} · รองขาว: ไม่ตั้ง (ผ้าพรม ไม่มีอะคริลิค)`);
const nTpl = plans.filter((p) => p.changed).length;
if (!nTpl && !addIds.length && !studioChange) {
  console.log("✅ ครบแล้ว — ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(dry-run — แก้ชุด ${nTpl} ชุด · ใส่ --write เพื่อบันทึก)`);
  process.exit(0);
}
for (const p of plans.filter((x) => x.changed)) {
  const { error } = await sb.from("products").update({ data: { ...p.next, savedAt: new Date().toISOString() } }).eq("id", p.row.id);
  if (error) die(`บันทึกชุด ${p.row.data.id}: ${error.message}`);
}
if (addIds.length || studioChange) {
  const { data: fresh } = await sb.from("products").select("data").eq("id", PRODUCT).single();
  const cur = (fresh?.data ?? product) as Product;
  const curIds = cur.templateIds ?? [];
  const next: Product = { ...cur, templateIds: [...curIds, ...addIds.filter((id) => !curIds.includes(id))], savedAt: new Date().toISOString() };
  if (!next.calendarStudio) next.calendarStudio = { yearLabel: "", formats: [] };
  delete next.studioOff;
  const { error } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
  if (error) die(`บันทึกสินค้า: ${error.message}`);
}
console.log(`✅ บันทึกแล้ว (ชุด ${nTpl} · ผูกเพิ่ม ${addIds.length})`);
await revalidateLive(env, { productIds: [PRODUCT], templateIds: plans.map((p) => p.row.data.id) });
