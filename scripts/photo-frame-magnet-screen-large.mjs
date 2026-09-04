#!/usr/bin/env node
/**
 * กรอบรูปอะคริลิค แม่เหล็ก (photoframe-4) — งานสกรีนของขนาดใหญ่ 17x12.8x1cm
 *
 *   node scripts/photo-frame-magnet-screen-large.mjs           (สรุปว่าจะเขียนอะไร + จำลองผลทุกขนาด ไม่แตะ DB)
 *   node scripts/photo-frame-magnet-screen-large.mjs --write   (เขียน options/rules + อ่านกลับเทียบ)
 *
 * เดิมกลุ่ม "สกรีน" มี showWhen = ขนาดเล็ก 2 ตัว → ขนาด 17x12.8x1cm ไม่มีกลุ่มสกรีนเลย
 *
 * เจ้าของร้านสั่ง (4 ก.ย. 69): ขนาด 17x12.8x1cm ทำได้แค่ "1 ด้าน (บน)" อย่างเดียว
 * (รอบแรกสั่งให้มี "2 ด้าน (บน-บน)" +฿10 ด้วย แล้วสั่งเอาออกทีหลังในวันเดียวกัน)
 * เหลือตัวเลือกเดียว = หน้าร้านโชว์เป็นบรรทัดล็อก 🔒 ให้เอง (ProductDetail ล็อกเมื่อกฎเหลือตัวเดียว)
 *
 * ⚠️ ทำด้วย "กลุ่มชื่อซ้ำ + showWhen" ไม่ได้ เพราะ:
 *   - initialSelections() คีย์ด้วยชื่อกลุ่ม กลุ่มหลังทับกลุ่มหน้า → ขนาดเล็กเปิดหน้ามาได้ค่าเริ่มต้นผิด
 *     (เคยลองแล้ว: ค่าเริ่มต้นเด้งจาก "1 ด้าน (ใต้)" ซึ่งเป็นแบบมาตรฐานร้าน ไปเป็น "1 ด้าน (บน)")
 *   - allowedChoices() ใช้ options.find(label) เห็นแค่กลุ่มแรก
 * → ใช้ **กลุ่มเดียวโชว์ทุกขนาด + OptionRule** แทน: resolveSelections() สลับค่าที่ขัดกฎให้เอง
 *
 * รันซ้ำได้: ลบกลุ่มสกรีนซ้ำที่เผลอสร้างไว้ · เขียนกฎทับข้อเดิมที่ชี้กลุ่ม "สกรีน"
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const PRODUCT_ID = "photoframe-4";
const OUT = ".cache/photoframe-4";
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SCREEN_GROUP = "สกรีน";
const BIG = "17x12.8x1cm";
/** งานสกรีนที่ขนาดใหญ่ทำได้ — ชื่อต้องตรงกับ choices ในกลุ่ม "สกรีน" เป๊ะ ๆ */
const BIG_ALLOW = ["1 ด้าน (บน)"];

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

const options = data.options ?? [];
const sizeGroup = options.find((o) => o.label === SIZE_GROUP);
const sizeNames = (sizeGroup?.choices ?? []).map((c) => c.name);
if (!sizeNames.includes(BIG)) { console.error(`ไม่เจอขนาด "${BIG}" ในกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }

// ── 1. เหลือกลุ่ม "สกรีน" กลุ่มเดียว (ตัวที่มีตัวเลือกครบ) แล้วให้โชว์ทุกขนาด ──
const screens = options.filter((o) => o.label === SCREEN_GROUP);
if (!screens.length) { console.error(`ไม่เจอกลุ่ม "${SCREEN_GROUP}"`); process.exit(1); }
const main = screens.reduce((a, b) => ((b.choices?.length ?? 0) > (a.choices?.length ?? 0) ? b : a));
const dupes = screens.filter((o) => o !== main);
const missing = BIG_ALLOW.filter((n) => !(main.choices ?? []).some((c) => c.name === n));
if (missing.length) { console.error("กลุ่มสกรีนไม่มีตัวเลือกที่ต้องอนุญาต:", missing); process.exit(1); }

// ── 2. กฎ: เลือกขนาดใหญ่ → สกรีนเหลือเฉพาะที่อนุญาต ──
const rule = {
  when: { label: SIZE_GROUP, choice: BIG, choices: [BIG] },
  limit: { label: SCREEN_GROUP, allow: BIG_ALLOW },
};
const keptRules = (data.rules ?? []).filter((r) => !(r?.limit?.label === SCREEN_GROUP && r?.when?.label === SIZE_GROUP));

/** จำลอง allowedChoices() ของ src/lib/products.ts — กลุ่มเดียว + กฎที่ยิงถึงกลุ่มนั้น */
const simulate = (size, opts, rules) => {
  const g = opts.find((o) => o.label === SCREEN_GROUP);
  let allowed = (g.choices ?? []).map((c) => c.name);
  for (const r of rules) {
    if (r.limit.label !== SCREEN_GROUP) continue;
    if ((r.when.choices ?? [r.when.choice]).includes(size)) allowed = allowed.filter((n) => r.limit.allow.includes(n));
  }
  return allowed.length ? allowed : (g.choices ?? []).map((c) => c.name);
};

const nextOptions = options.filter((o) => !dupes.includes(o));
const nextMain = { ...main };
delete nextMain.showWhen; // โชว์ทุกขนาด — ความต่างของแต่ละขนาดคุมด้วยกฎแทน
nextOptions[nextOptions.indexOf(main)] = nextMain;
const nextRules = [...keptRules, rule];

console.log(`กลุ่ม "${SCREEN_GROUP}": เจอ ${screens.length} กลุ่ม → เหลือ 1 (ลบซ้ำ ${dupes.length}) · ตัด showWhen ให้โชว์ทุกขนาด`);
console.log(`กฎที่จะเขียน: ${SIZE_GROUP} = ${BIG} → ${SCREEN_GROUP} เหลือ ${BIG_ALLOW.join(" / ")}`);
for (const s of sizeNames) console.log(`  จำลอง ${s} → ${simulate(s, nextOptions, nextRules).join(" · ")}`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write)"); process.exit(0); }

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

data.options = nextOptions;
data.rules = nextRules;
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const backScreens = back.data.options.filter((o) => o.label === SCREEN_GROUP);
if (backScreens.length !== 1) { console.error("กลุ่มสกรีนต้องเหลือกลุ่มเดียว แต่ได้", backScreens.length); process.exit(1); }
if (backScreens[0].showWhen) { console.error("ยังมี showWhen ค้างอยู่", backScreens[0].showWhen); process.exit(1); }
if (backScreens[0].choices?.length !== 4) { console.error("ตัวเลือกในกลุ่มสกรีนหาย", backScreens[0].choices?.map((c) => c.name)); process.exit(1); }
const backRule = (back.data.rules ?? []).find((r) => r.limit?.label === SCREEN_GROUP);
if (!backRule || backRule.limit.allow.join("|") !== BIG_ALLOW.join("|")) { console.error("กฎไม่ตรง", backRule); process.exit(1); }

// ผลลัพธ์ที่ลูกค้าจะเห็นจริงต่อขนาด
for (const s of sizeNames) {
  const got = simulate(s, back.data.options, back.data.rules ?? []);
  const want = s === BIG ? BIG_ALLOW : back.data.options.find((o) => o.label === SCREEN_GROUP).choices.map((c) => c.name);
  if (got.join("|") !== want.join("|")) { console.error(`ขนาด ${s} ได้ตัวเลือกสกรีนไม่ตรง`, got); process.exit(1); }
  console.log(`  ✓ ${s} → ${got.join(" · ")}`);
}
// แกนราคาไม่สะเทือน — ชื่อขนาดยังตรงคีย์ตารางทั้ง pricing และ priceRates
const cellKeys = Object.keys(back.data.pricing?.cells ?? {});
const rateKeys = Object.keys(back.data.priceRates?.[0]?.pricing?.cells ?? {});
for (const s of sizeNames) {
  if (!cellKeys.includes(s) || !rateKeys.includes(s)) { console.error("ชื่อขนาดหลุดจากคีย์ตาราง!", s); process.exit(1); }
}
console.log(`✓ กลุ่มสกรีนกลุ่มเดียว 4 ตัวเลือก + กฎขนาดใหญ่เหลือ ${BIG_ALLOW.length} แบบ อ่านกลับตรง · savedAt =`, back.data.savedAt);
