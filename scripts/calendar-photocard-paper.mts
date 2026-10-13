/**
 * 🗓 ปฏิทินโฟโต้การ์ด: กระดาษ + ราคา "เหมือนโปสการ์ด" (postcard-th) · เรียงกลุ่มใหม่ (13 ต.ค. 69 — ผู้ใช้ขอ)
 *
 *   npx tsx scripts/calendar-photocard-paper.mts            # ดูผลก่อน
 *   npx tsx scripts/calendar-photocard-paper.mts --write    # บันทึกจริง
 *
 * ที่ผู้ใช้เลือก (13 ต.ค. 69):
 *   - กระดาษเหมือนสินค้าโปสการ์ด: dropdown "ชนิดกระดาษ" มีรูป 16 ชนิด (อาร์ตมัน 300/350/400 · เนื้อพิเศษ · Stardream
 *     · โฮโลแกรม · สีเงิน/ทอง · PET) + กลุ่มย่อย (วัสดุ PET · รองขาว · พิมพ์รองสีขาว) + เคลือบชุดเดียวกัน
 *   - ราคา "ทั้งตารางตามโปสการ์ด" — 1 ชุด (20 ใบ 5.5×8.5) ≈ 1 แผ่น A3 → ใช้ตัวเลขต่อ A3 เป็นต่อชุด (แบบโปสการ์ดปฏิทิน)
 *     แกนราคา = ชนิดกระดาษ × เคลือบด้านหน้า (ค่าเคลือบอยู่ในตารางแล้ว) · เรทตัวแทนยกมาด้วย
 *     → เหลือเรทขายปลีกเรทเดียว แผง "แบบราคา" (อาร์ต/เนื้อพิเศษ/Stardream) หายไป
 *   - กติกายกจากโปสการ์ด: 400 แกรม / PET สีใส = พิมพ์ 1 ด้าน · เนื้อพิเศษ/Stardream เคลือบไม่ได้ · PET ไม่เคลือบ ฯลฯ
 *   - มุมมน / มุมแหลม (ยกกลุ่ม "มุม" จากโปสการ์ด · ราคาเท่ากัน)
 *   - ลำดับ: 1. ขนาด · แนวการ์ด · มุม · ปีปฏิทิน → 2. เนื้อกระดาษ → 3. จำนวนด้านที่พิมพ์ → 4. เคลือบผิว
 * พิมพ์ 2 ด้าน +10 เท่าโปสการ์ด (กลุ่ม "พิมพ์" เดิม — จอปฏิทินอ้างชื่อนี้) · ค่าคละลายคงของเดิม
 * รันซ้ำได้ (ดึงโปสการ์ดสดทุกครั้ง) · ⚠️ calendar-photocard-build.mts ยังสร้างแบบเดิม — รันตัวนั้นเมื่อไหร่ ต้องรันตัวนี้ต่อท้าย
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { OptionRule, PriceMatrix, Product, ProductOption } from "../src/lib/products";

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

const ID = "calendar-photocard";
const SOURCE = "postcard-th";
const PAPER = "ชนิดกระดาษ";
const COAT = "เคลือบ (เฉพาะด้านหน้า)";
const SIDE = "พิมพ์";
const SRC_SIDE = "จำนวนด้านที่พิมพ์";
const UNIT = "ชุด (20 ใบ)";
const SEC1 = "1. ขนาด + แนว + มุม + ปีปฏิทิน";
const SEC2 = "2. เนื้อกระดาษ";
const SEC3 = "3. จำนวนด้านที่พิมพ์";
const SEC4 = "4. เคลือบผิว";
/** กลุ่มที่ยกจากโปสการ์ด (กระดาษ + กลุ่มย่อยของกระดาษ + เคลือบด้านหน้า) — ไม่เอาขนาด/แนว/มุม/เคลือบด้านหลัง */
const PAPER_GROUPS = [PAPER, "วัสดุ PET", "รองขาว", "พิมพ์รองสีขาว (ด้านหน้า)"];
const COAT_GROUPS = [COAT, "เคลือบ"];

const read = async (id: string) => {
  const { data, error } = await sb.from("products").select("name,data").eq("id", id).single();
  if (error || !data) die(`อ่าน ${id} ไม่ได้: ${error?.message}`);
  return data as { name: string; data: Product };
};
const { name, data: p } = await read(ID);
const { data: src } = await read(SOURCE);
if (JSON.stringify(src.pricing?.driverLabels) !== JSON.stringify([PAPER, COAT])) die("แกนตารางราคาของโปสการ์ดเปลี่ยน — เช็คก่อน");

const mine = (l: string) => p.options.find((o) => o.label === l) ?? die(`${ID} ไม่มีกลุ่ม "${l}"`);
const theirs = (l: string, section: string): ProductOption => ({
  ...structuredClone(src.options.find((o) => o.label === l) ?? die(`${SOURCE} ไม่มีกลุ่ม "${l}"`)),
  section,
});
const sec = (o: ProductOption, section: string): ProductOption => ({ ...o, section });

const options: ProductOption[] = [
  sec(mine("ขนาด"), SEC1),
  sec(mine("แนวการ์ด"), SEC1),
  // มุมมน/มุมแหลม (13 ต.ค. 69 ผู้ใช้ขอ) — ยกจากโปสการ์ด ราคาเท่ากัน · เทมเพลต/ไกด์จอปฏิทินเปลี่ยนตาม
  theirs("มุม", SEC1),
  sec(mine("ปีปฏิทิน"), SEC1),
  ...PAPER_GROUPS.map((l) => theirs(l, SEC2)),
  sec(mine(SIDE), SEC3),
  ...COAT_GROUPS.map((l) => theirs(l, SEC4)),
];
const labels = new Set(options.map((o) => o.label));
const side = mine(SIDE);
if (side.choices.map((c) => c.name).join("|") !== "พิมพ์ 1 ด้าน|พิมพ์ 2 ด้าน") die(`กลุ่ม "${SIDE}" เปลี่ยน`);

/* ── กติกา: ยกจากโปสการ์ด (ชื่อกลุ่มจำนวนด้าน → "พิมพ์") เฉพาะข้อที่อ้างกลุ่มที่มีจริง ── */
const relabel = (l: string) => (l === SRC_SIDE ? SIDE : l);
const rules: OptionRule[] = [];
for (const r0 of src.rules ?? []) {
  const r = structuredClone(r0);
  r.when = { ...r.when, label: relabel(r.when.label) };
  r.limit = { ...r.limit, label: relabel(r.limit.label) };
  if (!labels.has(r.when.label) || !labels.has(r.limit.label)) continue;
  rules.push(r);
}

/* ── ราคา: ตารางโปสการ์ดทั้งชุด · หน่วย A3 → ชุด ── */
const paperNames = options.find((o) => o.label === PAPER)!.choices.map((c) => c.name);
const coatNames = options.find((o) => o.label === COAT)!.choices.map((c) => c.name);
const toSet = (m: PriceMatrix, dealer: boolean): PriceMatrix => ({
  ...structuredClone(m),
  unit: UNIT,
  tiers: m.tiers.map((t) => ({ ...t, label: dealer ? t.label : t.label.replace(/แผ่น A3/g, "ชุด") })),
});
const pricing = toSet(src.pricing!, false);
const priceRates = (src.priceRates ?? []).map((r) => ({ ...structuredClone(r), pricing: toSet(r.pricing, !!r.dealerOnly) }));
for (const m of [pricing, ...priceRates.map((r) => r.pricing)])
  for (const pn of paperNames) for (const cn of coatNames) if (!m.cells[`${pn}│${cn}`]) die(`ตารางราคาขาดช่อง ${pn}│${cn}`);

/* ── ข้อความ ── */
const cell = (pn: string, cn: string) => pricing.cells[`${pn}│${cn}`];
const art = cell("กระดาษอาร์ตมัน 300 แกรม", "ไม่เคลือบ");
const minPrice = Math.min(...Object.values(pricing.cells).flat());
const tiersTxt = pricing.tiers.map((t) => t.label.replace(/ ชุด ขึ้นไป/, "+").replace(/ ชุด/g, "")).join(" / ");
const PAPERS_TXT = "กระดาษอาร์ตมัน 300 / 350 / 400 แกรม · เนื้อพิเศษ (100 Pound / E-Photo / Canvas / Extra) · Stardream · โฮโลแกรม · กระดาษสีเงิน/ทอง · PET";
const highlights = (p.highlights ?? []).map((h, i) =>
  i === 3
    ? PAPERS_TXT
    : /เคลือบเงา\/ด้านฟรี/.test(h)
      ? "ราคาตามตารางกระดาษแบบโปสการ์ด · เคลือบเงา/ด้าน/พิเศษ เลือกได้ (กระดาษบางชนิดเคลือบไม่ได้)"
      : h.replace(/เริ่มต้น \d+ บาท/, `เริ่มต้น ${minPrice} บาท`),
);
const faqs = (p.seo?.faqs ?? []).map((f, i) =>
  i === 0
    ? {
        ...f,
        a:
          `ชุดละ 20 ใบ ราคาตามตารางกระดาษเดียวกับโปสการ์ด (1 ชุด เท่า 1 แผ่น A3) · ` +
          `กระดาษอาร์ตมัน 300 แกรม ไม่เคลือบ ${art.join(" / ")} บาท/ชุด (${tiersTxt} ชุด) · ` +
          `เคลือบเงา/ด้าน +${cell("กระดาษอาร์ตมัน 300 แกรม", "เคลือบเงา")[0] - art[0]} · เคลือบพิเศษ +${cell("กระดาษอาร์ตมัน 300 แกรม", "เคลือบพิเศษ")[0] - art[0]} · ` +
          `350 / 400 แกรม +5 / +10 (400 แกรมพิมพ์ได้ 1 ด้าน) · กระดาษเนื้อพิเศษ/โฮโลแกรมเริ่ม ${cell("Canvas Paper 260 แกรม", "ไม่เคลือบ")[0]} · Stardream เริ่ม ${cell("Stardream Paper 285 แกรม", "ไม่เคลือบ")[0]} · PET ${cell("พลาสติก PET 250 แกรม", "ไม่เคลือบ")[0]} · พิมพ์ 2 ด้าน +10`,
      }
    : f,
);
const description = (p.description ?? "")
  .replace(/กระดาษอาร์ตเกาหลี 300 \/ 350 \/ 400 แกรม หรือกระดาษเนื้อพิเศษ/, "กระดาษอาร์ตมัน 300–400 แกรม กระดาษเนื้อพิเศษ โฮโลแกรม สีเงิน/ทอง หรือ PET")
  .replace(/เริ่มต้นชุดละ \d+ บาท/, `เริ่มต้นชุดละ ${minPrice} บาท`);
const tabs = (p.tabs ?? []).map((t, i) =>
  i === 0
    ? {
        ...t,
        text: t.text
          .replace(/• เคลือบเงา\/ด้าน ฟรี · เคลือบพิเศษ บวกเพิ่ม 30 บาท\/ชุด \(เคลือบเฉพาะด้านหน้า\)/, "• ราคาตามชนิดกระดาษ × เคลือบด้านหน้า (ตารางเดียวกับโปสการ์ด) · เคลือบเฉพาะด้านหน้า")
          .replace(/• กระดาษเนื้อพิเศษ \/ Stardream เคลือบไม่ได้/, "• กระดาษเนื้อพิเศษ / Stardream / PET เคลือบไม่ได้ · โฮโลแกรม/สีเงิน-ทองผิวเงา เคลือบเงาได้\n• กระดาษอาร์ตมัน 400 แกรม และ PET สีใส พิมพ์ได้ 1 ด้าน"),
      }
    : t,
);

const next: Product = {
  ...p,
  options,
  rules,
  pricing,
  priceRates,
  highlights,
  description,
  tabs,
  ...(p.seo ? { seo: { ...p.seo, faqs } } : {}),
  savedAt: new Date().toISOString(),
};
delete next.rateAfterOption;

console.log(`📦 ${name} (${ID}) ← กระดาษ/ราคา ${SOURCE}`);
let last = "";
for (const o of options) {
  if (o.section !== last) console.log(`   ${(last = o.section ?? "")}`);
  console.log(`     · ${o.label}: ${o.choices.map((c) => c.name + (c.extra ? ` (+${c.extra})` : "")).join(" | ").slice(0, 110)}`);
}
console.log(`   กติกา ${rules.length} ข้อ: ${rules.map((r) => `${r.when.label}→${r.limit.label}`).join(" · ")}`);
console.log(`   เรท: ${priceRates.map((r) => `${r.label}${r.dealerOnly ? " (ตัวแทน)" : ""} ${Object.keys(r.pricing.cells).length} ช่อง`).join(" · ")}`);
console.log(`   ขั้น: ${pricing.tiers.map((t) => t.label).join(" · ")}`);
for (const pn of ["กระดาษอาร์ตมัน 300 แกรม", "กระดาษอาร์ตมัน 400 แกรม", "Canvas Paper 260 แกรม", "Stardream Paper 285 แกรม", "โฮโลแกรม SeaSand (300 แกรม)", "พลาสติก PET 250 แกรม"])
  console.log(`     ${pn} ไม่เคลือบ ${cell(pn, "ไม่เคลือบ").join("/")} · เงา ${cell(pn, "เคลือบเงา").join("/")}`);
console.log(`   faq[0]: ${faqs[0]?.a}`);
if (!WRITE) {
  console.log("\n(dry-run — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: next }).eq("id", ID);
if (upErr) die(`บันทึกไม่สำเร็จ: ${upErr.message}`);
const back = (await read(ID)).data;
if (back.savedAt !== next.savedAt || !back.options.some((o) => o.label === PAPER) || back.priceRates?.length !== priceRates.length) die("อ่านกลับมาไม่ตรง");
console.log("   ✅ บันทึกแล้ว");
