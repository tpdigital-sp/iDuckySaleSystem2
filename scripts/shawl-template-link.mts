/**
 * 🧣 ผ้าคลุมไหล่ (shawl) ผูกเทมเพลตหมวด "Women Product" 3 ชุดตาม "ขนาด" + เปิดออกแบบบนเว็บ
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่มงานผ้าคลุมไหล่เข้าเทมเพลต · เพิ่มการออกแบบบนเว็บให้ด้วย")
 *
 *   npx tsx scripts/shawl-template-link.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/shawl-template-link.mts --write    # บันทึก + ล้างแคชหน้าสินค้าบนเว็บจริง (รันซ้ำได้)
 *
 * ไฟล์ซิงก์จาก NAS ก่อนด้วย template-folder-sync.mts --rename-re "^Shawl (\d+x\d+) cm$" --rename-to "ผ้าคลุมไหล่ $1"
 * อาร์ตบอร์ด = ผืน + ตัดตก 10 มม. รอบ (720/1020/1420) → finishedMm = ขนาดผืน · bleedMm 10
 * ผ้า ไม่มีเส้นไดคัท ไม่มีรองขาว
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, templateFrame, type DesignTemplate, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const PRODUCT = "shawl";
const SIZE = "ขนาด";
const BLEED = 10;
/** side = ขนาดผืน (มม.) */
type Pair = { tpl: string; choice: string; side: number };
const PAIRS: Pair[] = [
  { tpl: "tpl-h92q0r9i3", choice: "70x70cm", side: 700 },
  { tpl: "tpl-3739gzmo7", choice: "100x100cm", side: 1000 },
  { tpl: "tpl-w4qa20o7g", choice: "140x140cm", side: 1400 },
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
/** jsonb เรียงคีย์ใหม่ตอนบันทึก → เทียบแบบเรียงคีย์ */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

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
  const fin = { w: pair.side, h: pair.side };
  if (Math.abs(W - fin.w - 2 * BLEED) > 0.5 || Math.abs(H - fin.h - 2 * BLEED) > 0.5) die(`${t.name}: อาร์ตบอร์ด ${W}×${H} ≠ ผืน ${fin.w} + ตัดตก ${BLEED} รอบ`);
  const { when: _w, choice: _c, choices: _cs, whiteUnder: _wu, cutCurves: _cc, ...fBase } = f0;
  const nf: TemplateFile = { ...fBase, when: [{ label: SIZE, choices: [pair.choice] }], finishedMm: fin };
  const next: DesignTemplate = { ...t, files: [nf], bleedMm: BLEED };
  const fr = templateFrame(next, nf);
  if (!fr || Math.abs(fr.trimWMm - fin.w) > 0.5 || Math.abs(fr.trimHMm - fin.h) > 0.5) die(`${t.name}: กรอบงานจอออกแบบ ${fr?.trimWMm}×${fr?.trimHMm} ≠ ผืน ${fin.w}×${fin.h}`);
  if (filesForSelections(next, { [SIZE]: pair.choice }).length !== 1) die(`${t.name}: เลือก ${pair.choice} แล้วไม่ได้ไฟล์`);
  for (const o of sizeGroup.choices.filter((c) => c.name !== pair.choice)) if (filesForSelections(next, { [SIZE]: o.name }).length) die(`${t.name}: ไฟล์โผล่ตอนเลือก ${o.name}`);
  const { savedAt: _s, ...tCmp } = t as DesignTemplate & { savedAt?: string };
  const { savedAt: _s2, ...nCmp } = next as DesignTemplate & { savedAt?: string };
  const changed = stable(tCmp) !== stable(nCmp);
  plans.push({ pair, row, next, changed });
  console.log(`   ${changed ? "✎" : "✓"} ${pair.choice} ← "${t.name}" (${t.id}) · อาร์ตบอร์ด ${W}×${H} · ผืน ${fin.w}×${fin.h} · ตัดตก ${BLEED}`);
}

const ids = product.templateIds ?? [];
const addIds = plans.map((p) => p.row.data.id).filter((id) => !ids.includes(id));
if (product.calendarStudio?.formats?.length) die("สินค้าตั้ง calendarStudio.formats ไว้เอง — ตรวจก่อน");
const studioChange = !product.calendarStudio || product.studioOff === true;
console.log(`   templateIds ${ids.length} → ${ids.length + addIds.length} · ออกแบบบนเว็บ ${studioChange ? "→ เปิด" : "เปิดอยู่แล้ว"} · ผ้า ไม่มีรองขาว/ไดคัท`);
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
