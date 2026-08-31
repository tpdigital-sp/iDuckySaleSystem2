/**
 * Acrylic Coaster (/products/acrylic-coaster) — ผู้ใช้สั่ง 31 ส.ค. 69
 *
 *   npx tsx scripts/coaster-screen-2side.mts           # ดูผล + ตรวจ (ไม่เขียนฐานข้อมูล)
 *   npx tsx scripts/coaster-screen-2side.mts --write   # บันทึกจริง (รันซ้ำได้)
 *
 * 1. งานสกรีน — ผู้ใช้เคาะรายการสุดท้ายไว้ 3 ใบ (ชื่อชุดเดียวกับพวงกุญแจอะคริลิค):
 *        • "สกรีน 1 ด้าน (บน)"          ไม่บวกเพิ่ม · ทุกเนื้อ
 *        • "สกรีน 1 ด้าน (ใต้)"          ไม่บวกเพิ่ม · เฉพาะเนื้อโปร่ง
 *        • "สกรีน 2 เลเยอร์ (ใต้-บน)"   +฿25/อัน   · เฉพาะเนื้อโปร่ง ("2 เลเยอร์ คือ สกรีนบน-สกรีนใต้")
 *      กลุ่มนี้เดิมชื่อสั้น ๆ ว่า ด้านบน / ด้านใต้ · ระหว่างทางเคยลองแบบรวมใบเดียวและแบบมี (บน-บน) ด้วย
 *      สคริปต์จึงเปลี่ยนชื่อ + ถอดชื่อที่ตัดออกให้เอง (ดู RENAME / OBSOLETE) รันทับของเดิมรอบไหนก็ได้
 *    ⚠️ ชื่อตัวเลือกของกลุ่มนี้ถูกอ้างใน rules.limit.allow ด้วย — เปลี่ยน/ถอดต้องไล่แก้ที่กฎพร้อมกัน
 *       ไม่งั้นกฎเดิมกรองตัวเลือกใหม่ทิ้งทันทีที่เลือกสีอะไรก็ตาม (กฎครอบทุกสีในสินค้าตัวนี้)
 *       แยกทิศจากกฎเดิม: ข้อที่ให้สกรีนใต้ได้ = เนื้อโปร่ง → ได้ 2 เลเยอร์ด้วย
 *       อีกข้อ = เนื้อทึบ (C-02 · สีทึบ · hologram-01) สกรีนใต้ไม่ได้ → เหลือสกรีน 1 ด้าน (บน) อย่างเดียว
 *
 * 2. "เพิ่มภาพจำลองให้ด้วย" + ภาพหน้าจอกลุ่ม "ประเภท" ที่เป็นวิทยุเปล่า ๆ ("เพิ่มภาพให้หน่อย")
 *    • เทคนิคสกรีน: ใส่ภาพชุดกลาง acrylic-howto (ครอปจากแผ่น HOW TO PRINT) ให้ครบทุกใบ
 *      + แนบแผ่นเต็มเข้าแท็บ "งานสกรีน" แบบเดียวกับ scripts/acrylic-screen-art.mjs
 *      (สคริปต์ตัวนั้นกวาดไม่ถึงสินค้านี้ — กลุ่มชื่อ "เทคนิคสกรีน" ไม่ตรง GROUP_RE
 *       และชื่อตัวเลือก "ด้านบน/ด้านใต้" ไม่ตรง MATCH ของมัน)
 *    • ประเภท: เปลี่ยนเป็นการ์ด มีรูป + คำอธิบาย + ส่วนต่างราคาจริงที่คำนวณจากตาราง
 *      รูป "ธรรมดา" ต่อจากภาพจริง 2 ใบ — ดู scripts/coaster-type-art.mts
 *      รูป "พิเศษ" ใช้สวอตช์รวมชุดกลาง special-mix-v1 (ตัวเดียวกับที่พวงกุญแจอะคริลิคใช้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "acrylic-coaster";

const TYPE = "ประเภท";
const COLOR = "สีอะคริลิค";
const SCREEN = "เทคนิคสกรีน";
const NORMAL = "อะคริลิค ธรรมดา";
const SPECIAL = "อะคริลิค พิเศษ";
/**
 * ชื่อตัวเลือกทั้งกลุ่มยกมาจากพวงกุญแจอะคริลิคทั้งชุด ("มีสกรีน 1 ด้านด้วย" — ผู้ใช้ 31 ส.ค. 69)
 * ของเดิมเขียนสั้น ๆ ว่า "ด้านบน/ด้านใต้" อ่านคู่กับ "2 ด้าน (…)" แล้วไม่เป็นชุดเดียวกัน
 * ⚠️ เปลี่ยนชื่อตัวเลือก = ต้องไล่แทนใน rules.limit.allow ด้วย (ที่นี่มีอ้างอยู่ 3 จุด)
 *    ออเดอร์เก่าที่บันทึกชื่อเดิมไว้เป็นข้อความ ไม่กระทบ — แต่ "สั่งซ้ำ" ของบิลเก่าจะจับคู่ชื่อไม่ได้
 */
const TOP = "สกรีน 1 ด้าน (บน)";
const UNDER = "สกรีน 1 ด้าน (ใต้)";
const TWO_LAYER = "สกรีน 2 เลเยอร์ (ใต้-บน)";
const RENAME: Record<string, string> = {
  "ด้านบน": TOP,
  "ด้านใต้": UNDER,
  "2 ด้าน (ใต้-บน)": TWO_LAYER,
  "สกรีน 2 ด้าน (ใต้-บน)": TWO_LAYER,
};
/** ชื่อที่เคยลองระหว่างทางแล้วผู้ใช้ตัดออก — ถอดทิ้งทั้งจากตัวเลือกและจาก allow ของกฎ */
const OBSOLETE = ["2 ด้าน หรือ 2 เลเยอร์", "2 ด้าน (บน-บน)", "สกรีน 2 ด้าน (บน-บน)"];
const TWO_EXTRA = 25;

const IMG = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";
const ART = {
  [TOP]: `${IMG}/acrylic-howto/screen-1side-top-v1.jpg`,
  [UNDER]: `${IMG}/acrylic-howto/screen-1side-under-v1.jpg`,
  [TWO_LAYER]: `${IMG}/acrylic-howto/screen-2side-under-top-v1.jpg`,
  [NORMAL]: `${IMG}/acrylic-coaster/type-normal-v1.jpg`,
  [SPECIAL]: `${IMG}/acrylic-colors/special-mix-v1.jpg`,
};
/** ตัวเลือกใบที่ 3 — ผู้ใช้เคาะรายการสุดท้าย 31 ส.ค. 69 ว่ามีแค่ใบนี้ใบเดียว (ไม่มีแบบ บน-บน) */
const TWO_CHOICE = {
  name: TWO_LAYER,
  // ผู้ใช้ยืนยัน: "2 เลเยอร์ คือ สกรีนบน-สกรีนใต้" — จึงเป็นงานที่ต้องมองลายผ่านเนื้อ = เนื้อโปร่งเท่านั้น
  desc: "พิมพ์ซ้อน 2 ชั้น — ชั้นหนึ่งใต้แผ่น อีกชั้นบนผิว ลายมีมิติ · เฉพาะเนื้อโปร่งที่มองลายทะลุได้",
  extra: TWO_EXTRA,
  imageSrc: ART[TWO_LAYER],
};
const CHART = `${IMG}/acrylic-howto/howto-print-v1.jpg`;
const CHART_TAB = "งานสกรีน";
const CHART_NOTE =
  "• ดูแผ่น “HOW TO PRINT” ด้านล่าง — เทียบให้เห็นครบทุกแบบ (สกรีนใต้/บน · 2 ด้าน ใต้-บน/บน-บน · 3 และ 4 เลเยอร์)";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่าน ${ID} ไม่สำเร็จ — ${error.message}`);
const d: any = structuredClone(row!.data);
const optOf = (label: string) => d.options?.find((o: any) => o.label === label);
const mustOpt = (label: string) => {
  const o = optOf(label);
  if (!o) throw new Error(`ไม่เจอกลุ่ม "${label}" — โครงสินค้าเปลี่ยน ตรวจก่อน`);
  return o;
};

/* ── ส่วนต่างราคาจริง "พิเศษ" เทียบ "ธรรมดา" — เอาไปเขียนบนการ์ด ไม่ใช่เดาเอา ── */
const deltas = new Set<number>();
for (const p of [d.pricing, ...(d.priceRates ?? []).map((r: any) => r.pricing)]) {
  const cells = p?.cells as Record<string, number[]> | undefined;
  if (!cells?.[SPECIAL] || !cells?.[NORMAL]) continue;
  cells[SPECIAL].forEach((v, i) => deltas.add(v - cells[NORMAL][i]));
}
if (!deltas.size) throw new Error("อ่านส่วนต่างราคา ธรรมดา/พิเศษ จากตารางไม่ได้ — ตรวจแกนราคาก่อน");
const lo = Math.min(...deltas);
const hi = Math.max(...deltas);
const RANGE = lo === hi ? `฿${lo}` : `฿${lo}-${hi}`;
console.log(`ส่วนต่าง "${SPECIAL}" เทียบ "${NORMAL}": ${RANGE}/อัน (ค่าที่เจอ: ${[...deltas].sort((a, b) => a - b).join(", ")})`);

/* ── 1. เทคนิคสกรีน: ตั้งชื่อชุดเดียวกับพวงกุญแจ + งานสกรีน 2 ด้าน 2 แบบ + ใส่ภาพให้ครบทุกใบ ── */
const screen = mustOpt(SCREEN);
const screenNames = () => screen.choices.map((c: any) => c.name);
for (const [from, to] of Object.entries(RENAME)) {
  const c = screen.choices.find((x: any) => x.name === from);
  if (!c) continue; // รันซ้ำ = เปลี่ยนไปแล้ว
  c.name = to;
  for (const r of d.rules ?? [])
    if (r.limit?.label === SCREEN) r.limit.allow = (r.limit.allow ?? []).map((n: string) => (n === from ? to : n));
  console.log(`   [เปลี่ยนชื่อ] "${from}" → "${to}" (แก้ในกฎให้ด้วย)`);
}
// สกรีนชั้นเดียว 2 ใบอยู่ก่อน แล้วต่อด้วย 2 เลเยอร์ (ทิ้งชื่อที่ตัดออกระหว่างทาง)
const dropped = screenNames().filter((n: string) => OBSOLETE.includes(n));
screen.choices = [
  ...screen.choices.filter((c: any) => !OBSOLETE.includes(c.name) && c.name !== TWO_LAYER),
  { ...screen.choices.find((c: any) => c.name === TWO_LAYER), ...TWO_CHOICE },
];
for (const c of screen.choices) {
  const art = (ART as Record<string, string>)[c.name];
  if (art) c.imageSrc = art;
}
if (dropped.length) console.log(`   [ถอดตัวเลือก] ${dropped.join(" | ")}`);
screen.note = `สกรีนชั้นเดียวไม่บวกเพิ่ม — สกรีน 2 เลเยอร์ บวกอันละ ฿${TWO_EXTRA}`;

/* ── 2. ประเภท: เปลี่ยนเป็นการ์ดมีรูป (ผู้ใช้ส่งภาพหน้าจอมาว่ามันโล่งเกินไป) ── */
const type = mustOpt(TYPE);
const typeNames = type.choices.map((c: any) => c.name);
if (typeNames.join("│") !== [NORMAL, SPECIAL].join("│"))
  throw new Error(`ตัวเลือกกลุ่ม "${TYPE}" ไม่ใช่ ${NORMAL}/${SPECIAL} แล้ว (เจอ: ${typeNames.join(", ")}) — ตรวจก่อน`);
type.display = "cards";
type.note = "เนื้ออะคริลิคที่ใช้ทำตัวที่รองแก้ว — เป็นตัวกำหนดราคาต่ออัน (ดูตารางราคาด้านบน)";
type.choices = [
  {
    ...type.choices[0],
    name: NORMAL,
    popular: true,
    imageSrc: ART[NORMAL],
    desc: "อะคริลิคใส (สกรีนได้ทั้งบน/ใต้) หรือขาวขุ่น C-02 เงา 2 ด้าน — ราคาเริ่มต้นของร้าน",
  },
  {
    ...type.choices[1],
    name: SPECIAL,
    imageSrc: ART[SPECIAL],
    desc: `กลิตเตอร์ · โฮโลแกรม · กากเพชร · อะคริลิคสีทึบ รวม ${
      (optOf(COLOR)?.choices?.length ?? 0) - 2
    } เฉด (เลือกเฉดต่อในช่องถัดไป) — บวกเพิ่ม ${RANGE}/อัน`,
  },
];

/* ── 3. กฎ "สี → เทคนิคสกรีน": เนื้อโปร่งได้ 2 ด้านทั้งคู่ · เนื้อทึบได้เฉพาะ (บน-บน) ── */
let patched = 0;
for (const r of d.rules ?? []) {
  if (r.limit?.label !== SCREEN) continue;
  const before = r.limit.allow ?? [];
  // ข้อที่ยอมให้สกรีน "ด้านใต้" = กลุ่มเนื้อโปร่ง (มองลายผ่านเนื้อได้) — ที่เหลือคือเนื้อทึบ
  const clear = before.includes(UNDER);
  const allow = [
    ...before.filter((n: string) => n !== TWO_LAYER && !OBSOLETE.includes(n)),
    ...(clear ? [TWO_LAYER] : []), // เนื้อทึบสกรีนใต้ไม่ได้ → ไม่มี 2 เลเยอร์ให้เลือก เหลือสกรีน 1 ด้าน (บน)
  ];
  if (JSON.stringify(allow) === JSON.stringify(before)) continue;
  r.limit.allow = allow;
  patched++;
  console.log(
    `   [แก้กฎ] ${r.when.label}="${r.when.choice}" (+${(r.when.choices?.length ?? 1) - 1} สี · เนื้อ${clear ? "โปร่ง" : "ทึบ"}) → ${SCREEN}: ${allow.join(" | ")}`
  );
}

/* ── 4. แผ่น HOW TO PRINT เต็มใบเข้าแท็บ (แบบเดียวกับสินค้าอะคริลิคตัวอื่น) ── */
d.tabs ??= [];
let tab = d.tabs.find((t: any) => /สกรีน/.test(t.title)) ?? d.tabs.find((t: any) => t.title === "การเตรียมไฟล์");
if (!tab) {
  tab = { title: CHART_TAB, text: "" };
  d.tabs.push(tab);
  console.log(`   [แท็บ] สร้างแท็บ "${CHART_TAB}" ใหม่`);
}
if (!(tab.images ?? []).includes(CHART)) {
  tab.images = [...(tab.images ?? []), CHART];
  tab.imageSize = "lg";
  if (!tab.text?.includes("HOW TO PRINT")) tab.text = `${(tab.text ?? "").trimEnd()}\n${CHART_NOTE}`.trim();
  console.log(`   [แท็บ] แนบแผ่น HOW TO PRINT เข้าแท็บ "${tab.title}"`);
}

/* ── ตรวจผลก่อนบันทึก (จำลอง allowedChoices ตามกฎจริง) ── */
const ruleHits = (r: any, sel: Record<string, string>) => {
  const cur = sel[r.when.label];
  return !!cur && (r.when.choices?.length ? r.when.choices : [r.when.choice]).includes(cur);
};
const allowedFor = (label: string, sel: Record<string, string>) => {
  const all = (optOf(label)?.choices ?? []).map((c: any) => c.name);
  let allowed = all;
  for (const r of d.rules ?? []) {
    if (r.limit.label !== label || !ruleHits(r, sel)) continue;
    allowed = allowed.filter((n: string) => r.limit.allow.includes(n));
  }
  return allowed.length ? allowed : all;
};

console.log("\n🔍 ตรวจผล:");
let bad = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) bad++;
  console.log(`   ${ok ? "✅" : "❌"} ${msg}`);
};
for (const [color, want] of [
  ["อะคริลิใส", [TOP, UNDER, TWO_LAYER]],
  ["hologram-รุ้ง", [TOP, UNDER, TWO_LAYER]],
  ["อะคริลิคขาวขุ่น C-02", [TOP]],
  ["อะคริลิคสีดำ (BK)", [TOP]],
] as [string, string[]][]) {
  const got = allowedFor(SCREEN, { [COLOR]: color });
  check(JSON.stringify(got) === JSON.stringify(want), `สี "${color}" → เทคนิคสกรีนที่เลือกได้: ${got.join(" | ")}`);
}
{
  const two = screen.choices.find((x: any) => x.name === TWO_LAYER);
  check(two?.extra === TWO_EXTRA, `ตัวเลือก "${TWO_LAYER}" บวกอันละ ฿${two?.extra}`);
  const leftover = [...screenNames(), ...(d.rules ?? []).flatMap((r: any) => (r.limit?.label === SCREEN ? r.limit.allow : []))];
  check(!leftover.some((n: string) => OBSOLETE.includes(n)), `ไม่มีชื่อที่ตัดออกหลงเหลือทั้งในตัวเลือกและในกฎ (${OBSOLETE.join(" | ")})`);
  check(
    JSON.stringify(screenNames()) === JSON.stringify([TOP, UNDER, TWO_LAYER]),
    `กลุ่ม "${SCREEN}" มี ${screen.choices.length} ตัวเลือก (${screenNames().join(" | ")})`
  );
  for (const c of screen.choices) check(!!c.imageSrc && !!c.desc, `การ์ด "${c.name}" มีรูป + คำอธิบาย`);
  for (const c of type.choices) check(!!c.imageSrc && !!c.desc, `การ์ด "${c.name}" มีรูป + คำอธิบาย`);
  check(type.display === "cards", `กลุ่ม "${TYPE}" แสดงเป็นการ์ด`);
  check(patched === 2 || patched === 0, `แก้กฎไป ${patched} ข้อ (รันซ้ำจะเป็น 0 — กฎมีชื่อใหม่อยู่แล้ว)`);
}
// รูปทุกใบต้องโหลดได้จริง (ผิดพลาดตรงนี้ = การ์ดรูปแตกบนหน้าร้าน)
for (const url of [...new Set([...Object.values(ART), CHART])]) {
  const res = await fetch(url, { method: "HEAD" });
  check(res.ok, `รูป ${url.split("/").slice(-2).join("/")} — ${res.status}`);
}

if (bad) throw new Error(`ผลตรวจไม่ผ่าน ${bad} ข้อ — ไม่บันทึก`);
if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
d.savedAt = new Date().toISOString();
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ — ${saveErr.message}`);
console.log("\n✅ บันทึกแล้ว");
