#!/usr/bin/env node
/**
 * ฟอยล์ทั้งร้าน — เปลี่ยนภาพตัวเลือกในกลุ่มฟอยล์ทุกกลุ่ม/ทุกสินค้า
 * จากภาพจำลอง (การ์ด FOIL วาดขึ้น) เป็นภาพงานจริงของร้าน
 * ต้นทาง: /Volumes/iDuckyShop/- ตัวอย่าง เคสลูกค้าสั่งทำ/ฟอย  (82 ใบ)
 *
 *   node scripts/foil-photos-shopwide.mjs            # ดูก่อน (ไม่เขียน)
 *   node scripts/foil-photos-shopwide.mjs --write
 *
 * ผู้ใช้สั่ง 1 ก.ย. 69: "ปรับภาพฟอยให้หน่อย ตาม path นี้ กับสินค้าทุกตัว"
 *
 * เลือกภาพยังไง (จาก 82 ใบในโฟลเดอร์)
 *   • สีฟอยล์ 4 สี (1 Layer) → ครอปจากใบเดียวกัน DSC09270 (พัดแผ่นฟอยล์ล้วน ลายเดียวกัน
 *     ปั๊มคนละสี ในแสงเดียวกัน) เงิน/ทอง/โรสโกล จึงเทียบกันได้ตรง ๆ ไม่หลอกตาเพราะแสง
 *     ยกเว้น "โฮโลแกรม" ใช้ DSC09277 — ของ DSC09270 ซีดจนย่อเป็นภาพเล็กแล้วดูไม่ออกว่าเป็นโฮโลแกรม
 *   • พิมพ์ 1 Layer → ทั้งใบ DSC09270 = ฟอยล์ล้วนบนแผ่นเปล่า ไม่มีพิมพ์สี (ตรงกับคำอธิบาย)
 *   • พิมพ์ 2 Layer → DSC09287 = การ์ดพิมพ์สีเต็มใบ 4 ใบ ปั๊มฟอยล์คนละสีทับ
 *   • สีฟอยล์ 4 สี (2 Layer) → การ์ดแมว 福 ชุดเดียวกันทั้ง 4 สี (ผู้ใช้เลือกเอง 1 ก.ย. 69)
 *     เงิน DSC09305 (25°) · โฮโลแกรม DSC09310 (25°) = การ์ดแมว 福
 *     ⚠️ การ์ดแมวที่ 福 เป็นชมพู-ม่วงเหลือบ = โฮโลแกรม (ไม่ใช่โรสโกล — เคยแมปสลับมาแล้ว)
 *     DSC09310 เป็นใบที่ผู้ใช้ชี้เอง แต่วัดความคมได้ต่ำ (lap 84) จึงต้องครอปโซนที่ชัดสุด + sharpen 1.2
 *     ทอง DSC09296 (-16°) · โรสโกล DSC09293 (38°) = การ์ดซานต้าพื้นน้ำเงิน (ผู้ใช้ชี้ภาพมาเอง)
 *     เหตุผล: ฟอยล์ทอง/โรสโกลบนการ์ดแมวเป็นฟอยล์บนพื้นส้มทอง คอนทราสต์ต่ำ ดูไม่ออกตอนย่อเป็นภาพเล็ก
 *     ส่วนพื้นน้ำเงินของการ์ดซานต้าตัดกับทอง/ทองแดงชัด — ชุดจึงเป็นการ์ดคนละลายได้ ผู้ใช้โอเค
 *     ข้อดีของชุดนี้: การ์ดลายเดียวกันหมด ต่างกันแค่สีฟอยล์ที่ตัว 福 → ลูกค้าเทียบสีได้ตรง ๆ
 *     ⚠️ ก่อนหน้านี้เคยใช้การ์ดซานต้า (DSC09296/09298/09292/09303) ผู้ใช้เปลี่ยนมาเป็นการ์ดแมวแทน
 *     ⚠️ การ์ดวางเอียงในภาพต้นฉบับทุกใบ → ต้อง .rotate() ก่อนครอปเสมอ เช็คจากตัว 福 ว่าตั้งตรงไหม
 *     ⚠️ และต้องเลือกใบที่ "การ์ดสีนั้นอยู่ในระยะชัด" — ภาพชุดนี้ชัดตื้นมาก การ์ดที่อยู่นอกระยะเบลอทั้งใบ
 *        วิธีหา: สแกน Laplacian variance เป็นตารางทั้งภาพ (ช่องละ ~1400px) แล้วเลือกช่องที่คะแนนสูงสุด
 *        ของ v4 ใช้ DSC09286 ทั้งสามสี ซึ่งการ์ดโรสโกลอยู่นอกระยะชัด → ผู้ใช้ทักว่าเบลอตอนเปิดดูภาพใหญ่
 *     ผูกไว้กับตัวเลือกผ่าน choice.imageWhen — ลูกค้ากด "พิมพ์ 2 Layer" แล้วการ์ดสีสลับเป็นงานพิมพ์สี+ฟอยล์
 *     (ผู้ใช้สั่งเพิ่ม: "ถ้าเลือกพิมพ์ 2 layer ให้เปลี่ยนเป็นภาพ 2 layer")
 *   • "ไม่ปั๊มฟอยล์ / ไม่เคลือบฟอยล์" ไม่แตะ — ไม่มีฟอยล์ให้ถ่าย ใช้การ์ดอธิบายเดิม
 *
 * ต้นฉบับครอปไว้แล้วที่ scripts/assets/foil/ (รันซ้ำได้โดยไม่ต้องต่อไดรฟ์)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชค้าง) — แก้ภาพเมื่อไหร่ให้ขยับ REV
 * ⚠️ v1 เคยใช้ DSC09283/09298 แล้วผู้ใช้ทักว่า "ภาพไม่ค่อยชัด" — สองใบนั้นวัดความคม
 *    (Laplacian variance) ได้ต่ำ แถมครอปเล็กแล้วขยายขึ้น 1200px ยิ่งเบลอ
 *    v2 เป็นต้นมาจึงไล่วัดความคมทั้ง 82 ใบก่อน ครอปจากใบที่คมสุด และไม่ขยายเกินต้นฉบับ
 *
 * ไม่แตะชื่อกลุ่ม / ชื่อตัวเลือก / ราคา / display เลย · รันซ้ำได้ ผลลัพธ์เท่าเดิม
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const BASE = `${pick("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/public/product-images/products`;

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

/* ── คลังภาพกลาง ─────────────────────────────────────────────────── */

const REV = "v10";
const DIR = fileURLToPath(new URL("./assets/foil/", import.meta.url));
const COLORS = ["silver", "gold", "rose", "holo"];
const KEYS = [...COLORS, "layer1", "layer2", ...COLORS.map((c) => `${c}-2l`)];
const src = (k) => `${BASE}/foil-real/${k}-${REV}.jpg`;
const buf = Object.fromEntries(KEYS.map((k) => [k, readFileSync(`${DIR}${k}.jpg`)]));

/* ── จับคู่ชื่อตัวเลือก → ภาพ (ลำดับสำคัญ: กฎบนชนะ) ───────────────── */

const RULES = [
  [/^ไม่/, null],                    // ไม่ปั๊มฟอยล์ · ไม่เคลือบฟอยล์ → ไม่แตะ
  [/โฮโลแกรม|hologram/i, "holo"],
  [/โรสโกล|rose/i, "rose"],
  [/ทอง|gold/i, "gold"],
  [/เงิน|silver/i, "silver"],
  [/2\s*(layer|เลเยอร์)/i, "layer2"],
  [/1\s*(layer|เลเยอร์)/i, "layer1"],
];
const ruleOf = (name) => RULES.find(([re]) => re.test(name ?? ""));

/** กลุ่มฟอยล์เท่านั้น — กลุ่มเคลือบลามิเนตมีตัวเลือก "เคลือบด้าน (มากับงานฟอยล์)" ปนอยู่ ห้ามแตะ */
const IS_FOIL_GROUP = (label) => /ฟอยล์/.test(label ?? "");
const IS_BACK = (label) => /หลัง/.test(label ?? "");

/**
 * กลุ่ม "เลเยอร์ฟอยล์" ของด้านเดียวกับกลุ่มสีนี้ + ชื่อตัวเลือกที่แปลว่า 2 Layer
 * (สินค้าตั้งชื่อไม่เหมือนกัน: "เลเยอร์ฟอยล์ (ด้านหน้า)" · "เคลือบฟอยล์" · "เคลือบฟอยล์ (Add On)")
 */
const twoLayerCondFor = (groups, colorGroup) => {
  const back = IS_BACK(colorGroup.label);
  const cand = groups.filter(
    (g) =>
      g !== colorGroup &&
      IS_FOIL_GROUP(g.label) &&
      IS_BACK(g.label) === back &&
      (g.choices ?? []).some((c) => ruleOf(c.name)?.[1] === "layer2")
  );
  const g = cand[0];
  if (!g) return null;
  const names = (g.choices ?? []).filter((c) => ruleOf(c.name)?.[1] === "layer2").map((c) => c.name);
  return { label: g.label, choices: names };
};

/* ── กวาดทั้งร้าน ─────────────────────────────────────────────────── */

const { data: rows, error } = await sb.from("products").select("id,name,data");
if (error) die(error.message);

const edits = [];   // [{ id, name, data, hits: [[groupLabel, choiceName, note]] }]
const unknown = []; // ชื่อตัวเลือกในกลุ่มฟอยล์ที่ไม่เข้ากฎไหนเลย
const noPair = [];  // กลุ่มสีที่หากลุ่มเลเยอร์คู่ไม่เจอ (ไม่ตั้ง imageWhen ให้)

/** กลุ่มตัวเลือกของแถวนี้ — สินค้าปกติอยู่ใน data.options · คลังตัวเลือกกลาง (/admin/options) เป็นกลุ่มเดียวที่ data */
const groupsOf = (d, id) => (id.startsWith("__preset") ? [d] : d.options ?? []);

/** ตั้งภาพ (และภาพ 2 Layer) ให้ตัวเลือกหนึ่งตัว — คืน note ถ้ามีการแก้ */
const applyTo = (c, key, cond) => {
  const want = src(key);
  const alt = COLORS.includes(key) && cond ? [{ when: [cond], imageSrc: src(`${key}-2l`) }] : null;
  const same =
    c.imageSrc === want && JSON.stringify(c.imageWhen ?? null) === JSON.stringify(alt);
  if (same) return null;
  c.imageSrc = want;
  if (alt) c.imageWhen = alt;
  else delete c.imageWhen;
  return `foil-real/${key}-${REV}.jpg${alt ? `  (+2 Layer → ${key}-2l)` : ""}`;
};

for (const row of rows) {
  const d = structuredClone(row.data ?? {});
  const groups = groupsOf(d, row.id);
  const hits = [];
  for (const g of groups) {
    if (!IS_FOIL_GROUP(g.label)) continue;
    const isColorGroup = (g.choices ?? []).some((c) => COLORS.includes(ruleOf(c.name)?.[1]));
    const cond = isColorGroup ? twoLayerCondFor(groups, g) : null;
    if (isColorGroup && !cond) noPair.push(`${row.id} · [${g.label}]`);
    for (const c of g.choices ?? []) {
      const rule = ruleOf(c.name);
      if (!rule) {
        unknown.push(`${row.id} · [${g.label}] · "${c.name}"`);
        continue;
      }
      const key = rule[1];
      if (!key) continue; // ตัวเลือก "ไม่ปั๊มฟอยล์" — ปล่อยภาพเดิม
      const note = applyTo(c, key, cond);
      if (note) hits.push([g.label, c.name, note]);
    }
  }
  if (hits.length) edits.push({ id: row.id, name: row.name, data: d, hits });
}

if (unknown.length) die(`ตัวเลือกในกลุ่มฟอยล์ที่จับคู่ภาพไม่ได้ ${unknown.length} รายการ:\n   ` + unknown.join("\n   "));
if (noPair.length) {
  console.log("⚠️  กลุ่มสีฟอยล์ที่หากลุ่ม \"เลเยอร์\" คู่กันไม่เจอ — ใช้ภาพ 1 Layer อย่างเดียว:");
  for (const s of noPair) console.log("   " + s);
  console.log("");
}

let n = 0;
for (const e of edits) {
  console.log(`\n■ ${e.id} · ${e.name}${e.data.hidden ? " (ร่าง)" : ""}`);
  let last = "";
  for (const [label, name, note] of e.hits) {
    if (label !== last) console.log(`   [${label}]`);
    last = label;
    console.log(`     • ${name}  →  ${note}`);
    n++;
  }
}
console.log(`\nรวม ${edits.length} สินค้า · ${n} ตัวเลือก`);

if (!WRITE) {
  console.log("(ยังไม่เขียนฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}

/* ── อัปภาพ + บันทึก ─────────────────────────────────────────────── */

for (const k of KEYS) {
  const path = `products/foil-real/${k}-${REV}.jpg`;
  const { error: upErr } = await sb.storage
    .from("product-images")
    .upload(path, buf[k], { contentType: "image/jpeg", upsert: false });
  if (upErr && !/already exists|Duplicate/i.test(upErr.message)) die(upErr.message);
  console.log(`⬆️  foil-real/${k}-${REV}.jpg ${upErr ? "(มีอยู่แล้ว ใช้ของเดิม)" : "อัปแล้ว"}`);
}

for (const e of edits) {
  const { error: saveErr } = await sb.from("products").update({ data: e.data }).eq("id", e.id);
  if (saveErr) die(`${e.id}: ${saveErr.message}`);
  console.log(`💾 ${e.id}`);
}

/* ── อ่านกลับ + เปิดภาพจริงทุกใบ ─────────────────────────────────── */

const { data: back, error: backErr } = await sb.from("products").select("id,data");
if (backErr) die(backErr.message);
let checked = 0;
let withAlt = 0;
for (const row of back) {
  const groups = groupsOf(row.data ?? {}, row.id);
  for (const g of groups) {
    if (!IS_FOIL_GROUP(g.label)) continue;
    const isColorGroup = (g.choices ?? []).some((c) => COLORS.includes(ruleOf(c.name)?.[1]));
    const cond = isColorGroup ? twoLayerCondFor(groups, g) : null;
    for (const c of g.choices ?? []) {
      const key = ruleOf(c.name)?.[1];
      if (!key) continue;
      if (c.imageSrc !== src(key)) die(`${row.id} · ${g.label} · ${c.name}: อ่านกลับแล้วภาพไม่ตรง`);
      checked++;
      if (COLORS.includes(key) && cond) {
        const alt = c.imageWhen?.[0];
        if (alt?.imageSrc !== src(`${key}-2l`) || alt?.when?.[0]?.label !== cond.label)
          die(`${row.id} · ${g.label} · ${c.name}: อ่านกลับแล้วภาพ 2 Layer ไม่ตรง`);
        withAlt++;
      }
    }
  }
}
for (const k of KEYS) {
  const res = await fetch(src(k));
  console.log(`   ${res.ok ? "✓" : "✗"} HTTP ${res.status} foil-real/${k}-${REV}.jpg`);
  if (!res.ok) die("เปิดภาพไม่ได้ — ยังไม่เสร็จ");
}
console.log(
  `\n✅ บันทึกแล้ว · ยืนยันจากการอ่านกลับ ${checked} ตัวเลือก (มีภาพ 2 Layer ${withAlt} ตัว) และเปิดภาพครบ ${KEYS.length} ใบ`
);
