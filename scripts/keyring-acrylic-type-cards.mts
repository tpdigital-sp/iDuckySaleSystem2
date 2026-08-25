/**
 * พวงกุญแจอะคริลิค (/products/keyring) — แยก "เนื้ออะคริลิค" เป็น 3 แบบให้ลูกค้าเห็นราคาต่างกัน
 *
 *   npx tsx scripts/keyring-acrylic-type-cards.mts            # ดูผล + ตรวจ (ไม่เขียนฐานข้อมูล)
 *   npx tsx scripts/keyring-acrylic-type-cards.mts --write    # บันทึกจริง
 *
 * ปัญหา (ผู้ใช้ส่งภาพหน้าจอมา 25 ส.ค. 69): กลุ่ม "สีอะคริลิค" เป็นเมนูยาว 46 สีรวดเดียว
 * เลือกสีไหนก็ได้ ไม่มีอะไรบอกว่า 44 สีท้าย ๆ แพงกว่าอะคริลิคใส — ทั้งที่ราคาต่างกันจริง
 * ("แยกเป็นอะคริลิคใส , อะคริลิค c-02 , อะคริลิคพิเศษ เพราะต้องมีบวกราคาเพิ่ม")
 *
 * ต้นเหตุ: แกนราคาตัวจริงคือกลุ่ม "ประเภทอะคริลิค" ซึ่ง**ซ่อนถาวร** (showWhen ชี้ชื่อ
 * "สกรีน 1 ด้าน / สกรีน 2 ด้าน" ที่กลุ่มงานสกรีนเปลี่ยนเป็น "สกรีน 1 ด้าน (ใต้)" ไปแล้ว)
 * scripts/fix-keyring-acrylic-rules.mjs เคยแก้ด้วยการ "กลับทิศ" ให้สีเป็นตัวกำหนดประเภท
 * → ราคาถูกต้อง แต่ลูกค้ามองไม่เห็นว่าจ่ายเพิ่มตอนไหน
 *
 * วิธีแก้รอบนี้ — กลับมาทิศปกติ: ให้ลูกค้าเลือก "ประเภท" ก่อน แล้วค่อยเลือกเฉด
 *   1. กลุ่ม "ประเภทอะคริลิค" ถอด showWhen ที่พัง → โชว์เป็นการ์ด 3 ใบ (รูป + คำอธิบาย + ส่วนต่างราคา)
 *   2. กลุ่ม "สีอะคริลิค" โผล่เฉพาะตอนเลือก "สีพิเศษ" (ใส/C-02 มีเฉดเดียว ไม่ต้องถามซ้ำ)
 *   3. กฎเงื่อนไขกลับทิศ: ประเภท → กรองรายการสี (ลบกฎ สี → ประเภท ทิ้ง ไม่งั้นวนกันเอง
 *      เลือกการ์ด "ใส" ปุ๊บ กฎเก่าจะดันประเภทกลับไปเป็นสีพิเศษตามสีที่ค้างอยู่ทันที)
 *
 * ข้อเท็จจริงจากตารางราคาจริง (กางทุกช่องแล้วเทียบ):
 *   • "อะคริลิคขาวขุ่น C-02" ราคาเท่ากับ "อะคริลิคใส" เป๊ะทุกช่อง (140 ช่องเรท 1 · 90 ช่องเรท 2)
 *     — ตรงกับสวอตช์ทางการของร้านที่ปั๊มป้าย "ไม่บวกเพิ่ม" ไว้บนภาพ
 *   • "สีพิเศษ" แพงกว่าใส ฿5-15/ชิ้น แล้วแต่ขนาด/สกรีน/ช่วงจำนวน (ไม่ใช่ตัวเลขเดียวคงที่)
 *   • "ใสเท่านั้น" เป็นชื่อช่องราคาที่ราคาเท่ากับ "อะคริลิคใส" ทุกช่อง — ซ้ำซ้อน
 *     ถอดออกจากตัวเลือก แล้วให้ 1mm/2mm ใช้ "อะคริลิคใส" แทน (ราคาเท่าเดิม ไม่ต้องโชว์การ์ดชื่อประหลาด)
 *     ⚠️ ช่องราคาชื่อ "ใสเท่านั้น" ยังอยู่ในตาราง — ของเก่าในตะกร้า/ออเดอร์ที่ค้างชื่อนี้ยังคิดราคาได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-copy-copy"; // ลิงก์หน้าร้านคือ /products/keyring (slug)

const TYPE = "ประเภทอะคริลิค";
const COLOR = "สีอะคริลิค";
const THICK = "ความหนาอะคริลิค";
const SCREEN = "งานสกรีน";
const CLEAR = "อะคริลิคใส";
const C02 = "อะคริลิคขาวขุ่น C-02";
const SPECIAL = "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)";
const CLEAR_ONLY = "ใสเท่านั้น"; // ชื่อช่องราคาซ้ำซ้อน — ถอดออกจากตัวเลือก

const IMG = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";
const ART = {
  [CLEAR]: "https://static.wixstatic.com/media/959b83_f84a35eee0994f9c86929600a0908fe7~mv2.jpg/v1/fill/w_900,h_675,al_c,q_85/file.jpg",
  [C02]: `${IMG}/acrylic-colors/c02-v2.jpg`,
  [SPECIAL]: `${IMG}/acrylic-colors/special-mix-v1.jpg`, // ต่อสวอตช์ 4 ใบ — ดู keyring-special-color-art.mts
};

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
const optOf = (label: string) => d.options.find((o: any) => o.label === label);
const namesOf = (label: string): string[] => (optOf(label)?.choices ?? []).map((c: any) => c.name);

/* ── ส่วนต่างราคาจริงของ "สีพิเศษ" เทียบ "อะคริลิคใส" — เอาไปเขียนบนการ์ด ไม่ใช่เดาเอา ── */
const deltas = new Set<number>();
for (const r of d.priceRates ?? []) {
  const cells = r.pricing.cells as Record<string, number[]>;
  for (const k of Object.keys(cells)) {
    const p = k.split("│");
    if (p[3] !== SPECIAL) continue;
    const base = cells[[...p.slice(0, 3), CLEAR].join("│")];
    if (base) cells[k].forEach((v, i) => deltas.add(v - base[i]));
  }
}
const lo = Math.min(...deltas);
const hi = Math.max(...deltas);
const RANGE = lo === hi ? `฿${lo}` : `฿${lo}-${hi}`;
console.log(`ส่วนต่าง "สีพิเศษ" เทียบอะคริลิคใส: ${RANGE}/ชิ้น (ค่าที่เจอ: ${[...deltas].sort((a, b) => a - b).join(", ")})`);

/* ── 1. กลุ่ม "ประเภทอะคริลิค" → การ์ด 3 ใบ ── */
const type = optOf(TYPE);
if (!type) throw new Error(`ไม่เจอกลุ่ม ${TYPE}`);
delete type.showWhen; // ← ตัวที่ทำให้กลุ่มนี้ซ่อนถาวร (ชี้ชื่อตัวเลือกงานสกรีนแบบเก่า)
type.display = "cards";
type.note = "เนื้ออะคริลิคที่ใช้ทำตัวชิ้นงาน — ราคาต่อชิ้นคิดตามแบบที่เลือก (ดูตารางราคาด้านบน)";
type.choices = [
  {
    name: CLEAR,
    popular: true,
    imageSrc: ART[CLEAR],
    desc: "เนื้อใสมองทะลุ พิมพ์ใต้แผ่นได้ ผิวเรียบเงา — แบบมาตรฐานของร้าน ราคาเริ่มต้น",
  },
  {
    name: C02,
    imageSrc: ART[C02],
    desc: "เนื้อขาวขุ่นทึบ เงา 2 ด้าน ลายเด่นไม่ทะลุหลัง — ราคาเท่าอะคริลิคใส ไม่บวกเพิ่ม",
  },
  {
    name: SPECIAL,
    imageSrc: ART[SPECIAL],
    desc: `กลิตเตอร์ · โฮโลแกรม · กระจก · อะคริลิคสีทึบ รวม 44 เฉด (เลือกเฉดได้หลังกดแบบนี้) — บวกเพิ่ม ${RANGE}/ชิ้น ตามขนาดและจำนวนที่สั่ง`,
  },
];

/* ── 2. กลุ่ม "สีอะคริลิค" → โผล่เฉพาะตอนเลือกสีพิเศษ ── */
const color = optOf(COLOR);
if (!color) throw new Error(`ไม่เจอกลุ่ม ${COLOR}`);
color.showWhen = { label: TYPE, choices: [SPECIAL] };
color.note = "44 เฉดของอะคริลิคสีพิเศษ — ราคาเท่ากันทุกเฉด";
const SPECIAL_COLORS = namesOf(COLOR).filter((n) => n !== CLEAR && n !== C02);

/* ── 3. กฎเงื่อนไข: กลับทิศให้ประเภทเป็นตัวกรองสี ── */
const rules: any[] = d.rules ?? [];
const isRule = (r: any, whenLabel: string, limitLabel: string) =>
  r.when?.label === whenLabel && r.limit?.label === limitLabel;
const mk = (whenLabel: string, choices: string[], limitLabel: string, allow: string[]) => ({
  when: { label: whenLabel, choice: choices[0], choices },
  limit: { label: limitLabel, allow },
});

const kept = rules.filter((r) => {
  // กฎย้อนทิศ (สี → ประเภท) — ต้องทิ้ง ไม่งั้นล็อกกันเองจนกดเปลี่ยนประเภทไม่ได้
  if (isRule(r, COLOR, TYPE)) {
    console.log(`   [ลบกฎย้อนทิศ] ${COLOR} → ${TYPE}: ${r.limit.allow.join(" | ")}`);
    return false;
  }
  // "สกรีน 3 เลเยอร์ → สีต้องเป็นใส" ย้ายไปกำกับที่ประเภทแทน (สีถูกซ่อนตอนไม่ใช่สีพิเศษแล้ว)
  if (isRule(r, SCREEN, COLOR)) {
    console.log(`   [ย้ายกฎ] ${SCREEN} → ${COLOR} · เปลี่ยนไปคุม ${TYPE} แทน`);
    return false;
  }
  return true;
});
for (const r of kept) {
  // 1mm/2mm เคยล็อกไปที่ช่องราคาชื่อ "ใสเท่านั้น" — ราคาเท่า "อะคริลิคใส" เป๊ะ ใช้ชื่อเดียวพอ
  if (isRule(r, THICK, TYPE) && r.limit.allow.includes(CLEAR_ONLY)) {
    r.limit.allow = [CLEAR];
    console.log(`   [แก้กฎ] หนา ${(r.when.choices ?? [r.when.choice]).join("/")} → ${TYPE}: ${CLEAR}`);
  }
}
for (const r of [
  mk(SCREEN, ["สกรีน 3 เลเยอร์"], TYPE, [CLEAR]),
  mk(TYPE, [CLEAR], COLOR, [CLEAR]),
  mk(TYPE, [C02], COLOR, [C02]),
  mk(TYPE, [SPECIAL], COLOR, SPECIAL_COLORS),
]) {
  kept.push(r);
  const n = r.limit.allow.length;
  console.log(`   [เพิ่มกฎ] ${r.when.label}=${r.when.choices.join("/")} → ${r.limit.label}: ${n > 3 ? `${n} ตัว` : r.limit.allow.join(" | ")}`);
}
d.rules = kept;

/* ── ตรวจผลก่อนบันทึก (จำลอง allowedChoices + resolveSelections ตามลำดับกลุ่มจริง) ── */
const ruleHits = (r: any, sel: Record<string, string>) => {
  const cur = sel[r.when.label];
  return !!cur && (r.when.choices?.length ? r.when.choices : [r.when.choice]).includes(cur);
};
const allowedFor = (label: string, sel: Record<string, string>) => {
  const all = namesOf(label);
  let allowed = all;
  for (const r of d.rules) {
    if (r.limit.label !== label || !ruleHits(r, sel)) continue;
    allowed = allowed.filter((n: string) => r.limit.allow.includes(n));
  }
  return allowed.length ? allowed : all;
};
/** ไล่กลุ่มตามลำดับจริงเหมือน resolveSelections — กลุ่มหลังเห็นค่าที่กลุ่มก่อนหน้าเพิ่งถูกบังคับ */
const resolve = (seed: Record<string, string>) => {
  const out: Record<string, string> = {};
  for (const o of d.options) {
    const view = { ...seed, ...out };
    const allowed = allowedFor(o.label, view);
    const cur = seed[o.label];
    out[o.label] = cur && allowed.includes(cur) ? cur : allowed[0];
  }
  return out;
};
const rate = d.priceRates[0];
const priceOf = (sel: Record<string, string>) =>
  rate.pricing.cells[rate.pricing.driverLabels.map((l: string) => sel[l]).join("│")]?.[0];

console.log("\n🔍 ตรวจผล (ขนาด 2cm · สกรีน 1 ด้าน (ใต้) · เรทที่ 1 ช่วง 1-10 ชิ้น):");
let bad = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) bad++;
  console.log(`   ${ok ? "✅" : "❌"} ${msg}`);
};
const base = { [THICK]: "3mm", ขนาด: "2cm", [SCREEN]: "สกรีน 1 ด้าน (ใต้)" };
for (const t of [CLEAR, C02, SPECIAL]) {
  const sel = resolve({ ...base, [TYPE]: t });
  const colors = allowedFor(COLOR, sel);
  check(
    sel[TYPE] === t && priceOf(sel) != null,
    `เลือกการ์ด "${t}" → ช่องราคา "${sel[TYPE]}" ฿${priceOf(sel)}/ชิ้น · รายการสี ${colors.length} เฉด (${colors.slice(0, 2).join(", ")}${colors.length > 2 ? ", …" : ""})`
  );
}
{
  // สลับ สีพิเศษ → ใส ต้องกลับได้ (กับดักเดิมของกฎย้อนทิศ: ค้างที่สีพิเศษตลอดกาล)
  const sp = resolve({ ...base, [TYPE]: SPECIAL, [COLOR]: "hologram-01" });
  const back = resolve({ ...sp, [TYPE]: CLEAR });
  check(back[TYPE] === CLEAR && back[COLOR] === CLEAR, `กด "${SPECIAL}" (hologram-01) แล้วกดกลับ "${CLEAR}" → ประเภท "${back[TYPE]}" · สี "${back[COLOR]}"`);
  check(priceOf(sp)! > priceOf(back)!, `ราคาต่างกันจริง — สีพิเศษ ฿${priceOf(sp)} > ใส ฿${priceOf(back)}`);
}
for (const thick of ["1mm", "2mm"]) {
  const sel = resolve({ ...base, [THICK]: thick });
  const types = allowedFor(TYPE, sel);
  check(types.length === 1 && types[0] === CLEAR && priceOf(sel) != null, `หนา ${thick} → ประเภทที่เลือกได้: ${types.join(", ")} · ฿${priceOf(sel)}/ชิ้น`);
}
{
  const sel = resolve({ ...base, [SCREEN]: "สกรีน 3 เลเยอร์" });
  const types = allowedFor(TYPE, sel);
  check(types.length === 1 && types[0] === CLEAR && priceOf(sel) != null, `สกรีน 3 เลเยอร์ → ประเภทที่เลือกได้: ${types.join(", ")} · ฿${priceOf(sel)}/ชิ้น`);
}
check(!namesOf(TYPE).includes(CLEAR_ONLY), `ตัวเลือก "${CLEAR_ONLY}" ถูกถอดออกจากการ์ดแล้ว (ช่องราคาชื่อนี้ยังอยู่ในตาราง เผื่อของเก่า)`);
check(SPECIAL_COLORS.length === 44, `สีพิเศษ ${SPECIAL_COLORS.length} เฉด (ทั้งหมด ${namesOf(COLOR).length} − ใส − C-02)`);
for (const c of d.options.find((o: any) => o.label === TYPE).choices)
  check(!!c.imageSrc && !!c.desc, `การ์ด "${c.name}" มีรูป + คำอธิบาย`);

if (bad) throw new Error(`ผลตรวจไม่ผ่าน ${bad} ข้อ — ไม่บันทึก`);
if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ — ${saveErr.message}`);
console.log("\n✅ บันทึกแล้ว");
