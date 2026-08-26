#!/usr/bin/env node
/**
 * Acrylic Kit (new-mt2rpb1j-2194) — ของเสริม 4 อย่างตามที่ผู้ใช้สั่ง 26 ส.ค. 69
 *
 *   node scripts/acrylic-kit-addons.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/acrylic-kit-addons.mjs --write   # บันทึกจริง
 *
 * 1) กลุ่ม "ฐานรูเสียบสแตนดี้" (สวิตช์เปิด-ปิด) — 1-2 รู +20 · เพิ่มรูละ 10 · สูงสุด 5 รู
 *    ⚠️ 25 ส.ค. 69 เคยถอดกลุ่มนี้ออกตามคำสั่งผู้ใช้ (ให้เป็นหมายเหตุแทน) — 26 ส.ค. 69 ผู้ใช้สั่งเอากลับมา
 * 2) ชุดตะขอ/ห่วง ตรรกะเดียวกับสินค้าพวงกุญแจ (คัดจาก Shake Shake เหมือน acrylic-prakob)
 *    ต่างตรงกลุ่ม "ตะขอ" เป็นแบบติ๊กระบุจำนวนต่อชุดได้ ("ตะขอ F สีเงิน 3 ชิ้น")
 *    → ปลดลิงก์คลัง preset-3 เพราะช่องจำนวนตั้งรายตัวเลือก แต่ resolveOptions เอา choices จากคลังมาทับ
 *      (ดึงรายการสดจากคลังตอนรัน จะได้ไม่ค้างสำเนาเก่า) · กลุ่ม "สีตะขอ *" ยังลิงก์คลังตามเดิม
 *      และตั้ง qtyFrom: "ตะขอ" ให้ค่าสีคูณตามจำนวนตะขอที่สั่ง
 * 3) แม่เหล็ก — ใส่สวิตช์เปิด-ปิด + note ให้แจ้งตำแหน่งที่จะติดในหมายเหตุถึงร้าน
 * 4) กลุ่ม "เพิ่มจำนวนชิ้นงาน (เกิน 5 ชิ้นต่อกรอบ)" (สวิตช์เปิด-ปิด) — askPrice ให้แอดมินตีราคา
 *    (คิดจากชิ้นที่ใหญ่ที่สุด เซนละ 10 บาท)
 *
 * รันซ้ำได้ — เขียนทับกลุ่ม/ข้อความเดิมด้วยค่าล่าสุดของสคริปต์เสมอ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const TGT_ID = "new-mt2rpb1j-2194"; // Acrylic Kit
const SRC_ID = "new-mt2rp5i3-9488"; // Shake Shake Acrylic — ต้นแบบชุดตะขอฉบับที่ไม่ผูกความหนาอะคริลิค
const HOOK_TAB = "ตะขอ / ห่วง";

const HOOK_GROUPS = [
  "รับตะขอไหม",
  "ตะขอ",
  "สีตะขอ AA",
  "สีตะขอ AB",
  "สีตะขอ C (โซ่ไข่ปลา)",
  "สีตะขอ G",
  "สีตะขอ H",
  "สีตะขอ I",
  "สีตะขอ R (โลหะ)",
  "สีตะขอ · เงิน/ทอง (D/X)",
  "สีตะขอ S",
  "สีตะขอ T",
  "สีตะขอ U",
  "สีตะขอ W",
  "สีตะขอ · โลหะ (F/J/K/L/M/N/O)",
];

const HOLE_LABEL = "ฐานรูเสียบสแตนดี้";
const PIECES_LABEL = "เพิ่มจำนวนชิ้นงาน (เกิน 5 ชิ้นต่อกรอบ)";
const MAGNET_LABEL = "แม่เหล็ก (Acrylic Kit Magnet)";

/** 🕳 ฐานรูเสียบสแตนดี้ — บันไดค่าทำพิเศษตามจำนวนรู (1-2 รู 20 บาท · รูถัดไป +10) */
const HOLE_GROUP = {
  label: HOLE_LABEL,
  collapsible: true,
  note:
    "ทำเป็นชุดสแตนดี้ได้ — เจาะรูที่ฐานให้ชิ้นงานเสียบตั้งโชว์ · ค่าทำพิเศษ 1-2 รูเสียบ 20 บาท/ชุด " +
    "รูถัดไปเพิ่มรูละ 10 บาท **สูงสุดไม่เกิน 5 รูเสียบ** · ระบุว่าจะเสียบชิ้นไหนตรงไหนในช่องหมายเหตุถึงร้าน",
  choices: [
    { name: "ไม่ทำฐานรูเสียบ" },
    { name: "1-2 รูเสียบ", extra: 20 },
    { name: "3 รูเสียบ", extra: 30 },
    { name: "4 รูเสียบ", extra: 40 },
    { name: "5 รูเสียบ", extra: 50, badge: "สูงสุด" },
  ],
};

/** ➕ ชิ้นงานเกิน 5 ชิ้นต่อกรอบ — เกินโครงราคาปกติ ให้แอดมินตีราคาให้ */
const PIECES_GROUP = {
  label: PIECES_LABEL,
  collapsible: true,
  display: "multi",
  note:
    "1 กรอบมีชิ้นงานได้ไม่เกิน 5 ชิ้น — อยากได้มากกว่านั้นเปิดสวิตช์แล้วระบุว่าเพิ่มกี่ชิ้น · " +
    "**ราคาส่วนที่เพิ่มแอดมินตีให้** คิดจากชิ้นที่ใหญ่ที่สุด เซนติเมตรละ 10 บาท (กดสั่งไว้ก่อนได้ ยอดอัปเดตหลังแอดมินตีราคา)",
  choices: [
    { name: "เพิ่มชิ้นงานจาก 5 ชิ้น", qty: true, qtyUnit: "ชิ้น", qtyMax: 20, askPrice: true },
  ],
};

/** 🧲 แม่เหล็ก — ของเดิม (จุดละ 8 บาท) ใส่สวิตช์เปิด-ปิด + ข้อความให้แจ้งตำแหน่ง */
const MAGNET_NOTE =
  "ติดแม่เหล็กเฉพาะจุดที่ต้องการ (แม่เหล็กขนาด 3 มม.) จุดละ 8 บาท — ติ๊กแล้วระบุจำนวนจุดต่อ 1 ชุด · " +
  "**แจ้งตำแหน่งที่จะติดแม่เหล็กในช่องหมายเหตุถึงร้านด้วย** · จุดที่ติดต้องมีขนาดมากกว่า 1 ซม. อาจเห็นคราบกาวจากแม่เหล็ก";

/** 🪝 note ของกลุ่ม "ตะขอ" ฉบับ Acrylic Kit — ต่างจากพวงกุญแจตรงที่ระบุจำนวนต่อชุดได้ */
const HOOK_NOTE =
  "ติ๊กแบบที่ต้องการแล้วระบุจำนวนตะขอต่อ 1 ชุด เช่น ตะขอ F สีเงิน 3 ชิ้น — ติ๊กหลายแบบพร้อมกันก็ได้ · " +
  "ดูรูปอะไหล่ทั้งหมดในแท็บ “ตะขอ / ห่วง” ท้ายหน้า";

/** ข้อความในหน้าสินค้าที่ต้องตามให้ตรงของเสริมชุดใหม่ — [เดิม, ใหม่] (มีตัวใหม่อยู่แล้ว = ข้าม) */
const TEXT_FIXES = [
  [
    "*ไม่มีขั้นต่ำในการสั่งผลิต — ราคาต่อชุด · ชิ้นงานไม่เกิน 5 ชิ้น/ชุด (ต้องการเพิ่มชิ้น คิดราคาตามขนาด/ชิ้น แจ้งแอดมิน)",
    "*ไม่มีขั้นต่ำในการสั่งผลิต — ราคาต่อชุด · ชิ้นงานไม่เกิน 5 ชิ้น/ชุด (ต้องการเพิ่มชิ้น เปิดสวิตช์ “เพิ่มจำนวนชิ้นงาน” ในหน้าสินค้า — แอดมินตีราคาให้ คิดจากชิ้นที่ใหญ่ที่สุด เซนติเมตรละ 10 บาท)",
  ],
  [
    "*งานสแตนดี้รูเสียบ: 1-2 รูเสียบ ค่าทำพิเศษ +20 บาท/ชุด · มากกว่านั้นเพิ่มรูละ 10 บาท · สูงสุดไม่เกิน 5 รูเสียบ — แจ้งในหมายเหตุถึงร้าน",
    "*ฐานรูเสียบสแตนดี้: 1-2 รูเสียบ ค่าทำพิเศษ +20 บาท/ชุด · มากกว่านั้นเพิ่มรูละ 10 บาท · สูงสุดไม่เกิน 5 รูเสียบ — เลือกได้ในหน้าสินค้า แล้วแจ้งตำแหน่งรูในหมายเหตุถึงร้าน",
  ],
  [
    "*ติดแม่เหล็ก (ขนาด 3 มม.) เลือกได้ในหน้าสินค้า บวกเพิ่มจุดละ 8 บาท — จุดที่จะติดแม่เหล็กต้องมีขนาดมากกว่า 1 ซม. อาจเห็นคราบกาวจากแม่เหล็กที่ติดกับตัวงาน",
    "*ติดแม่เหล็ก (ขนาด 3 มม.) เปิดสวิตช์เลือกได้ในหน้าสินค้า บวกเพิ่มจุดละ 8 บาท — แจ้งตำแหน่งที่จะติดแม่เหล็กในหมายเหตุถึงร้านด้วย · จุดที่ติดต้องมีขนาดมากกว่า 1 ซม. อาจเห็นคราบกาวจากแม่เหล็กที่ติดกับตัวงาน",
  ],
  [
    "*หากต้องการอะไหล่พวงกุญแจ รบกวนแจ้งในหมายเหตุถึงร้าน",
    "*อะไหล่ตะขอ/ห่วง เลือกแบบและสีได้กว่า 30 แบบในหน้าสินค้า ระบุจำนวนชิ้นต่อชุดได้ (ห่วง Z1 / โซ่ Z2 สีเงินแถมฟรี · ช่วง 1-10 ชุด คิดเหมาชิ้นละ 10 บาท · 11 ชุดขึ้นไปคิดตามอะไหล่)",
  ],
  [
    "• ทำเป็นชุดสแตนดี้รูเสียบได้ (1-2 รู +20 บาท · เพิ่มรูละ 10 · สูงสุด 5 รู) หรือใส่อะไหล่พวงกุญแจได้ — แจ้งในหมายเหตุถึงร้าน",
    "• ทำเป็นชุดสแตนดี้ได้ — เลือกฐานรูเสียบในหน้าสินค้า (1-2 รู +20 บาท · เพิ่มรูละ 10 · สูงสุด 5 รู) แล้วแจ้งตำแหน่งรูในหมายเหตุถึงร้าน",
  ],
  [
    "• ติดแม่เหล็กเฉพาะจุด (Acrylic Kit Magnet) ได้ — แม่เหล็กขนาด 3 มม. บวกเพิ่มจุดละ 8 บาท เลือกและระบุจำนวนจุดได้ในหน้าสินค้า · จุดที่จะติดแม่เหล็กต้องมีขนาดมากกว่า 1 ซม. · อาจเห็นคราบกาวจากแม่เหล็กที่ติดกับตัวงาน",
    "• ติดแม่เหล็กเฉพาะจุด (Acrylic Kit Magnet) ได้ — แม่เหล็กขนาด 3 มม. บวกเพิ่มจุดละ 8 บาท เปิดสวิตช์แล้วระบุจำนวนจุดได้ในหน้าสินค้า · แจ้งตำแหน่งที่จะติดในหมายเหตุถึงร้าน · จุดที่ติดต้องมีขนาดมากกว่า 1 ซม. · อาจเห็นคราบกาวจากแม่เหล็กที่ติดกับตัวงาน\n• ใส่อะไหล่ตะขอ/ห่วงได้กว่า 30 แบบ เลือกแบบ+สี และระบุจำนวนชิ้นต่อชุดได้ (ห่วง Z1 / โซ่ Z2 สีเงินแถมฟรี)",
  ],
  [
    "• เลือกขนาด จำนวนชุด และติดแม่เหล็ก (ถ้าต้องการ) แล้วแนบภาพลาย",
    "• เลือกขนาด จำนวนชุด และของเสริมที่ต้องการ (ฐานรูเสียบ · แม่เหล็ก · ตะขอ/ห่วง · เพิ่มจำนวนชิ้นงาน) แล้วแนบภาพลาย",
  ],
  [
    "• ระบุรายละเอียดเพิ่มเติมในช่อง \"หมายเหตุถึงร้าน\" เช่น รูเสียบสแตนดี้ · อะไหล่พวงกุญแจ · สกรีนกรอบ · ตำแหน่งติดแม่เหล็ก · วันที่ต้องการใช้งาน",
    "• ระบุรายละเอียดเพิ่มเติมในช่อง \"หมายเหตุถึงร้าน\" เช่น ตำแหน่งรูเสียบ · ตำแหน่งติดแม่เหล็ก · สกรีนกรอบ · วันที่ต้องการใช้งาน",
  ],
  [
    "ทำเป็นชุดสแตนดี้รูเสียบ ติดแม่เหล็ก (Acrylic Kit Magnet จุดละ 8 บาท) หรือใส่อะไหล่พวงกุญแจได้",
    "เลือกฐานรูเสียบสแตนดี้ (+20 บาท) ติดแม่เหล็ก (Acrylic Kit Magnet จุดละ 8 บาท) หรือใส่ตะขอ/ห่วงกว่า 30 แบบได้",
  ],
  [
    "ชิ้นงานไม่เกิน 5 ชิ้น/ชุด ถอดประกอบ-แต่งตัวได้ · ทำสแตนดี้รูเสียบ (+20 บาท) · ติดแม่เหล็ก 3 มม. (จุดละ 8 บาท) หรือใส่อะไหล่พวงกุญแจได้",
    "ชิ้นงานไม่เกิน 5 ชิ้น/ชุด ถอดประกอบ-แต่งตัวได้ · ฐานรูเสียบสแตนดี้ (+20 บาท) · ติดแม่เหล็ก 3 มม. (จุดละ 8 บาท) · ตะขอ/ห่วงกว่า 30 แบบ ระบุจำนวนต่อชุดได้",
  ],
];

// ── เชื่อม Supabase ──────────────────────────────────────────────────────────
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

const [{ data: tgt, error: e1 }, { data: src, error: e2 }, { data: presetRows, error: e3 }] = await Promise.all([
  sb.from("products").select("id,data").eq("id", TGT_ID).single(),
  sb.from("products").select("id,data").eq("id", SRC_ID).single(),
  sb.from("products").select("data").eq("category", "__presets__"),
]);
if (e1) throw new Error(`อ่านสินค้าเป้าหมายไม่ได้ — ${e1.message}`);
if (e2) throw new Error(`อ่านต้นแบบชุดตะขอไม่ได้ — ${e2.message}`);
if (e3) throw new Error(`อ่านคลังตัวเลือกไม่ได้ — ${e3.message}`);
const presets = (presetRows ?? []).map((r) => r.data).filter((p) => p?.id);

const missing = HOOK_GROUPS.filter((g) => !(src.data.options ?? []).some((o) => o.label === g));
if (missing.length) throw new Error(`ต้นแบบไม่มีกลุ่ม: ${missing.join(", ")} — โครง Shake Shake เปลี่ยน ตรวจก่อน`);
const srcTab = (src.data.tabs ?? []).find((t) => t.title === HOOK_TAB);
if (!srcTab) throw new Error(`ต้นแบบไม่มีแท็บ "${HOOK_TAB}" — ตรวจก่อน`);

const d = structuredClone(tgt.data);
const log = [];

// ── 1) ชุดตะขอ ───────────────────────────────────────────────────────────────
const hookOptions = HOOK_GROUPS.map((label) => {
  const o = structuredClone(src.data.options.find((x) => x.label === label));
  if (label === "ตะขอ") {
    // ช่องจำนวนตั้งรายตัวเลือก แต่กลุ่มที่ลิงก์คลังจะโดน choices ของคลังทับตอนแสดงผล
    // → ปลดลิงก์ แล้วดึงรายการสดจากคลังมาเก็บเป็นของสินค้านี้เอง
    const preset = o.presetId ? presets.find((p) => p.id === o.presetId) : null;
    if (preset?.choices?.length) o.choices = structuredClone(preset.choices);
    delete o.presetId;
    o.display = "multi";
    o.note = HOOK_NOTE;
    o.choices = o.choices.map((c) => ({ ...c, qty: true, qtyUnit: "ชิ้น", qtyMax: 20 }));
  } else if (label === "รับตะขอไหม") {
    // ตะขอของ Acrylic Kit เป็นของเสริม (ไม่ใช่ของที่ต้องมีเหมือนพวงกุญแจ) → เริ่มที่ "ไม่รับตะขอ"
    // เรียงตัวเลือกใหม่เท่านั้น กติกา freeWhen/showWhen ยังอ้าง "รับตะขอ" ตามเดิม
    o.choices = [
      ...o.choices.filter((c) => c.name === "ไม่รับตะขอ"),
      ...o.choices.filter((c) => c.name !== "ไม่รับตะขอ"),
    ];
  } else {
    // กลุ่มสี: ค่าสีคิดต่อตะขอ 1 ชิ้น → คูณตามจำนวนตะขอที่ติ๊กไว้ในกลุ่ม "ตะขอ"
    o.qtyFrom = "ตะขอ";
  }
  return o;
});
log.push(`ชุดตะขอ ${hookOptions.length} กลุ่ม (ตะขอ = ติ๊กระบุจำนวน ${hookOptions[1].choices.length} แบบ · สีคูณจำนวนด้วย qtyFrom)`);

// ── 2) ประกอบลำดับกลุ่มใหม่ทั้งชุด (รันซ้ำ = ทับของเดิม) ────────────────────────
const magnet = structuredClone(d.options.find((o) => o.label === MAGNET_LABEL));
if (!magnet) throw new Error(`สินค้าไม่มีกลุ่ม "${MAGNET_LABEL}" — โครงเปลี่ยน ตรวจก่อน`);
magnet.collapsible = true;
magnet.note = MAGNET_NOTE;
log.push(`แม่เหล็ก — ใส่สวิตช์เปิด-ปิด + แจ้งตำแหน่งในหมายเหตุ`);

const known = new Set([MAGNET_LABEL, HOLE_LABEL, PIECES_LABEL, ...HOOK_GROUPS]);
const keep = d.options.filter((o) => !known.has(o.label)); // "ขนาด" และกลุ่มอื่นที่มีอยู่เดิม
d.options = [...keep, structuredClone(PIECES_GROUP), structuredClone(HOLE_GROUP), magnet, ...hookOptions];
log.push(`ลำดับกลุ่ม: ${d.options.map((o) => o.label).join(" · ")}`);

// ── 3) แท็บ "ตะขอ / ห่วง" (แผ่นอะไหล่รวม + ชาร์ตสี) ใช้ภาพร่วมกับ Shake Shake ──
const tab = structuredClone(srcTab);
// Acrylic Kit ขายเป็น "ชุด" เหมือน Shake Shake (ไม่ต้องแก้หน่วยแบบ acrylic-prakob)
// ต่างตรงที่นี่ระบุจำนวนตะขอต่อชุดได้ ค่าเหมาจึงคิดต่อตะขอ 1 ชิ้น ไม่ใช่ต่อชุด
const HOOK_TAB_OLD =
  "• ตะขอ/ห่วงแบบอื่น ช่วง 1-10 ชุด คิดเหมา 10 บาท/ชุด · สั่ง 11 ชุดขึ้นไปคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น) — ระบบบวกให้อัตโนมัติเมื่อเลือก";
const HOOK_TAB_NEW =
  "• ตะขอ/ห่วงแบบอื่น ช่วง 1-10 ชุด คิดเหมาชิ้นละ 10 บาท · สั่ง 11 ชุดขึ้นไปคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น) — ระบุจำนวนตะขอต่อ 1 ชุดได้ ระบบคูณให้อัตโนมัติ";
if (!tab.text.includes(HOOK_TAB_NEW)) {
  if (!tab.text.includes(HOOK_TAB_OLD)) console.log("   ⚠️ แท็บตะขอ: ไม่เจอบรรทัดค่าเหมา — ข้อความต้นแบบเปลี่ยน");
  tab.text = tab.text.replace(HOOK_TAB_OLD, HOOK_TAB_NEW);
}
d.tabs = (d.tabs ?? []).filter((t) => t.title !== HOOK_TAB);
d.tabs.splice(1, 0, tab);
log.push(`แท็บ "${tab.title}" (ภาพ ${tab.images?.length ?? 0})`);

// ── 4) ข้อความในหน้าให้ตรงของเสริมชุดใหม่ ───────────────────────────────────────
let fixed = 0;
const patchText = (s) => {
  if (typeof s !== "string") return s;
  let out = s;
  for (const [oldTxt, newTxt] of TEXT_FIXES) {
    if (out.includes(newTxt)) continue;
    if (out.includes(oldTxt)) {
      out = out.replaceAll(oldTxt, newTxt);
      fixed++;
    }
  }
  return out;
};
d.description = patchText(d.description);
d.terms = patchText(d.terms);
d.highlights = (d.highlights ?? []).map(patchText);
d.tabs = d.tabs.map((t) => ({ ...t, text: patchText(t.text) }));
d.body = (d.body ?? []).map((b) => ({ ...b, text: patchText(b.text) }));
const stale = TEXT_FIXES.filter(([, newTxt]) =>
  ![d.description, d.terms, ...(d.highlights ?? []), ...d.tabs.map((t) => t.text)].some((s) => s?.includes(newTxt))
);
log.push(`ข้อความแก้ ${fixed} จุด${stale.length ? ` ⚠️ หาที่แก้ไม่เจอ ${stale.length} จุด (ข้อความต้นทางเปลี่ยน)` : ""}`);
for (const [oldTxt] of stale) console.log(`   ⚠️ ไม่เจอ: ${oldTxt.slice(0, 70)}…`);

d.savedAt = new Date().toISOString();

// ── สรุป ────────────────────────────────────────────────────────────────────
console.log(`📦 ${d.name} (${TGT_ID}) — ของเสริม 4 อย่าง\n`);
for (const l of log) console.log(`   • ${l}`);
console.log(
  `\n   กลุ่มตัวเลือก ${tgt.data.options.length} → ${d.options.length} · แท็บ ${tgt.data.tabs.length} → ${d.tabs.length}`
);
console.log(`   ฉบับร่าง (hidden): ${d.hidden === true ? "ใช่ — ยังไม่ขึ้นหน้าร้าน" : "ไม่ (เผยแพร่แล้ว)"}`);

// --json <path> = เขียนผลลัพธ์ลงไฟล์ไว้ทดสอบราคา (ไม่แตะฐานข้อมูล)
const jsonAt = process.argv.indexOf("--json");
if (jsonAt > -1 && process.argv[jsonAt + 1]) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.argv[jsonAt + 1], JSON.stringify(d, null, 2));
  console.log(`   📄 เขียนผลลัพธ์ลง ${process.argv[jsonAt + 1]}`);
}

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: d }).eq("id", TGT_ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
