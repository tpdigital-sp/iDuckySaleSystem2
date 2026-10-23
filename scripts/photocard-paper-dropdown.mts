/**
 * 🎴📄 โฟโต้การ์ด (photocard-digital): เลือกกระดาษเป็น dropdown "ชนิดกระดาษ" ตัวเดียวแบบปฏิทินโฟโต้การ์ด — เจ้าของร้านสั่ง 23 ต.ค. 69
 *   "ปรับตัวเลือกกระดาษให้เป็นแบบภาพที่ 1" (ภาพ dropdown ชนิดกระดาษ 16 ตัวของ calendar-photocard) · ใส่อาร์ตมัน 350/400 ด้วย (เจ้าของร้านเลือก)
 *
 *   npx tsx scripts/photocard-paper-dropdown.mts            # ดูผล + ตารางราคา (ไม่เขียน)
 *   npx tsx scripts/photocard-paper-dropdown.mts --write    # บันทึกจริง + ล้างแคชหน้าสินค้าบนเว็บจริง
 *
 * เดิม: เลือกเรท 3 การ์ด (อาร์ตมัน 300 / กระดาษเนื้อพิเศษ / PET) + กลุ่ม "ชนิดกระดาษเนื้อพิเศษ" ซ่อนตามเรท
 * ใหม่: เรทเดียว (ปลีก + ตัวแทน) ตารางแกน "ชนิดกระดาษ" 4 ขั้นราคาเดิม · ชื่อ/ลำดับ/รูปกระดาษยกจากปฏิทิน
 *   ราคาแต่ละกระดาษยกจากเรทเดิมของมัน (อาร์ต 300/350/400 · เนื้อพิเศษ · PET — เรท 350/400 มีคนเพิ่มไว้แล้ว 23 ต.ค. 69 12:11) · showWhen/rules ที่อ้าง "เรทราคา"/"ชนิดกระดาษเนื้อพิเศษ" แปลงมาที่ "ชนิดกระดาษ"
 * ทำครั้งเดียว (รันซ้ำจะหยุดถ้าแปลงแล้ว) · สำรองไว้ backups/
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type PriceMatrix, type Product, type ProductOption } from "../src/lib/products";
import { productAutoSeo } from "../src/lib/auto-seo";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const CAL = "calendar-photocard";
const LABEL = "ชนิดกระดาษ";
const OLD_SPECIAL = "ชนิดกระดาษเนื้อพิเศษ";
const RATE = "เรทราคา";
const ART = "กระดาษอาร์ตมัน 300 แกรม";
const PET = "พลาสติก PET 250 แกรม";
/** ชื่อเนื้อพิเศษเดิมของโฟโต้การ์ด → ชื่อในปฏิทิน */
const RENAME: Record<string, string> = {
  "เนื้อ Canvas (260 แกรม)": "Canvas Paper 260 แกรม",
  "เนื้อ 100 Pond (300 แกรม)": "100 Pound Paper (หนา 300gsm)",
  "เนื้อ Extra White (260 แกรม)": "Extra Paper 260 แกรม",
  "เนื้อ E-Photo (270 แกรม)": "E-Photo Paper 290 แกรม",
  "STARDREAM เนื้อมุกขาว (285 แกรม)": "Stardream Paper 285 แกรม",
  "STARDREAM Crystal เนื้อมุกคริสตัล (285 แกรม)": "Stardream Crystal Paper 285 แกรม",
};
const ren = (n: string) => RENAME[n] ?? n;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
) as Record<string, string>;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rows, error } = await sb.from("products").select("id,data").in("id", [ID, CAL]);
if (error) throw error;
const pc = rows!.find((r) => r.id === ID)!.data as Product;
const cal = rows!.find((r) => r.id === CAL)!.data as Product;
if (pc.options.some((g) => g.label === LABEL)) throw new Error("แปลงไปแล้ว (มีกลุ่ม ชนิดกระดาษ อยู่แล้ว)");

const calPaper = cal.options.find((g) => g.label === LABEL)!;
const papers = calPaper.choices.map((c) => c.name);
const special = pc.options.find((g) => g.label === OLD_SPECIAL)!.choices.map((c) => ren(c.name));
for (const n of special) if (!papers.includes(n)) throw new Error(`เนื้อพิเศษ "${n}" ไม่มีในรายการปฏิทิน`);
const rate = (id: string) => pc.priceRates!.find((r) => r.id === id)!;
/** เรทเดิม (ปลีก) → กระดาษใหม่ที่อยู่ในเรทนั้น · เรทชื่อตรงกับกระดาษ (อาร์ต 300/350/400) = ตัวมันเอง */
const RATE_PAPERS: Record<string, string[]> = {};
/** กระดาษใหม่ → id เรทเดิมที่ยกราคามา */
const PAPER_RATE: Record<string, string> = {};
for (const r of pc.priceRates!.filter((x) => !x.dealerOnly)) {
  const list = r.id === "paper-special" ? special : r.id === "pet-250" ? [PET] : papers.includes(r.label) ? [r.label] : null;
  if (!list) throw new Error(`ไม่รู้ว่าเรท ${r.id} ${r.label} คือกระดาษไหน`);
  RATE_PAPERS[r.label] = list;
  for (const n of list) PAPER_RATE[n] = r.id;
}
for (const n of papers) if (!PAPER_RATE[n]) throw new Error(`กระดาษ ${n} ไม่มีเรทราคาเดิม`);
const mapCond = <T extends { label: string; choices?: string[]; choice?: string }>(w: T): T => {
  if (w.label === RATE) {
    const choices = (w.choices ?? []).flatMap((c) => RATE_PAPERS[c] ?? (() => { throw new Error(`ไม่รู้จักเรท ${c} ใน ${JSON.stringify(w)}`); })());
    return { ...w, label: LABEL, choices, ...(w.choice != null ? { choice: choices[0] } : {}) };
  }
  if (w.label === OLD_SPECIAL) return { ...w, label: LABEL, choices: w.choices?.map(ren), ...(w.choice != null ? { choice: ren(w.choice) } : {}) };
  return w;
};

// ── ตัวเลือก ──
const rateDesc = (id: string) => rate(id).desc;
const paperGroup: ProductOption = {
  label: LABEL,
  display: "dropdown",
  section: pc.options.find((g) => g.label === OLD_SPECIAL)!.section,
  note: "เนื้อพิเศษบางเนื้อเคลือบ/รองขาวไม่ได้ · ปั๊มฟอยล์ได้เฉพาะอาร์ตมัน 300 แกรม · PET เคลือบไม่ได้",
  choices: calPaper.choices.map((c) => ({
    ...c,
    ...(c.name === ART ? { desc: rateDesc("r1") } : c.name === PET ? { desc: rateDesc("pet-250") } : {}),
  })),
} as ProductOption;
const options: ProductOption[] = [];
for (const g of pc.options) {
  if (g.label === OLD_SPECIAL) {
    options.push(paperGroup);
    continue;
  }
  let n: ProductOption = { ...g };
  if (n.showWhen) n.showWhen = mapCond(n.showWhen);
  if (n.showWhenAlso) n.showWhenAlso = mapCond(n.showWhenAlso);
  // สองเงื่อนไขอ้างกลุ่มเดียวกันแล้ว (เรท + เนื้อพิเศษ) → เหลือตัวที่แคบกว่า
  if (n.showWhen?.label === LABEL && n.showWhenAlso?.label === LABEL) {
    const also = n.showWhenAlso;
    n = { ...n, showWhen: { ...n.showWhen, choices: n.showWhen.choices.filter((c) => also.choices.includes(c)) } };
    delete n.showWhenAlso;
  }
  options.push(n);
}

// ── กฎตัวเลือก ──
const rules = (pc.rules ?? [])
  .filter((r) => r.limit.label !== OLD_SPECIAL) // "อาร์ต/PET → ล็อกเนื้อพิเศษ" ไม่ต้องใช้แล้ว (กลุ่มเดียวกัน)
  .map((r) => ({ ...r, when: mapCond(r.when) }));

// ── ราคา ──
function table(dealer: boolean): PriceMatrix {
  const sfx = dealer ? "-dealer" : "";
  const src = rate("r1" + sfx).pricing;
  const cells: Record<string, number[]> = {};
  for (const p of papers) {
    const r = rate(PAPER_RATE[p] + sfx);
    if (!r) throw new Error(`ไม่มีเรท ${PAPER_RATE[p] + sfx}`);
    if (JSON.stringify(r.pricing.tiers.map((t) => t.upTo)) !== JSON.stringify(src.tiers.map((t) => t.upTo))) throw new Error(`ขั้นราคา ${r.id} ไม่ตรง r1`);
    cells[p] = [...r.pricing.cells[""]];
  }
  return { ...src, cells, driverLabels: [LABEL] };
}
const retail = table(false);
const dealer = table(true);
const keep = (id: string) => {
  const { imageSrc: _img, ...r } = rate(id);
  return r;
};
const next: Product = {
  ...pc,
  options,
  rules,
  pricing: retail,
  priceRates: [
    { ...keep("r1"), label: "เรทราคาปกติ", desc: undefined, pricing: retail },
    { ...keep("r1-dealer"), label: "เรทตัวแทนจำหน่าย", pricing: dealer },
  ],
};
const range = priceRange(next);
next.price = range.min;
next.priceMin = range.min;
next.priceMax = range.max;
// SEO ที่บันทึกไว้เป็นข้อความอัตโนมัติ (FAQ "มีชนิดกระดาษเนื้อพิเศษอะไรบ้าง" ฯลฯ) → ช่องที่ยังอ้างกลุ่มเดิม เขียนใหม่ตามตัวเลือกใหม่ · ช่องอื่นไม่แตะ
if (pc.seo) {
  const now = productAutoSeo(next) as unknown as Record<string, unknown>;
  const seo = { ...pc.seo } as Record<string, unknown>;
  for (const k of Object.keys(seo)) if (JSON.stringify(seo[k]).includes(OLD_SPECIAL) && k in now) seo[k] = now[k];
  next.seo = seo as Product["seo"];
}

const s = JSON.stringify(next);
for (const m of s.matchAll(new RegExp(`.{0,120}(\"${RATE}\"|${OLD_SPECIAL}).{0,60}`, "g"))) console.log("⚠️", m[0]);
if (s.includes(`"${RATE}"`) || s.includes(OLD_SPECIAL)) throw new Error("ยังเหลือการอ้าง เรทราคา/ชนิดกระดาษเนื้อพิเศษ");
console.log("ขั้น:", retail.tiers.map((t) => t.label).join(" | "));
for (const p of papers) console.log(`  ${p.padEnd(34)} ${retail.cells[p].join("/")}   ตัวแทน ${dealer.cells[p].join("/")}`);
for (const g of options) if (g.showWhen?.label === LABEL || g.showWhenAlso?.label === LABEL) console.log("แสดงเมื่อ:", g.label, "←", (g.showWhen?.label === LABEL ? g.showWhen : g.showWhenAlso)!.choices.join(", "));
for (const r of rules) if (r.when.label === LABEL) console.log("กฎ:", r.when.choices?.join(", "), "→", r.limit.label, "=", r.limit.allow.join("/"));
console.log(`ราคาเริ่ม ${pc.priceMin}→${range.min} · สูงสุด ${pc.priceMax}→${range.max}`);

if (WRITE) {
  mkdirSync(new URL("../backups", import.meta.url), { recursive: true });
  writeFileSync(new URL(`../backups/photocard-paper-dropdown-${Date.now()}.json`, import.meta.url), JSON.stringify(pc));
  const { error: e } = await sb.from("products").update({ data: next }).eq("id", ID);
  if (e) throw e;
  await revalidateLive(env, { productIds: [ID] });
  console.log("✅ บันทึกแล้ว");
}
