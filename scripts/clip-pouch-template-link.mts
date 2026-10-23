/**
 * 👛 กระเป๋าต๊อบแต๊บ (clip-pouch) ผูกเทมเพลตหมวด "Clip Pouch" 4 ชุดตาม "ขนาด" + เปิดออกแบบบนเว็บ
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่มการออกแบบบนเว็บให้ด้วย · มีเลเยอร์รองขาวด้วย เฉพาะอะคริลิค"
 *  — สินค้านี้เป็นผ้า (ซาติน/ดัชเชส/บาร์บี้/แคนวาส) ไม่มีวัสดุอะคริลิค → ไม่ตั้งรองขาว · แบบเดียวกับ doormat-template-link.mts)
 *
 *   npx tsx scripts/clip-pouch-template-link.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/clip-pouch-template-link.mts --write    # บันทึก + ล้างแคชหน้าสินค้าบนเว็บจริง (รันซ้ำได้)
 *
 * อาร์ตบอร์ด = ผืนกางออก (พับเข้าด้านใน/ใส่ตัวหนีบ/ด้านหน้า/ด้านหลัง) · ชื่อชุดไม่ตรงค่าตัวเลือก (9x9 ↔ 9.5x9cm · 18.5x14.5 ↔ 17.5x14.5cm) → ตาราง PAIRS
 * เส้นตัด = ขอบนอกแถบดำในสกิน (.ai ไม่มีเวกเตอร์กรอบปิด) วัดจากสกิน 300 dpi เป็นสี่เหลี่ยม · bleedMm = ระยะขอบซ้าย-ขวา
 * ไม่ตั้ง finishedMm — หัวจอขึ้นขนาดผืนกางออก (แบบแฟ้มจิ๋ว)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, templateFrame, type DesignTemplate, type TemplateCurve, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const PRODUCT = "clip-pouch";
const SIZE = "ขนาด";
/** cut = สี่เหลี่ยมเส้นตัดในอาร์ตบอร์ด (มม.) */
type Pair = { tpl: string; choice: string; cut: { x: number; y: number; w: number; h: number } };
const PAIRS: Pair[] = [
  { tpl: "tpl-9y3ijde49", choice: "9.5x9cm", cut: { x: 5, y: 5, w: 110, h: 230 } },
  { tpl: "tpl-cr356eoli", choice: "11.5x10cm", cut: { x: 5.5, y: 5.5, w: 130, h: 260 } },
  { tpl: "tpl-557hwfobs", choice: "14.5x10cm", cut: { x: 5, y: 5.5, w: 161, h: 260 } },
  { tpl: "tpl-vk1t9fnp3", choice: "17.5x14.5cm", cut: { x: 5, y: 6.5, w: 210, h: 348 } },
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
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** jsonb เรียงคีย์ใหม่ตอนบันทึก → เทียบแบบเรียงคีย์ */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/** สี่เหลี่ยม w×h ที่ (x,y) — ด้านละ 1 ช่วง */
function rectCurve(x: number, y: number, w: number, h: number): TemplateCurve {
  const L = (x0: number, y0: number, x1: number, y1: number) => [x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1].map(r3);
  const X = x + w;
  const Y = y + h;
  return { s: [x, y], g: [L(x, y, X, y), L(X, y, X, Y), L(X, Y, x, Y), L(x, Y, x, y)] as TemplateCurve["g"] };
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
  const { x, y, w, h } = pair.cut;
  if (x < 0 || y < 0 || x + w > W || y + h > H) die(`${t.name}: เส้นตัดหลุดอาร์ตบอร์ด ${W}×${H}`);
  const cut = rectCurve(x, y, w, h);
  const bleed = Math.min(x, W - x - w);
  const { when: _w, choice: _c, choices: _cs, whiteUnder: _wu, finishedMm: _fm, ...fBase } = f0;
  const nf: TemplateFile = { ...fBase, when: [{ label: SIZE, choices: [pair.choice] }], cutCurves: [cut] };
  const next: DesignTemplate = { ...t, files: [nf], bleedMm: bleed };
  const fr = templateFrame(next, nf);
  if (!fr || Math.abs(fr.trimWMm - (W - bleed * 2)) > 0.5) die(`${t.name}: กรอบงานจอออกแบบ ${fr?.trimWMm}×${fr?.trimHMm} ไม่ใช้ตัดตก ${bleed}`);
  if (filesForSelections(next, { [SIZE]: pair.choice }).length !== 1) die(`${t.name}: เลือก ${pair.choice} แล้วไม่ได้ไฟล์`);
  for (const o of sizeGroup.choices.filter((c) => c.name !== pair.choice)) if (filesForSelections(next, { [SIZE]: o.name }).length) die(`${t.name}: ไฟล์โผล่ตอนเลือก ${o.name}`);
  const { savedAt: _s, ...tCmp } = t as DesignTemplate & { savedAt?: string };
  const { savedAt: _s2, ...nCmp } = next as DesignTemplate & { savedAt?: string };
  const changed = stable(tCmp) !== stable(nCmp);
  plans.push({ pair, row, next, changed });
  console.log(`   ${changed ? "✎" : "✓"} ${pair.choice} ← "${t.name}" (${t.id}) · อาร์ตบอร์ด ${W}×${H} · เส้นตัด ${w}×${h} @${x},${y} · ตัดตก ${bleed}`);
}

const ids = product.templateIds ?? [];
const addIds = plans.map((p) => p.row.data.id).filter((id) => !ids.includes(id));
if (product.calendarStudio?.formats?.length) die("สินค้าตั้ง calendarStudio.formats ไว้เอง — ตรวจก่อน");
const studioChange = !product.calendarStudio || product.studioOff === true;
console.log(`   templateIds ${ids.length} → ${ids.length + addIds.length} · ออกแบบบนเว็บ ${studioChange ? "→ เปิด" : "เปิดอยู่แล้ว"} · รองขาว: ไม่ตั้ง (ผ้า ไม่มีอะคริลิค)`);
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
