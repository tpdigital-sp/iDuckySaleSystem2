#!/usr/bin/env node
/**
 * เพิ่มเมนู "เลือกเฉดสีพิเศษ" ให้ 2 สินค้า — standy (/products/สแตนดี้) + 3d-acrylic (/products/3D-Acrylic)
 *
 *   node scripts/special-shade-picker-fix.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/special-shade-picker-fix.mjs --write   # บันทึกจริง
 *
 * ปัญหา (ผู้ใช้แจ้ง 26 ส.ค. 69): กดการ์ด/เมนู "อะคริลิคพิเศษ / สีพิเศษ" แล้วไม่มีเฉดสีให้เลือกต่อ
 * ให้ใช้ตรรกะเดียวกับพวงกุญแจอะคริลิค (keyring-copy-copy): เลือกชนิดก่อน → เฉด 44 สีโผล่เฉพาะตอนเลือกพิเศษ
 *
 * ราคาไม่ต้องแตะ — ค่าอะคริลิคพิเศษคิดอยู่แล้ว:
 *   • standy: "สีอะคริลิค" เป็นแกนตารางราคา (สีพิเศษแพงกว่าใสตามขนาด/เรทในเซลล์อยู่แล้ว)
 *   • 3d-acrylic: ชิ้นที่ 1 อยู่ในแกนตาราง · ชิ้นที่ 2-4 มี extra 5/8 บนตัวเลือกชนิดอยู่แล้ว
 * กลุ่มเฉดที่เพิ่มจึงเป็น 0฿ ทุกเฉด (โน้ตบอกลูกค้าตรง ๆ ว่าราคาเท่ากันทุกเฉด)
 *
 * เฉด 44 สี (ชื่อ+รูป) โคลนจากกลุ่ม "เลือกสีพิเศษของฐาน (ขนาดฐาน 2 ซม. …)" ของ standy เอง
 * (ชุดเดียวกับ standee-keyring / keyring) แล้วถอด field ค่าธรรมเนียมทิ้งให้เหลือ name+imageSrc
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const STANDY_SPECIAL = "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)";
const P3D_SPECIAL = "อะคริลิคพิเศษ (สี / โฮโลแกรม / กลิตเตอร์)";
const SHADE_NOTE = "44 เฉด ราคาเท่ากันทุกเฉด";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const load = async (id) => {
  const { data, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error) throw new Error(`อ่าน ${id} ไม่สำเร็จ — ${error.message}`);
  return structuredClone(data.data);
};
const optOf = (d, label) => d.options.find((o) => o.label === label);
const insertAfter = (d, afterLabel, group) => {
  const i = d.options.findIndex((o) => o.label === afterLabel);
  if (i < 0) throw new Error(`หา "${afterLabel}" ไม่เจอ จะแทรกต่อท้ายไม่ได้`);
  d.options.splice(i + 1, 0, group);
};

const standy = await load("standy");
const p3d = await load("3d-acrylic");

/* ── เฉด 44 สี: โคลนจากกลุ่มฐานของ standy แล้วเหลือแค่ name+imageSrc (0฿) ── */
const shadeSrc = standy.options.find((o) => o.label.startsWith("เลือกสีพิเศษของฐาน (ขนาดฐาน 2 ซม."));
if (!shadeSrc) throw new Error("ไม่เจอกลุ่มเฉดฐาน 2 ซม. ใน standy (ต้นทางชุด 44 สี)");
const SHADES = shadeSrc.choices.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}) }));
if (SHADES.length !== 44) throw new Error(`ชุดเฉดต้องมี 44 สี แต่ได้ ${SHADES.length}`);
if (SHADES.some((c) => /^อะคริลิคใส$|C-02/.test(c.name))) throw new Error("ชุดเฉดมี ใส/C-02 ปนมา — ผิดชุด");
const noImg = SHADES.filter((c) => !c.imageSrc).length;
console.log(`🎨 ชุดเฉด 44 สีพร้อม (ไม่มีรูป ${noImg} เฉด) เริ่ม: ${SHADES.slice(0, 3).map((c) => c.name).join(" · ")} …`);

const mkShadeGroup = (label, showWhen, showWhenAlso) => ({
  label,
  display: "dropdown",
  note: SHADE_NOTE,
  showWhen: structuredClone(showWhen),
  ...(showWhenAlso ? { showWhenAlso: structuredClone(showWhenAlso) } : {}),
  choices: structuredClone(SHADES),
});

/* ═══ standy: ตัวสแตนดี้ — เฉดโผล่เมื่อ สีอะคริลิค = สีพิเศษ ═══ */
{
  const LABEL = "เลือกเฉดสีพิเศษ (ตัวสแตนดี้)";
  if (optOf(standy, LABEL)) throw new Error(`standy มี "${LABEL}" อยู่แล้ว — ไม่ต้องรันซ้ำ`);
  const body = optOf(standy, "สีอะคริลิค");
  if (!body) throw new Error("standy ไม่มีกลุ่ม สีอะคริลิค");
  const special = body.choices.find((c) => c.name === STANDY_SPECIAL);
  if (!special) throw new Error(`standy: ไม่เจอตัวเลือก "${STANDY_SPECIAL}" ในกลุ่ม สีอะคริลิค`);

  // เช็คว่าแกนตารางคิดค่าสีพิเศษจริง (กัน driver trap — ชื่อในเซลล์ต้องตรงกับตัวเลือก)
  let specialCells = 0;
  for (const r of standy.priceRates ?? [])
    specialCells += Object.keys(r.pricing?.cells ?? {}).filter((k) => k.split("│")[2] === STANDY_SPECIAL).length;
  if (!specialCells) throw new Error("standy: ตารางราคาไม่มีช่องของสีพิเศษ — ชื่อไม่ตรงกัน ห้ามไปต่อ");
  console.log(`📦 standy: ช่องราคาสีพิเศษในตาราง ${specialCells} ช่อง ✓`);

  special.desc =
    "กลิตเตอร์ · โฮโลแกรม · กระจก · อะคริลิคสีทึบ รวม 44 เฉด (เลือกเฉดได้หลังกดแบบนี้) — บวกเพิ่มจากอะคริลิคใสตามขนาดตัวและเรทที่สั่ง (ดูตารางราคา)";
  const g = mkShadeGroup(LABEL, { label: "สีอะคริลิค", choices: [STANDY_SPECIAL] });
  g.note = `${SHADE_NOTE} — ค่าอะคริลิคพิเศษของตัวสแตนดี้รวมอยู่ในตารางราคาแล้ว`;
  insertAfter(standy, "สีอะคริลิค", g);
  console.log(`   + "${LABEL}" (44 เฉด · โผล่เมื่อ สีอะคริลิค = สีพิเศษ) แทรกหลังกลุ่ม สีอะคริลิค`);
}

/* ═══ 3d-acrylic: ทุกกลุ่ม "ชนิดอะคริลิค …" (7 กลุ่ม) ได้เมนูเฉดคู่กัน ═══ */
{
  const typeGroups = p3d.options.filter((o) => o.label.startsWith("ชนิดอะคริลิค"));
  if (typeGroups.length !== 7)
    throw new Error(`3d-acrylic: คาดว่ามีกลุ่มชนิดอะคริลิค 7 กลุ่ม แต่เจอ ${typeGroups.length}`);
  for (const tg of typeGroups) {
    const special = tg.choices.find((c) => c.name === P3D_SPECIAL);
    if (!special) throw new Error(`3d-acrylic: กลุ่ม "${tg.label}" ไม่มีตัวเลือก "${P3D_SPECIAL}"`);
    const shadeLabel = tg.label.replace("ชนิดอะคริลิค", "เลือกเฉดสีพิเศษ");
    if (optOf(p3d, shadeLabel)) throw new Error(`3d-acrylic มี "${shadeLabel}" อยู่แล้ว — ไม่ต้องรันซ้ำ`);

    // เงื่อนไขโชว์: ตามขนาดชิ้นเดียวกับกลุ่มชนิด (ถ้ามี) และ ชนิด = อะคริลิคพิเศษ
    const typeCond = { label: tg.label, choices: [P3D_SPECIAL] };
    const g = tg.showWhen
      ? mkShadeGroup(shadeLabel, tg.showWhen, typeCond)
      : mkShadeGroup(shadeLabel, typeCond);
    g.note = `${SHADE_NOTE} — ค่าอะคริลิคพิเศษของชิ้นนี้คิดแล้วตอนเลือกชนิด`;
    insertAfter(p3d, tg.label, g);
    const cond = tg.showWhen
      ? `${tg.showWhen.label}=${tg.showWhen.choices.join("/")} และ ${tg.label}=พิเศษ`
      : `${tg.label}=พิเศษ`;
    console.log(`📦 3d-acrylic: + "${shadeLabel}" (โผล่เมื่อ ${cond})`);
  }
}

/* ── ตรวจก่อนเขียน: เงื่อนไขทุกกลุ่มใหม่ชี้กลุ่ม/ตัวเลือกที่มีจริง + ไม่มี label ซ้ำ ── */
for (const [id, d] of [["standy", standy], ["3d-acrylic", p3d]]) {
  const labels = d.options.map((o) => o.label);
  const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (dup.length) throw new Error(`${id}: label ซ้ำ — ${dup.join(", ")}`);
  for (const o of d.options) {
    for (const cond of [o.showWhen, o.showWhenAlso].filter(Boolean)) {
      const target = optOf(d, cond.label);
      if (!target) throw new Error(`${id}: "${o.label}" ชี้กลุ่ม "${cond.label}" ที่ไม่มีจริง`);
      const names = target.choices.map((c) => c.name);
      const miss = cond.choices.filter((c) => !names.includes(c));
      if (miss.length) throw new Error(`${id}: "${o.label}" ชี้ตัวเลือกที่ไม่มีจริง — ${miss.join(", ")}`);
    }
  }
  // แกนตารางราคาไม่ถูกแตะ
  for (const r of d.priceRates ?? [])
    for (const lb of r.pricing?.driverLabels ?? [])
      if (!optOf(d, lb)) throw new Error(`${id}: driver "${lb}" หายจาก options — ห้ามเกิด`);
  const added = d.options.filter((o) => o.label.startsWith("เลือกเฉดสีพิเศษ")).length;
  console.log(`✅ ${id}: ตรวจผ่าน (กลุ่มเฉดใหม่ ${added} กลุ่ม · options รวม ${d.options.length})`);
}

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — เติม --write เพื่อบันทึกจริง)");
  process.exit(0);
}
for (const [id, d] of [["standy", standy], ["3d-acrylic", p3d]]) {
  const up = await sb.from("products").update({ data: d }).eq("id", id);
  if (up.error) throw new Error(`เขียน ${id} ไม่สำเร็จ — ${up.error.message}`);
  console.log(`💾 บันทึก ${id} แล้ว`);
}
