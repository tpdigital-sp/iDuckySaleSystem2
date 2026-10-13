/**
 * 🗓 โปสการ์ดปฏิทิน: กระดาษ + ราคา "เหมือนปฏิทินโฟโต้การ์ด" (ยกจาก postcard-th ทั้งชุด) + ปรับคำแบบปฏิทิน (13 ต.ค. 69 — ผู้ใช้ขอ)
 *
 *   npx tsx scripts/calendar-postcard-paper.mts            # ดูผลก่อน
 *   npx tsx scripts/calendar-postcard-paper.mts --write    # บันทึกจริง
 *
 * - ชนิดกระดาษ 16 ชนิด (อาร์ตมัน 300/350/400 · เนื้อพิเศษ · Stardream · โฮโลแกรม · สีเงิน/ทอง · PET) + กลุ่มย่อย
 *   (วัสดุ PET · รองขาว · พิมพ์รองสีขาว) + เคลือบชุดเดียวกัน — เหมือน calendar-photocard-paper.mts
 * - ราคา: ตาราง postcard-th ทั้งชุด 1 ชุด (8 ใบ 4×6") = 1 แผ่น A3 · เรทตัวแทนยกมาด้วย · 2 ด้าน +20 คงเดิม
 *   รายเดือน 13 ใบ = กระดาษ 2 แผ่น → ราคา ×2 (ผู้ใช้สั่ง 13 ต.ค. 69 · เดิม +10) = เพิ่มแกนตาราง "แบบปฏิทิน" (ช่อง ×2)
 * - พิมพ์ 3 แบบ (13 ต.ค. 69): 1 ด้าน · 2 ด้าน (ด้านหลังเป็นปฏิทิน) · 2 ด้าน (ด้านหลังเป็นลาย Postcard — หน้าแรกเหมือน 1 ด้าน
 *   หลัง = drawPostBack · format postcard-yearpb / postcard-monthpb)
 * - กติกาโปสการ์ด (จำนวนด้านที่พิมพ์ → "พิมพ์"): 400 แกรม / PET สีใส = พิมพ์ 1 ด้าน · เนื้อพิเศษเคลือบไม่ได้ ฯลฯ
 * - ปรับคำ "แบบปฏิทิน" — เปลี่ยนชื่อตัวเลือกแล้วต้องแก้ calendarStudio.formats (when) ตามด้วย (ทำในนี้)
 * - ส่วน: 1. แบบปฏิทิน → 2. เนื้อกระดาษ → 3. เคลือบผิว
 * - ค่าคละ (ผู้ใช้สั่ง 13 ต.ค. 69): ไม่เกิน 4 ลายฟรี · เกิน 4 ลาย ลายละ +5 — นับลายตามรูปที่ใช้ (รายเดือนนับทุกหน้า · calDesignCount)
 * รันซ้ำได้ · ⚠️ calendar-postcard-build.mts ยังสร้างแบบเดิม — รันตัวนั้นเมื่อไหร่ ต้องรันตัวนี้ต่อท้าย
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, type OptionRule, type PriceMatrix, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};

const ID = "calendar-postcard";
const SOURCE = "postcard-th";
const PAPER = "ชนิดกระดาษ";
const COAT = "เคลือบ (เฉพาะด้านหน้า)";
const TYPE = "แบบปฏิทิน";
const SIDE = "พิมพ์";
const SRC_SIDE = "จำนวนด้านที่พิมพ์";
const UNIT = "ชุด";
const SEC1 = "1. แบบปฏิทิน";
const SEC2 = "2. เนื้อกระดาษ";
const SEC3 = "3. เคลือบผิว";
const PAPER_GROUPS = [PAPER, "วัสดุ PET", "รองขาว", "พิมพ์รองสีขาว (ด้านหน้า)"];
const COAT_GROUPS = [COAT, "เคลือบ"];

/** ปรับคำแบบปฏิทิน (ชื่อเดิม → ชื่อใหม่ + คำอธิบาย) */
const RENAME: Record<string, { name: string; desc: string }> = {
  "รายปี (8 ใบ/ชุด)": { name: "ปฏิทินรายปี · 1 ชุด 8 ใบ", desc: "ทั้ง 8 ใบลายเดียวกัน แต่ละใบมีปฏิทินครบ 12 เดือน" },
  "รายเดือน (13 ใบ/ชุด)": { name: "ปฏิทินรายเดือน · 1 ชุด 13 ใบ", desc: "หน้าปก 1 ใบ + ใบประจำเดือน ม.ค.–ธ.ค. อีก 12 ใบ" },
};
const NEW_NAMES = Object.values(RENAME).map((r) => r.name);
const MONTH = RENAME["รายเดือน (13 ใบ/ชุด)"].name;
const S1 = "พิมพ์ 1 ด้าน";
const S2_OLD = "พิมพ์ 2 ด้าน";
const S2 = "พิมพ์ 2 ด้าน (ด้านหลังเป็นปฏิทิน)";
const S3 = "พิมพ์ 2 ด้าน (ด้านหลังเป็นลาย Postcard)";

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

/* ── แบบปฏิทิน: ปรับคำ ── */
const type = structuredClone(mine(TYPE));
const nameMap = new Map<string, string>();
type.choices = type.choices.map((c) => {
  const r = RENAME[c.name] ?? Object.values(RENAME).find((x) => x.name === c.name);
  if (!r) die(`ตัวเลือก "${c.name}" ในแบบปฏิทินไม่รู้จัก`);
  nameMap.set(c.name, r!.name);
  const { extra: _drop, ...rest } = c; // รายเดือนไม่ใช่ +10 แล้ว — ราคา ×2 อยู่ในตาราง
  void _drop;
  return { ...rest, name: r!.name, desc: r!.desc };
});
type.note = "รายเดือนราคา ×2 ของรายปี (13 ใบ ใช้กระดาษ 2 แผ่น)";

/* ── พิมพ์: 3 แบบ ── */
const side = structuredClone(mine(SIDE));
const sideByName = (n: string) => side.choices.find((c) => c.name === n);
const s2 = sideByName(S2) ?? sideByName(S2_OLD) ?? die("ไม่มีตัวเลือกพิมพ์ 2 ด้าน");
const BACK_IMG = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/opt-postcard-side-pb-v1.jpg`;
if (WRITE) {
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/opt-postcard-side-pb-v1.jpg`, readFileSync(new URL("./assets/calendar-samples/postcard-side-pb.jpg", import.meta.url)), {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (up.error) die(`อัปรูปหลังโปสการ์ด: ${up.error.message}`);
}
side.choices = [
  { ...(sideByName(S1) ?? die("ไม่มีพิมพ์ 1 ด้าน")), desc: "รูป + ปฏิทิน อยู่ด้านเดียวกัน · ด้านหลังว่าง" },
  { ...s2, name: S2, desc: "ด้านหน้า = รูปเต็มใบ · ด้านหลัง = ปฏิทิน" },
  {
    ...s2,
    name: S3,
    desc: "ด้านหน้า = รูป + ปฏิทิน · ด้านหลัง = ลายโปสการ์ดไว้เขียนที่อยู่ส่ง (ใส่ลายเอง หรือลบลายออกได้)",
    imageSrc: BACK_IMG,
  },
];

const options: ProductOption[] = [
  sec(type, SEC1),
  sec(side, SEC1),
  sec(mine("แนวโปสการ์ด"), SEC1),
  sec(mine("ปีปฏิทิน"), SEC1),
  ...PAPER_GROUPS.map((l) => theirs(l, SEC2)),
  ...COAT_GROUPS.map((l) => theirs(l, SEC3)),
];
const labels = new Set(options.map((o) => o.label));

/* ── กติกา: ยกจากโปสการ์ด (ชื่อกลุ่มจำนวนด้าน → "พิมพ์") ── */
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
const typeNames = type.choices.map((c) => c.name);
const toSet = (m: PriceMatrix, dealer: boolean): PriceMatrix => ({
  ...structuredClone(m),
  unit: UNIT,
  // แกนที่ 3 "แบบปฏิทิน": รายปี = ราคาตาราง · รายเดือน = ×2 (กระดาษ 2 แผ่น)
  driverLabels: [PAPER, COAT, TYPE],
  cells: Object.fromEntries(Object.entries(m.cells).flatMap(([k, v]) => typeNames.map((t) => [`${k}│${t}`, t === MONTH ? v.map((x) => x * 2) : [...v]]))),
  tiers: m.tiers.map((t) => ({ ...t, label: dealer ? t.label : t.label.replace(/แผ่น A3/g, "ชุด") })),
});
const pricing = toSet(src.pricing!, false);
const priceRates = (src.priceRates ?? []).map((r) => ({ ...structuredClone(r), pricing: toSet(r.pricing, !!r.dealerOnly) }));
for (const m of [pricing, ...priceRates.map((r) => r.pricing)])
  for (const pn of paperNames)
    for (const cn of coatNames) for (const tn of typeNames) if (!m.cells[`${pn}│${cn}│${tn}`]) die(`ตารางราคาขาดช่อง ${pn}│${cn}│${tn}`);

/* ── จอสร้างปฏิทิน: ชื่อแบบปฏิทินใหม่ ── */
const YEAR_T = RENAME["รายปี (8 ใบ/ชุด)"].name;
const formats = (["L", "P"] as const).flatMap((o) => {
  const oname = o === "L" ? "แนวนอน" : "แนวตั้ง";
  return (
    [
      ["postcard-year1", YEAR_T, S1],
      ["postcard-year2", YEAR_T, S2],
      ["postcard-yearpb", YEAR_T, S3],
      ["postcard-month", MONTH, S1],
      ["postcard-month2", MONTH, S2],
      ["postcard-monthpb", MONTH, S3],
    ] as const
  ).map(([f, t, sd]) => ({
    format: `${f}-${o}`,
    when: [
      { label: TYPE, choices: [t] },
      { label: SIDE, choices: [sd] },
      { label: "แนวโปสการ์ด", choices: [oname] },
    ],
  }));
});
void nameMap;
for (const f of formats) for (const w of f.when) if (w.label === TYPE && !w.choices.every((c) => NEW_NAMES.includes(c))) die(`format ${f.format} ชี้ชื่อเก่า`);

/* ── ข้อความ ── */
const cell = (pn: string, cn: string) => pricing.cells[`${pn}│${cn}│${YEAR_T}`];
const art = cell("กระดาษอาร์ตมัน 300 แกรม", "เคลือบด้าน");
const minPrice = Math.min(...Object.values(pricing.cells).flat());
const artM = pricing.cells[`กระดาษอาร์ตมัน 300 แกรม│เคลือบด้าน│${MONTH}`];
const PAPERS_TXT = "กระดาษอาร์ตมัน 300 / 350 / 400 แกรม · เนื้อพิเศษ · Stardream · โฮโลแกรม · กระดาษสีเงิน/ทอง · PET";
const highlights = [
  "ขนาด 4×6 นิ้ว · แนวนอน/แนวตั้ง",
  "ปฏิทินรายปี 1 ชุด 8 ใบ · รายเดือน 1 ชุด 13 ใบ (ราคา ×2) · พิมพ์ 1 ด้าน หรือ 2 ด้าน หลังปฏิทิน/หลังลายโปสการ์ด (+20)",
  p.highlights?.[2] ?? "🗓 สร้างปฏิทินบนเว็บได้เลย",
  PAPERS_TXT,
  `ยิ่งสั่งเยอะยิ่งถูก — เริ่มต้น ${minPrice} บาท/ชุด`,
];
const description =
  `โปสการ์ดปฏิทินขนาด 4×6 นิ้ว เลือกได้ทั้งปฏิทินรายปี (1 ชุด 8 ใบ) และรายเดือน (1 ชุด 13 ใบ) พิมพ์ 1 หรือ 2 ด้าน ` +
  `สร้างบนเว็บได้เลย ใส่รูป เลือกภาษา สี ฟอนต์ ไฮไลต์วันหยุดไทย และใส่วันสำคัญของคุณเองได้ ` +
  `กระดาษอาร์ตมัน 300–400 แกรม กระดาษเนื้อพิเศษ โฮโลแกรม สีเงิน/ทอง หรือ PET เริ่มต้นชุดละ ${minPrice} บาท`;
const tabs = (p.tabs ?? []).map((t, i) =>
  i === 0
    ? {
        ...t,
        text: t.text
          .replace("• รายปี 8 ใบ/ชุด: ทุกใบมีปฏิทินครบ 12 เดือน", "• ปฏิทินรายปี 1 ชุด 8 ใบ: ลายเดียวกันทั้ง 8 ใบ แต่ละใบมีปฏิทินครบ 12 เดือน")
          .replace("• รายเดือน 13 ใบ/ชุด: ปก + เดือนละใบ", "• ปฏิทินรายเดือน 1 ชุด 13 ใบ: หน้าปก + ใบประจำเดือน ม.ค.–ธ.ค.")
          .replace("(+10 บาท/ชุด)", "(ราคา ×2 ของรายปี — ใช้กระดาษ 2 แผ่น)")
          .replace(/• พิมพ์ 2 ด้าน: ด้านหน้ารูปเต็มใบ/, "• พิมพ์ 2 ด้าน (ด้านหลังเป็นปฏิทิน): ด้านหน้ารูปเต็มใบ")
          .replace(
            /(หลังปก = ภาพรวมทั้งปี)(?!\n• พิมพ์ 2 ด้าน \(ด้านหลังเป็นลาย)/,
            "$1\n• พิมพ์ 2 ด้าน (ด้านหลังเป็นลาย Postcard): ด้านหน้ารูป + ปฏิทินเหมือนพิมพ์ 1 ด้าน · ด้านหลังเป็นลายโปสการ์ด (ช่องแสตมป์ ที่อยู่ผู้รับ ผู้ส่ง) เขียนส่งไปรษณีย์ได้ (+20 บาท/ชุด)",
          )
          .replace(
            /• กระดาษเนื้อพิเศษ \(Canvas \/ 100 Pound \/ E-Photo \/ Extra \/ Stardream\) เคลือบไม่ได้/,
            "• ราคาตามชนิดกระดาษ × เคลือบด้านหน้า (ตารางเดียวกับโปสการ์ด) · เคลือบเฉพาะด้านหน้า\n" +
              "• กระดาษเนื้อพิเศษ / Stardream / PET เคลือบไม่ได้ · โฮโลแกรม/สีเงิน-ทองผิวเงา เคลือบเงาได้\n" +
              "• กระดาษอาร์ตมัน 400 แกรม และ PET สีใส พิมพ์ได้ 1 ด้าน",
          ),
      }
    : t,
);
const faqs = (p.seo?.faqs ?? []).map((f, i) =>
  i === 0
    ? {
        ...f,
        a:
          `ราคาตามตารางกระดาษเดียวกับโปสการ์ด (1 ชุด เท่า 1 แผ่น A3) · กระดาษอาร์ตมัน 300 แกรม เคลือบด้าน ${art.join(" / ")} บาท/ชุด (ตามจำนวนชุด) · ` +
          `กระดาษเนื้อพิเศษ/โฮโลแกรมเริ่ม ${cell("Canvas Paper 260 แกรม", "ไม่เคลือบ")[0]} · PET ${cell("พลาสติก PET 250 แกรม", "ไม่เคลือบ")[0]} · พิมพ์ 2 ด้าน +20 · ` +
          `รายเดือน 13 ใบ ราคา ×2 (กระดาษ 2 แผ่น — อาร์ตมัน 300 เคลือบด้าน ${artM.join(" / ")})`,
      }
    : i === 1
      ? { ...f, a: "รายปี 1 ชุด 8 ใบ ลายเดียวกัน แต่ละใบมีปฏิทินครบ 12 เดือน · รายเดือน 1 ชุด 13 ใบ คือหน้าปก 1 ใบ + ใบประจำเดือน ม.ค.–ธ.ค." }
      : f,
);

const mixRule = { baseFee: 0, includedDesigns: 4, extraFee: 5, tiers: [{ fromQty: 1, baseFee: 0, includedDesigns: 4, extraFee: 5 }] };

const next0: Product = {
  ...p,
  mixRule,
  options,
  rules,
  pricing,
  priceRates,
  highlights,
  description,
  tabs,
  calendarStudio: { ...p.calendarStudio!, formats },
  ...(p.seo ? { seo: { ...p.seo, faqs } } : {}),
};
delete next0.rateAfterOption;
const range = priceRange(next0);
const next: Product = { ...next0, priceMin: range.min, priceMax: range.max, hasQuote: hasQuoteOption(next0), savedAt: new Date().toISOString() };

console.log(`📦 ${name} (${ID}) ← กระดาษ/ราคา ${SOURCE} · ฿${range.min}-${range.max}`);
let last = "";
for (const o of options) {
  if (o.section !== last) console.log(`   ${(last = o.section ?? "")}`);
  console.log(
    `     · ${o.label}: ${o.choices
      .map((c) => c.name + (c.extra ? ` (+${c.extra})` : ""))
      .join(" | ")
      .slice(0, 120)}`,
  );
}
for (const c of type.choices) console.log(`       ${c.name} — ${c.desc}`);
console.log(`   กติกา ${rules.length} ข้อ: ${rules.map((r) => `${r.when.label}→${r.limit.label}`).join(" · ")}`);
console.log(`   เรท: ${priceRates.map((r) => `${r.label}${r.dealerOnly ? " (ตัวแทน)" : ""} ${Object.keys(r.pricing.cells).length} ช่อง`).join(" · ")}`);
console.log(`   formats: ${formats.map((f) => `${f.format}←${f.when.find((w) => w.label === TYPE)?.choices[0]}`).join(" · ")}`);
console.log(`   คละลาย: ${JSON.stringify(mixRule)}`);
console.log(`   faq[0]: ${faqs[0]?.a}`);
if (!WRITE) {
  console.log("\n(dry-run — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: next, price: next.price }).eq("id", ID);
if (upErr) die(`บันทึกไม่สำเร็จ: ${upErr.message}`);
const back = (await read(ID)).data;
if (back.savedAt !== next.savedAt || back.options.find((o) => o.label === PAPER)?.choices.length !== paperNames.length) die("อ่านกลับมาไม่ตรง");
console.log("   ✅ บันทึกแล้ว");
