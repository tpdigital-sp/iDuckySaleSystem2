#!/usr/bin/env node
/**
 * กฎ "เนื้ออะคริลิคทึบ สกรีนได้เฉพาะด้านบน" — สินค้าอะคริลิคทุกตัวที่ลูกค้าเลือกเนื้อ/สีได้
 * ผู้ใช้สั่ง 26 ส.ค. 69:
 *
 *   • เนื้อโปร่ง (มองลายผ่านเนื้อได้): ใส · กลิตเตอร์-เงิน/ทอง/รุ้ง · hologram ทุกตัวยกเว้น hologram-01
 *     → เลือกงานสกรีนได้ครบ: 1 ด้าน (ใต้/บน) · 2 ด้าน (ใต้-บน / บน-บน) · 3 เลเยอร์ · 4 เลเยอร์
 *   • เนื้อทึบ (ลายใต้แผ่นมองไม่เห็น): ขาวขุ่น C-02 · ใสขุ่น C-01 · hologram-01 · กระจก · กากเพชร · อะคริลิคสีต่าง ๆ
 *     → เหลือ: สกรีน 1 ด้าน (บน) · สกรีน 2 ด้าน (บน-บน) เท่านั้น
 *
 * วิธีทำ: เพิ่ม rules ทิศเดียว "เนื้อ/เฉด → จำกัดงานสกรีน" (ตามแบบ acrylic-coaster ที่ถูกอยู่แล้ว)
 *   - กลุ่มประเภท (ใส/C-02/สีพิเศษ): เงื่อนไขยิงที่ C-02 อย่างเดียว (สีพิเศษไปตัดสินที่กลุ่มเฉด)
 *   - กลุ่มเฉดสี: เงื่อนไขยิงที่ทุกเฉดทึบในกลุ่ม
 *   ⚠️ ต้องคู่กับ allowedChoices ที่ข้ามกฎจากกลุ่มที่ถูกซ่อน (แก้ใน src/lib/products.ts แล้ว)
 *      ไม่งั้นค่า default ค้างของกลุ่มเฉดที่ซ่อนอยู่ (C-01 = ทึบ) จะตัดตัวเลือกทั้งที่ลูกค้าเลือก "ใส"
 *
 * พิเศษ: keyring-copy-copy ขยายกฎ "สกรีน 3 เลเยอร์ → ประเภทอะคริลิค" จาก [ใส] เป็น [ใส, สีพิเศษ]
 *   (ราค 3 เลเยอร์ มีเซลล์ครบทุกประเภทอยู่แล้ว · เฉดทึบโดนกฎใหม่กันไว้ให้)
 *
 * ที่ "ถูกอยู่แล้ว" ไม่แตะ: acrylic-coaster (กฎครบ) · สแตนดี้ฐานไฟ 1-3 (ซ่อนกลุ่มด้วย showWhen)
 * ที่ไม่เข้าข่าย: สินค้าที่ไม่มีตัวเลือกเนื้อ (ตัวงานใสอย่างเดียว) หรือไม่มีตัวเลือกด้านสกรีน
 *
 *   node scripts/acrylic-screen-by-material.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/acrylic-screen-by-material.mjs --write   # บันทึกจริง (รันซ้ำได้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

/* ── เนื้อโปร่ง/ทึบ ───────────────────────────────────────────────────────── */
/** เฉดที่มองลายผ่านเนื้อได้ (สกรีนใต้/หลายเลเยอร์ได้) — ที่เหลือถือว่าทึบทั้งหมด */
const isTransparent = (n) =>
  /^อะคริลิ(ค)?ใส$/.test(n) || // "อะคริลิคใส" (และตัวสะกด "อะคริลิใส" ของบางสินค้า)
  n.startsWith("อะคริลิคกลิตเตอร์-") || // กลิตเตอร์-เงิน/ทอง/รุ้ง (คนละตัวกับ "สีกากเพชร" ที่ทึบ)
  (n.startsWith("hologram-") && n !== "hologram-01");
/** ชื่อรวม ๆ อย่าง "สีพิเศษ (โฮโลแกรม/…)" ไม่ใช่เฉดจริง — ไปตัดสินที่กลุ่มเฉดแทน */
const isUmbrella = (n) => /พิเศษ/.test(n);
const opaqueNamesOf = (group) =>
  group.choices.map((c) => c.name).filter((n) => !isUmbrella(n) && !isTransparent(n));

/** ตัวเลือกสกรีนที่เนื้อทึบยังทำได้: บนผิวเท่านั้น (+ "ไม่สกรีน" ของ 3D Acrylic ชิ้นเสริม) */
const topOnlyOf = (screenGroup) =>
  screenGroup.choices.map((c) => c.name).filter((n) => /\(บน\)|\(บน-บน\)|ไม่สกรีน/.test(n));

/* ── สินค้าและกลุ่มที่เกี่ยว ───────────────────────────────────────────────── */
/**
 * typeLabel = กลุ่มประเภท (ใส/C-02/สีพิเศษ) → กฎยิงเฉพาะ C-02
 * autoShades = หากลุ่มเฉดเอง: ทุกกลุ่มที่ showWhen อ้าง typeLabel (เช่น "เลือกสีพิเศษ (ขนาด 15 ซม. …)")
 * shadeLabels = ระบุกลุ่มเฉดตรง ๆ (กลุ่มที่ไม่มี showWhen ให้ตามหา)
 * screens = กลุ่มงานสกรีนที่โดนจำกัด
 */
const PRODUCTS = [
  { id: "standy", screens: ["งานสกรีน"], typeLabel: "สีอะคริลิค", autoShades: true },
  {
    id: "keyring-copy-copy",
    screens: ["งานสกรีน"],
    typeLabel: "ประเภทอะคริลิค",
    autoShades: true, // "สีอะคริลิค" (โชว์เมื่อประเภท=สีพิเศษ)
    expand3Layer: { type: "ประเภทอะคริลิค", allow: ["อะคริลิคใส", "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)"] },
  },
  { id: "standee-frame-card", screens: ["งานสกรีน"], typeLabel: "สีอะคริลิค", autoShades: true },
  { id: "standee-clip", screens: ["งานสกรีน"], typeLabel: "สีอะคริลิค", autoShades: true },
  { id: "standee-keyring", screens: ["งานสกรีน"], typeLabel: "สีอะคริลิค", autoShades: true },
  {
    id: "keyring-clear-stopper",
    screens: ["งานสกรีน (แผ่นล่าง)"], // แผ่นบนเป็นอะคริลิคใสเสมอ ไม่ต้องจำกัด
    typeLabel: "สีอะคริลิค (แผ่นล่าง)",
    autoShades: true,
  },
  {
    // สแตนดี้อะคริลิค+จุกใส — โครงเดียวกับ keyring-clear-stopper (2 แผ่น) แต่มีฐาน
    // ฐานไม่มีตัวเลือกฝั่งสกรีน จึงไม่เข้าเงื่อนไขกฎนี้
    id: "new-mt1k6h3q-6601",
    screens: ["งานสกรีน (แผ่นล่าง)"],
    typeLabel: "สีอะคริลิค (แผ่นล่าง)",
    autoShades: true,
  },
  // carabiner/1-4: กลุ่มชาร์ตสี "สีอะคริลิค" เดิมโชว์ตลอด (ไม่มี showWhen) — ค่าเฉดทึบที่ค้าง
  // หลังลูกค้าสลับกลับมา "ใส" จะยังยิงกฎตัดงานสกรีนอยู่ → ติด showWhen ให้โชว์เฉพาะตอนเลือก
  // สีพิเศษ (แพตเทิร์นเดียวกับ keyring) แล้วกฎจากกลุ่มที่ซ่อนจะถูกข้ามเอง
  {
    id: "carabiner-acrylic",
    screens: ["สกรีน"],
    typeLabel: "ประเภทอะคริลิค",
    shadeLabels: ["สีอะคริลิค"],
    chartShowWhen: { shade: "สีอะคริลิค", type: "ประเภทอะคริลิค", choice: "สีพิเศษ" },
  },
  {
    id: "1-4",
    screens: ["งานสกรีน"],
    typeLabel: "สีอะคริลิค (เรทราคา)",
    shadeLabels: ["สีอะคริลิค"],
    chartShowWhen: { shade: "สีอะคริลิค", type: "สีอะคริลิค (เรทราคา)", choice: "อะคริลิคพิเศษ (โฮโลแกรม/กลิตเตอร์/สี)" },
  },
  // clipboard: กลุ่มสีเดียวจบ (ไม่มีกลุ่มประเภท) · จำกัดเฉพาะกลุ่ม "สกรีน" ขนาด A6 ที่แยกใต้/บน
  // (A5/A4 เป็นกลุ่มชื่อ "สกรีน " / "สกรีน  " มีแค่ 1 ด้าน/2 ด้าน ไม่ระบุฝั่ง — ไม่เกี่ยว)
  { id: "clipboard-acrylic", screens: ["สกรีน"], shadeLabels: ["สีอะคริลิค"] },
];

/** 3D Acrylic: เนื้อรายชิ้น → จำกัดสกรีนของชิ้นนั้น (คู่ขนาดต้องตรงกัน กันค่าค้างข้ามขนาด) */
const P3D = {
  id: "3d-acrylic",
  pairs: [
    { mats: ["ชนิดอะคริลิค (ชิ้นที่ 1)", "เลือกเฉดสีพิเศษ (ชิ้นที่ 1)"], screens: ["งานสกรีน (ชิ้นที่ 1)"] },
    { mats: ["ชนิดอะคริลิค (ชิ้นที่ 2)", "เลือกเฉดสีพิเศษ (ชิ้นที่ 2)"], screens: ["งานสกรีน (ชิ้นที่ 2)"] },
    {
      mats: ["ชนิดอะคริลิค (ชิ้นที่ 2) · ขนาด 6cm", "เลือกเฉดสีพิเศษ (ชิ้นที่ 2) · ขนาด 6cm"],
      screens: ["งานสกรีน (ชิ้นที่ 2) · ขนาด 6cm"],
    },
    {
      mats: ["ชนิดอะคริลิค (ชิ้นที่ 3)", "เลือกเฉดสีพิเศษ (ชิ้นที่ 3)"],
      screens: [
        "งานสกรีน (ชิ้นที่ 3)",
        "งานสกรีน (ชิ้นที่ 3) · ขนาด 3cm",
        "งานสกรีน (ชิ้นที่ 3) · ขนาด 4cm",
        "งานสกรีน (ชิ้นที่ 3) · ขนาด 5cm",
      ],
    },
    {
      mats: ["ชนิดอะคริลิค (ชิ้นที่ 3) · ขนาด 6cm", "เลือกเฉดสีพิเศษ (ชิ้นที่ 3) · ขนาด 6cm"],
      screens: ["งานสกรีน (ชิ้นที่ 3) · ขนาด 6cm"],
    },
    {
      mats: ["ชนิดอะคริลิค (ชิ้นที่ 4)", "เลือกเฉดสีพิเศษ (ชิ้นที่ 4)"],
      screens: [
        "งานสกรีน (ชิ้นที่ 4)",
        "งานสกรีน (ชิ้นที่ 4) · ขนาด 3cm",
        "งานสกรีน (ชิ้นที่ 4) · ขนาด 4cm",
        "งานสกรีน (ชิ้นที่ 4) · ขนาด 5cm",
      ],
    },
    {
      mats: ["ชนิดอะคริลิค (ชิ้นที่ 4) · ขนาด 6cm", "เลือกเฉดสีพิเศษ (ชิ้นที่ 4) · ขนาด 6cm"],
      screens: ["งานสกรีน (ชิ้นที่ 4) · ขนาด 6cm"],
    },
  ],
};

/* ── Supabase ─────────────────────────────────────────────────────────────── */
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

/* ── เครื่องมือ ────────────────────────────────────────────────────────────── */
const groupOf = (d, label) => (d.options ?? []).find((o) => o.label === label);
const mustGroup = (d, id, label) => {
  const g = groupOf(d, label);
  if (!g) throw new Error(`${id}: ไม่เจอกลุ่ม "${label}" — โครงสินค้าเปลี่ยน ตรวจก่อน`);
  return g;
};
const refsType = (g, typeLabel) =>
  [g.showWhen, g.showWhenAlso, ...(g.showWhenAll ?? [])].some((w) => w?.label === typeLabel);
const mkRule = (whenLabel, whenChoices, limitLabel, allow) => ({
  when: { label: whenLabel, choice: whenChoices[0], choices: whenChoices },
  limit: { label: limitLabel, allow },
});

/** จำลอง allowedChoices ฉบับใหม่ (ข้ามกฎจากกลุ่มที่ซ่อน) ไว้ตรวจผลก่อนบันทึก */
const visible = (d, g, sel) => {
  const pass = (w) => !w?.label || !w.choices?.length || (sel[w.label] && w.choices.includes(sel[w.label]));
  return pass(g.showWhen) && pass(g.showWhenAlso) && (g.showWhenAll ?? []).every(pass);
};
const allowedSim = (d, sel, label) => {
  const g = groupOf(d, label);
  let allowed = g.choices.map((c) => c.name);
  for (const r of d.rules ?? []) {
    if (r.limit.label !== label) continue;
    const wg = groupOf(d, r.when.label);
    if (wg && !visible(d, wg, sel)) continue;
    const cur = sel[r.when.label];
    if (!cur || !(r.when.choices?.length ? r.when.choices : [r.when.choice]).includes(cur)) continue;
    allowed = allowed.filter((n) => r.limit.allow.includes(n));
  }
  return allowed.length ? allowed : g.choices.map((c) => c.name);
};

/* ── ลุยทีละสินค้า ─────────────────────────────────────────────────────────── */
const ids = [...PRODUCTS.map((p) => p.id), P3D.id];
const { data: rows, error } = await sb.from("products").select("id,data").in("id", ids);
if (error) throw new Error(`อ่านสินค้าไม่สำเร็จ — ${error.message}`);
const byId = Object.fromEntries(rows.map((r) => [r.id, r.data]));
for (const id of ids) if (!byId[id]) throw new Error(`ไม่เจอสินค้า ${id}`);

const updates = [];

function applyRules(d, id, matPairs) {
  // matPairs: [{matLabel, whenChoices, screenLabels}]
  const owned = new Set(); // (whenLabel→limitLabel) ที่สคริปต์นี้ดูแล — ลบของเก่าก่อนใส่ใหม่ (รันซ้ำได้)
  for (const p of matPairs) for (const s of p.screenLabels) owned.add(`${p.matLabel}→${s}`);
  const before = JSON.stringify(d.rules ?? []);
  d.rules = (d.rules ?? []).filter((r) => !owned.has(`${r.when?.label}→${r.limit?.label}`));
  const added = [];
  for (const p of matPairs) {
    if (!p.whenChoices.length) continue;
    for (const s of p.screenLabels) {
      const sg = mustGroup(d, id, s);
      const allow = topOnlyOf(sg);
      if (allow.length < 1 || allow.length >= sg.choices.length)
        throw new Error(`${id}: กลุ่ม "${s}" กรองแล้วได้ ${allow.length}/${sg.choices.length} ตัว — ชื่อตัวเลือกไม่เข้าแพตเทิร์น ตรวจก่อน`);
      const r = mkRule(p.matLabel, p.whenChoices, s, allow);
      d.rules.push(r);
      added.push(r);
    }
  }
  return { added, changed: JSON.stringify(d.rules) !== before };
}

for (const cfg of PRODUCTS) {
  const d = structuredClone(byId[cfg.id]);
  const matPairs = [];

  if (cfg.typeLabel) {
    const tg = mustGroup(d, cfg.id, cfg.typeLabel);
    const opq = opaqueNamesOf(tg); // ปกติ = C-02 ตัวเดียว (ใส=โปร่ง · สีพิเศษ=ชื่อรวม ไปตัดสินที่เฉด)
    if (!opq.length) throw new Error(`${cfg.id}: กลุ่มประเภท "${cfg.typeLabel}" ไม่มีตัวทึบ (C-02) — ตรวจก่อน`);
    matPairs.push({ matLabel: cfg.typeLabel, whenChoices: opq, screenLabels: cfg.screens });
  }

  const shadeLabels = [...(cfg.shadeLabels ?? [])];
  if (cfg.autoShades) {
    for (const g of d.options ?? []) {
      if (g.label === cfg.typeLabel || shadeLabels.includes(g.label)) continue;
      if (!refsType(g, cfg.typeLabel)) continue;
      if (!(g.choices ?? []).some((c) => !isUmbrella(c.name) && !isTransparent(c.name))) continue;
      shadeLabels.push(g.label);
    }
    if (!shadeLabels.length) throw new Error(`${cfg.id}: หากลุ่มเฉดจาก "${cfg.typeLabel}" ไม่เจอเลย — ตรวจก่อน`);
  }
  for (const label of shadeLabels) {
    const g = mustGroup(d, cfg.id, label);
    matPairs.push({ matLabel: label, whenChoices: opaqueNamesOf(g), screenLabels: cfg.screens });
  }

  const { added } = applyRules(d, cfg.id, matPairs);

  // ติด showWhen ให้กลุ่มชาร์ตสีที่เดิมโชว์ตลอด (carabiner / 1-4)
  let noteShow = "";
  if (cfg.chartShowWhen) {
    const g = mustGroup(d, cfg.id, cfg.chartShowWhen.shade);
    const tg = mustGroup(d, cfg.id, cfg.chartShowWhen.type);
    if (!tg.choices.some((c) => c.name === cfg.chartShowWhen.choice))
      throw new Error(`${cfg.id}: กลุ่ม "${cfg.chartShowWhen.type}" ไม่มีตัวเลือก "${cfg.chartShowWhen.choice}" — ตรวจก่อน`);
    const want = { label: cfg.chartShowWhen.type, choices: [cfg.chartShowWhen.choice] };
    if (g.showWhen && JSON.stringify(g.showWhen) !== JSON.stringify(want))
      throw new Error(`${cfg.id}: "${g.label}" มี showWhen อื่นอยู่แล้ว (${JSON.stringify(g.showWhen)}) — ตรวจก่อน`);
    if (!g.showWhen) {
      g.showWhen = want;
      noteShow = ` · ติด showWhen "${g.label}" ← ${want.label}=${want.choices[0]}`;
    }
  }

  // keyring: เปิดสกรีน 3 เลเยอร์ ให้เนื้อโปร่งกลุ่มสีพิเศษ (กลิตเตอร์/hologram) ตามที่สั่ง
  let note3 = "";
  if (cfg.expand3Layer) {
    const r = (d.rules ?? []).find(
      (x) =>
        x.when?.label?.includes("สกรีน") &&
        (x.when.choices ?? [x.when.choice]).includes("สกรีน 3 เลเยอร์") &&
        x.limit?.label === cfg.expand3Layer.type
    );
    if (!r) throw new Error(`${cfg.id}: ไม่เจอกฎ "สกรีน 3 เลเยอร์ → ${cfg.expand3Layer.type}" — โครงเปลี่ยน ตรวจก่อน`);
    const beforeAllow = [...r.limit.allow];
    r.limit.allow = cfg.expand3Layer.allow;
    note3 = ` · กฎ 3 เลเยอร์: [${beforeAllow.join(", ")}] → [${r.limit.allow.join(", ")}]`;
  }

  console.log(`\n📦 ${cfg.id} — เพิ่มกฎ ${added.length} ข้อ${note3}${noteShow}`);
  for (const r of added)
    console.log(
      `   ${r.when.label} = ทึบ ${r.when.choices.length} ตัว → "${r.limit.label}" เหลือ [${r.limit.allow.join(" | ")}]`
    );
  updates.push({ id: cfg.id, d, cfg });
}

// 3D Acrylic — จับคู่รายชิ้น/ขนาด
{
  const d = structuredClone(byId[P3D.id]);
  const matPairs = [];
  for (const pair of P3D.pairs) {
    for (const m of pair.mats) {
      const g = mustGroup(d, P3D.id, m);
      matPairs.push({ matLabel: m, whenChoices: opaqueNamesOf(g), screenLabels: pair.screens });
    }
  }
  const { added } = applyRules(d, P3D.id, matPairs);
  console.log(`\n📦 ${P3D.id} — เพิ่มกฎ ${added.length} ข้อ`);
  for (const r of added)
    console.log(`   ${r.when.label} = ทึบ ${r.when.choices.length} ตัว → "${r.limit.label}" เหลือ [${r.limit.allow.join(" | ")}]`);
  updates.push({ id: P3D.id, d, cfg: { screens: P3D.pairs.flatMap((p) => p.screens) } });
}

/* ── ตรวจผลก่อนบันทึก ─────────────────────────────────────────────────────── */
console.log("\n🔍 ตรวจผล (จำลอง allowedChoices ฉบับข้ามกลุ่มซ่อน):");
let bad = 0;
const check = (id, d, sel, screenLabel, wantTopOnly, label) => {
  const got = allowedSim(d, sel, screenLabel);
  const sg = groupOf(d, screenLabel);
  const want = wantTopOnly ? topOnlyOf(sg) : sg.choices.map((c) => c.name);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`   ${ok ? "✅" : "❌"} ${id} · ${label} → [${got.join(" | ")}]`);
};
for (const { id, d, cfg } of updates) {
  if (id === "3d-acrylic") {
    const t = "ชนิดอะคริลิค (ชิ้นที่ 1)", s = "เลือกเฉดสีพิเศษ (ชิ้นที่ 1)", scr = "งานสกรีน (ชิ้นที่ 1)";
    const special = groupOf(d, t).choices.find((c) => isUmbrella(c.name)).name;
    check(id, d, { [t]: "อะคริลิคขาวขุ่น C-02" }, scr, true, "ชิ้น 1 = C-02");
    check(id, d, { [t]: special, [s]: "hologram-01" }, scr, true, "ชิ้น 1 = พิเศษ hologram-01");
    check(id, d, { [t]: special, [s]: "อะคริลิคกลิตเตอร์-เงิน" }, scr, false, "ชิ้น 1 = พิเศษ กลิตเตอร์-เงิน");
    check(id, d, { [t]: "อะคริลิคใส", [s]: "hologram-01" }, scr, false, "ชิ้น 1 = ใส (เฉดค้าง hologram-01)");
    continue;
  }
  const scr = cfg.screens[0];
  if (cfg.typeLabel) {
    const tg = groupOf(d, cfg.typeLabel);
    const c02 = tg.choices.map((c) => c.name).find((n) => n.includes("C-02"));
    const clear = tg.choices.map((c) => c.name).find((n) => isTransparent(n));
    const special = tg.choices.map((c) => c.name).find((n) => isUmbrella(n));
    check(id, d, { [cfg.typeLabel]: c02 }, scr, true, `${cfg.typeLabel} = C-02`);
    // เฉด: ใช้กลุ่มที่ระบุตรง ๆ ก่อน (กลุ่มรายขนาดต้องเซ็ตขนาดให้ตรง showWhen ด้วย)
    const shadeGroups = (d.options ?? []).filter(
      (g) => g.label !== cfg.typeLabel && refsType(g, cfg.typeLabel) && (g.choices ?? []).some((c) => !isUmbrella(c.name) && !isTransparent(c.name))
    );
    const sg = cfg.shadeLabels ? groupOf(d, cfg.shadeLabels[0]) : shadeGroups[0];
    if (sg && special) {
      const sel = { [cfg.typeLabel]: special };
      for (const w of [sg.showWhen, sg.showWhenAlso, ...(sg.showWhenAll ?? [])])
        if (w?.label && w.label !== cfg.typeLabel) sel[w.label] = w.choices[0];
      const opq = sg.choices.map((c) => c.name).find((n) => !isUmbrella(n) && !isTransparent(n));
      const trans = sg.choices.map((c) => c.name).find((n) => isTransparent(n));
      check(id, d, { ...sel, [sg.label]: opq }, scr, true, `เฉด "${opq}"`);
      if (trans) check(id, d, { ...sel, [sg.label]: trans }, scr, false, `เฉด "${trans}"`);
      if (clear) check(id, d, { [cfg.typeLabel]: clear, [sg.label]: opq }, scr, false, `เลือก "${clear}" (เฉดค้าง "${opq}")`);
    } else if (clear) {
      check(id, d, { [cfg.typeLabel]: clear }, scr, false, `${cfg.typeLabel} = ${clear}`);
    }
  } else {
    // clipboard: กลุ่มสีเดียว
    const sg = groupOf(d, cfg.shadeLabels[0]);
    check(id, d, { [sg.label]: "hologram-01", ขนาด: "ขนาด A6" }, scr, true, "สี hologram-01 (A6)");
    check(id, d, { [sg.label]: "อะคริลิคใส", ขนาด: "ขนาด A6" }, scr, false, "สี อะคริลิคใส (A6)");
  }
}
if (bad) throw new Error(`ผลตรวจไม่ผ่าน ${bad} ข้อ — ไม่บันทึก`);

// keyring 3 เลเยอร์: ประเภทต้องเหลือ [ใส, สีพิเศษ]
{
  const u = updates.find((x) => x.id === "keyring-copy-copy");
  const got = allowedSim(u.d, { งานสกรีน: "สกรีน 3 เลเยอร์" }, "ประเภทอะคริลิค");
  const ok = JSON.stringify(got) === JSON.stringify(["อะคริลิคใส", "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)"]);
  if (!ok) throw new Error(`keyring: 3 เลเยอร์ → ประเภทได้ [${got.join(", ")}] — ไม่ตรงที่ตั้งใจ`);
  console.log(`   ✅ keyring-copy-copy · 3 เลเยอร์ → ประเภท [${got.join(" | ")}]`);
}

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
for (const { id, d } of updates) {
  d.savedAt = new Date().toISOString();
  const { error: e } = await sb.from("products").update({ data: d }).eq("id", id);
  if (e) throw new Error(`บันทึก ${id} ไม่สำเร็จ — ${e.message}`);
  console.log(`✅ บันทึก ${id}`);
}
console.log("\n✅ ครบทุกตัว");
