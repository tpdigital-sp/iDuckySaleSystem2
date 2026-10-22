/**
 * 🛋🧵 หมอนอิงยัดใย (`cushion` · /products/หมอนอิงยัดใย) ผูกชุดเทมเพลตหมวด "หมอนอิง(ยัดใย)" 12 ชุด (1ด้าน 12–20 นิ้ว · 2ด้าน 12–24 นิ้ว) + เปิดออกแบบบนเว็บ
 * (22 ต.ค. 69 รอบแรกเจ้าของร้านส่งไฟล์ Cushion Zip มา → ผูกไป 6 ชุด (6bd10c1) · รอบ 2 "นำเทมเพลตนี้ไปแทนที่ให้หน่อย ก่อนหน้านี้ฉันส่งไปผิด"
 *  → ไฟล์จาก NAS …/0. งานผ้า/หมอนอิง(ยัดใย)/Cushionยัดใย (Nด้าน) NN นิ้ว -.ai นำเข้าด้วย template-folder-sync.mts --keep-layers "" (ไฟล์สะอาด ไม่มีลายตัวอย่าง)
 *  สคริปต์นี้ถอด Cushion Zip ออก แล้วผูกชุดยัดใยแทน)
 *
 *   npx tsx scripts/cushion-filled-template-link.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/cushion-filled-template-link.mts --write    # บันทึก + ล้างแคชหน้าสินค้า/ชุดบนเว็บจริง
 *
 * ชุดเทมเพลต (แต่ละชุด 1 ไฟล์ · อาร์ตบอร์ดสี่เหลี่ยมจัตุรัสเผื่อตัดตก เช่น 12 นิ้ว = 400×400.2 มม. · กรอบแดง "ขนาดงานจริง" = NN นิ้วเป๊ะ):
 *   ชื่อชุด → "หมอนอิงยัดใย NN นิ้ว (1ด้าน|2ด้าน)" · optionLabel "ขนาด" · file.choice "NNxNN นิ้ว" · finishedMm = NN×25.4 (หัวจอบอกขนาดที่เลือก)
 *   file.when = พิมพ์ลาย: 1ด้าน → "ด้านเดียว / ด้านหลังสีขาว" · 2ด้าน → "สองด้าน เพิ่ม"
 *   ⚠️ 22/24 นิ้ว มีแต่ไฟล์ 2ด้าน → ไม่ตั้ง when ให้ใช้ได้ทั้ง 2 ค่า (อาร์ตบอร์ดเท่ากัน · ไม่งั้นด้านเดียว 22/24 การ์ดออกแบบปิด)
 * สินค้า: templateIds = 12 ชุดยัดใย (ถอด Cushion Zip tpl-x33rjykrp…) · calendarStudio = { yearLabel: "", formats: [{ format: "tpl2", when: [พิมพ์ลาย = สองด้าน เพิ่ม] }] }
 *   → เลือก "สองด้าน เพิ่ม" จอออกแบบเปิด 2 หน้า (หน้า/หลัง · โครงเดียวกับผ้าขนหนู/พัด) · ด้านเดียว = 1 หน้า · ไม่แตะ mock3d/ราคา/ตัวเลือก
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { filesForSelections, whenList, type DesignTemplate, type TemplateFile } from "../src/lib/design-templates";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const PRODUCT = "cushion";
const CATEGORY = "หมอนอิง(ยัดใย)";
const SIZE = "ขนาด";
const SIDES = "พิมพ์ลาย";
const ONE = "ด้านเดียว / ด้านหลังสีขาว";
const TWO = "สองด้าน เพิ่ม";
const ZIP_PREFIX = "Cushion Zip";
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
const r1 = (v: number) => Math.round(v * 10) / 10;

/* ── สินค้า ── */
const { data: prow, error: perr } = await sb.from("products").select("data").eq("id", PRODUCT).single();
if (perr || !prow) die(`อ่านสินค้า ${PRODUCT} ไม่ได้: ${perr?.message}`);
const product = prow!.data as Product;
const sizes = product.options.find((o) => o.label === SIZE)?.choices.map((c) => c.name) ?? die(`สินค้าไม่มีกลุ่ม "${SIZE}"`);
const sideChoices = product.options.find((o) => o.label === SIDES)?.choices.map((c) => c.name) ?? die(`สินค้าไม่มีกลุ่ม "${SIDES}"`);
if (!sideChoices.includes(ONE) || !sideChoices.includes(TWO)) die(`กลุ่ม "${SIDES}" ไม่มีค่า "${ONE}" / "${TWO}" (มี: ${sideChoices.join(" · ")})`);

/* ── ชุดเทมเพลต ── */
type Row = { id: string; name: string; data: DesignTemplate };
const { data: trows } = await sb.from("products").select("id,name,data").eq("category", "__templates__");
const all = (trows ?? []) as Row[];
const sets = all.filter((r) => (r.data.category ?? "").trim() === CATEGORY && !r.data.hidden);
if (!sets.length) die(`ไม่มีชุดเทมเพลตหมวด "${CATEGORY}"`);
const zipIds = all.filter((r) => (r.data?.name ?? "").startsWith(ZIP_PREFIX)).map((r) => r.data.id);

type Plan = { row: Row; name: string; inch: number; sides: 1 | 2; next: DesignTemplate; changed: boolean };
const plan: Plan[] = [];
for (const row of sets) {
  const mi = /(\d+)\s*นิ้ว/.exec(row.data.name);
  const ms = /\((1|2)ด้าน\)/.exec(row.data.name);
  if (!mi || !ms) die(`ชุด "${row.data.name}" อ่านขนาด/ด้านจากชื่อไม่ได้`);
  const sides = Number(ms![1]) as 1 | 2;
  const inchN = Number(mi![1]);
  const files = row.data.files ?? [];
  if (files.length !== 1) die(`ชุด "${row.data.name}" มี ${files.length} ไฟล์ (รองรับชุดละไฟล์เดียว)`);
  const f = files[0];
  if (!f.fileUrl || !f.widthMm || !f.heightMm) die(`ชุด "${row.data.name}" ไฟล์ยังไม่มี .ai หรือไม่รู้ขนาดอาร์ตบอร์ด`);
  const choice = `${inchN}x${inchN} นิ้ว`;
  if (!sizes.includes(choice)) die(`ชุด "${row.data.name}" → ค่า "${choice}" ไม่มีในกลุ่ม "${SIZE}"`);
  plan.push({ row, name: `หมอนอิงยัดใย ${inchN} นิ้ว (${sides}ด้าน)`, inch: inchN, sides, next: row.data, changed: false });
}
for (const p of plan) {
  const f = p.row.data.files![0];
  const hasOne = plan.some((q) => q.inch === p.inch && q.sides === 1);
  const when = p.sides === 1 ? [{ label: SIDES, choices: [ONE] }] : hasOne ? [{ label: SIDES, choices: [TWO] }] : undefined;
  const mm = r1(p.inch * 25.4);
  const nf: TemplateFile = { ...f, choice: `${p.inch}x${p.inch} นิ้ว`, finishedMm: { w: mm, h: mm } };
  if (when) nf.when = when;
  else delete nf.when;
  p.next = { ...p.row.data, name: p.name, optionLabel: SIZE, files: [nf] };
  p.changed = JSON.stringify({ n: p.row.data.name, o: p.row.data.optionLabel, f }) !== JSON.stringify({ n: p.name, o: SIZE, f: nf });
}
plan.sort((a, b) => a.sides - b.sides || a.inch - b.inch);

/* ── ตรวจทุกคู่ ขนาด × พิมพ์ลาย ได้ไฟล์เดียว ── */
console.log(`🔗 ${product.name} (${PRODUCT}) · หมวด "${CATEGORY}" ${plan.length} ชุด · ${SIZE} ${sizes.length} ค่า × ${SIDES} 2 ค่า`);
for (const p of plan) {
  const f = p.next.files![0];
  console.log(`   ${p.changed ? "✎" : "✓"} ${p.name} (${p.row.data.id}) · ${f.fileName} · อาร์ตบอร์ด ${f.widthMm}×${f.heightMm} · งานจริง ${f.finishedMm!.w}×${f.finishedMm!.h} มม. · ${SIZE}=${f.choice}${whenList(f).length ? ` · ${SIDES}=${whenList(f)[0].choices.join("/")}` : " · ใช้ทั้ง 2 ค่าพิมพ์ลาย"}`);
}
for (const s of sizes) {
  for (const side of [ONE, TWO]) {
    const sel = { [SIZE]: s, [SIDES]: side };
    const hits = plan.flatMap((p) => filesForSelections(p.next, sel).map((f) => ({ p, f })));
    if (hits.length !== 1) die(`${s} · ${side}: ได้ ${hits.length} ไฟล์ (${hits.map((h) => h.p.name).join(" · ")})`);
    const note = hits[0].p.sides === 2 && side === ONE ? " ⚠️ ใช้ไฟล์ 2ด้าน (ไม่มีไฟล์ 1ด้านขนาดนี้)" : "";
    console.log(`   ${s} · ${side === ONE ? "ด้านเดียว" : "สองด้าน"} → ${hits[0].p.name}${note}`);
  }
}

/* ── สินค้า: templateIds + calendarStudio ── */
const ids = product.templateIds ?? [];
const keep = ids.filter((id) => !zipIds.includes(id));
const nextIds = [...keep, ...plan.map((p) => p.row.data.id).filter((id) => !keep.includes(id))];
const wantStudio = { ...(product.calendarStudio ?? {}), yearLabel: "", formats: [{ format: "tpl2", when: [{ label: SIDES, choices: [TWO] }] }] };
const studioChange = JSON.stringify(product.calendarStudio) !== JSON.stringify(wantStudio) || product.studioOff === true;
const idsChange = JSON.stringify(ids) !== JSON.stringify(nextIds);
console.log(`   templateIds ${ids.length} → ${nextIds.length} ชุด (ถอด Cushion Zip ${ids.filter((id) => zipIds.includes(id)).length})` + ` · calendarStudio ${JSON.stringify(product.calendarStudio)} → ${JSON.stringify(wantStudio)}${studioChange ? " ✎" : " ✓"}`);
const nTpl = plan.filter((p) => p.changed).length;
if (!nTpl && !idsChange && !studioChange) {
  console.log("✅ ผูกครบแล้ว — ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(dry-run — จะแก้ชุด ${nTpl} ชุด${idsChange ? " + templateIds" : ""}${studioChange ? " + calendarStudio" : ""} · ใส่ --write เพื่อบันทึก)`);
  process.exit(0);
}

/* ── เขียน ── */
for (const p of plan.filter((x) => x.changed)) {
  const { error } = await sb
    .from("products")
    .update({ name: `(เทมเพลต) ${p.name}`.slice(0, 120), data: { ...p.next, savedAt: new Date().toISOString() } })
    .eq("id", p.row.id);
  if (error) die(`บันทึกชุด ${p.row.data.id}: ${error.message}`);
  console.log(`   ✅ ชุด ${p.name}`);
}
if (idsChange || studioChange) {
  const { data: fresh } = await sb.from("products").select("data").eq("id", PRODUCT).single();
  const cur = (fresh?.data ?? product) as Product;
  const next: Product = { ...cur, templateIds: nextIds, calendarStudio: wantStudio, savedAt: new Date().toISOString() };
  delete next.studioOff;
  const { error } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
  if (error) die(`บันทึกสินค้า: ${error.message}`);
  console.log(`   ✅ สินค้า ${product.name}: templateIds ${nextIds.length} ชุด + จอออกแบบ 2 หน้าเมื่อ "${TWO}"`);
}
await revalidateLive(env, { productIds: [PRODUCT], templateIds: plan.map((p) => p.row.data.id) });
