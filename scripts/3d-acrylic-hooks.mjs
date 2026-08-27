#!/usr/bin/env node
/**
 * 3D Acrylic (3d-acrylic) — เจาะรูตะขอ + ชุดตะขอ/ห่วง ตรรกะเดียวกับ Acrylic Kit
 * ผู้ใช้สั่ง 27 ส.ค. 69
 *
 *   node scripts/3d-acrylic-hooks.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/3d-acrylic-hooks.mjs --write   # บันทึกจริง
 *
 * 1) กลุ่มใหม่ "เจาะรูตะขอ" — ไม่เจาะรู (ค่าเริ่มต้น) / เจาะรูตะขอ (ฟรี)
 * 2) ชุดตะขอโคลนสดจาก Acrylic Kit (กลุ่ม "ตะขอ" + สีตะขอ 13 กลุ่ม qtyFrom
 *    คิดตามราคาอะไหล่จริงตั้งแต่ชิ้นแรก ไม่มีของแถม/ค่าเหมา)
 *    ⚠️ 27 ส.ค. 69 ผู้ใช้สั่งปรับกลุ่ม "ตะขอ" สองรอบ: ถอดช่องระบุจำนวนของ Kit ออก
 *    แล้วเปลี่ยนจากติ๊ก (multi) เป็นเมนู dropdown เลือกได้ 1 แบบต่อชุด
 *    — dropdown เลือกตัวแรกให้อัตโนมัติ จึงเติม "ไม่รับตะขอ (เจาะรูอย่างเดียว)" 0฿ ไว้หัวเมนู
 * 3) เงื่อนไข: เลือก "ไม่เจาะรู" = กลุ่มตะขอทั้งชุดไม่แสดง
 *    → กลุ่ม "ตะขอ" showWhen เจาะรูตะขอ · กลุ่มสี showWhen ตะขอ + showWhenAlso เจาะรูตะขอ
 *    (ต่างจาก Kit ที่เกตชื่อ "รับตะขอไหม" — ที่นี่การเจาะรูคือเกตเอง ไม่ตั้งกลุ่มซ้อน)
 * 4) แท็บ "ตะขอ / ห่วง" (แผ่นอะไหล่รวม + ชาร์ตสี) ยกมาจาก Kit ทั้งแท็บ ภาพใช้ร่วมกัน
 * 5) ข้อความเดิม "ค่าอะไหล่ (ตะขอ/ห่วง/โซ่/ฐานตั้ง/Griptok) แจ้งแอดมิน" ปรับให้ตรงจริง:
 *    ตะขอ/ห่วง + ฐานตั้ง เลือกในหน้าสินค้าได้แล้ว เหลือ โซ่/Griptok ที่ต้องแจ้งแอดมิน
 *
 * รันซ้ำได้ — โคลนชุดตะขอจาก Kit สดทุกครั้ง (Kit เปลี่ยนราคาอะไหล่ = รันทับตัวนี้ตาม)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const TGT_ID = "3d-acrylic"; // 3D Acrylic
const SRC_ID = "new-mt2rpb1j-2194"; // Acrylic Kit — ต้นแบบชุดตะขอ (ค่าตะขอคิดตั้งแต่ชิ้นแรก)
const HOOK_TAB = "ตะขอ / ห่วง";

const DRILL_LABEL = "เจาะรูตะขอ";
const DRILL_YES = "เจาะรูตะขอ";
const DRILL_NO = "ไม่เจาะรู";

// กลุ่มที่โคลนจาก Kit — ไม่รวมเกต "รับตะขอไหม" (ที่นี่ใช้ "เจาะรูตะขอ" เป็นเกตแทน)
const HOOK_GROUPS = [
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

/** 🕳 เกตของชุดตะขอ — ไม่เจาะรู (ค่าเริ่มต้น) = กลุ่มตะขอทั้งชุดไม่แสดง */
const DRILL_GROUP = {
  label: DRILL_LABEL,
  note:
    "เจาะรูที่ชิ้นงานสำหรับใส่ตะขอ/ห่วง **ฟรี ไม่มีค่าเจาะ** — ตะขอ/ห่วงมีให้เลือกกว่า 30 แบบตามแผ่นอะไหล่ของร้าน " +
    "คิดเพิ่มตามชนิดตั้งแต่ชิ้นแรก (ห่วง Z1 / โซ่ Z2 สีเงิน ชิ้นละ 2 บาท · แบบอื่นตามราคาอะไหล่) " +
    'ดูรูปอะไหล่ทั้งหมดในแท็บ "ตะขอ / ห่วง" ท้ายหน้า · ระบุชิ้น/ตำแหน่งที่จะเจาะรูในช่องหมายเหตุถึงร้าน',
  choices: [{ name: DRILL_NO }, { name: DRILL_YES }],
};

/** ข้อความเดิมบอกว่าอะไหล่ทุกอย่างต้องแจ้งแอดมิน — ปรับให้ตรงของจริง [เดิม, ใหม่] */
const TEXT_FIXES = [
  [
    "ราคายังไม่รวมค่าอะไหล่ (ตะขอ / ห่วง / โซ่ / ฐานตั้ง / Griptok) — แจ้งแอดมินเพื่อคิดราคาเพิ่ม",
    "อะไหล่ตะขอ/ห่วงกว่า 30 แบบ และฐานตั้ง เลือกได้ในหน้าสินค้า (เจาะรูตะขอฟรี · ค่าอะไหล่คิดตามชนิดตั้งแต่ชิ้นแรก) · อะไหล่อื่น (โซ่ / Griptok) แจ้งแอดมินเพื่อคิดราคาเพิ่ม",
  ],
  [
    "• ค่าอะไหล่ (ตะขอ / ห่วง / โซ่ / ฐานตั้ง / Griptok) — แจ้งแอดมินเพื่อคิดราคาเพิ่ม",
    "• อะไหล่ตะขอ/ห่วงกว่า 30 แบบ เลือกได้ในหน้าสินค้า — เจาะรูตะขอฟรี คิดตามราคาอะไหล่จริงตั้งแต่ชิ้นแรก (ประมาณ 2-15 บาท/ชิ้น) · อะไหล่อื่น (โซ่ / Griptok) แจ้งแอดมินเพื่อคิดราคาเพิ่ม",
  ],
  [
    '• ถ้าต้องการอะไหล่ (ตะขอ / โซ่ / ฐานตั้ง / Griptok) เขียนบอกในช่อง "หมายเหตุถึงร้าน" แอดมินจะคิดราคาเพิ่มให้',
    '• ต้องการตะขอ/ห่วง เลือก "เจาะรูตะขอ" แล้วติ๊กแบบที่ต้องการได้ในหน้าสินค้า (เจาะรูฟรี) · อะไหล่อื่น (โซ่ / Griptok) เขียนบอกในช่อง "หมายเหตุถึงร้าน" แอดมินจะคิดราคาเพิ่มให้',
  ],
  [
    "<li><strong>ค่าอะไหล่</strong> — ตะขอ / ห่วง / โซ่ / ฐานตั้ง / Griptok (ราคาในตารางยังไม่รวม)</li>",
    "<li><strong>ค่าอะไหล่ตะขอ/ห่วง</strong> — เลือกได้ในหน้าสินค้ากว่า 30 แบบ เจาะรูฟรี คิดตามชนิดตั้งแต่ชิ้นแรก (โซ่ / Griptok แจ้งแอดมิน)</li>",
  ],
];
const FAQ_A_OLD = "ยังไม่รวมครับ ค่าอะไหล่ (ตะขอ / โซ่ / ฐานตั้ง / Griptok) แจ้งแอดมินเพื่อคิดราคาเพิ่ม";
const FAQ_A_NEW =
  "ตะขอ/ห่วงเลือกได้ในหน้าสินค้าเลยครับ ระบบคิดราคาให้ทันที (เจาะรูฟรี) · อะไหล่อื่น (โซ่ / Griptok) แจ้งแอดมินเพื่อคิดราคาเพิ่ม";

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

const [{ data: tgt, error: e1 }, { data: src, error: e2 }] = await Promise.all([
  sb.from("products").select("id,data").eq("id", TGT_ID).single(),
  sb.from("products").select("id,data").eq("id", SRC_ID).single(),
]);
if (e1) throw new Error(`อ่านสินค้าเป้าหมายไม่ได้ — ${e1.message}`);
if (e2) throw new Error(`อ่าน Acrylic Kit ต้นแบบไม่ได้ — ${e2.message}`);

const missing = HOOK_GROUPS.filter((g) => !(src.data.options ?? []).some((o) => o.label === g));
if (missing.length) throw new Error(`Kit ไม่มีกลุ่ม: ${missing.join(", ")} — โครงต้นแบบเปลี่ยน ตรวจก่อน`);
const srcHook = src.data.options.find((o) => o.label === "ตะขอ");
if (srcHook.freeWhen || srcHook.smallQtyFee)
  throw new Error(
    'กลุ่ม "ตะขอ" ของ Kit ยังมี freeWhen/smallQtyFee — ต้องรัน acrylic-kit-hook-price-first-piece.mjs --write ก่อน'
  );
const srcTab = (src.data.tabs ?? []).find((t) => t.title === HOOK_TAB);
if (!srcTab) throw new Error(`Kit ไม่มีแท็บ "${HOOK_TAB}" — ตรวจก่อน`);

const d = structuredClone(tgt.data);
const log = [];

// ── 1) ชุดตะขอ — เกตเปลี่ยนจาก "รับตะขอไหม" เป็น "เจาะรูตะขอ" ─────────────────────
const drillOn = { label: DRILL_LABEL, choices: [DRILL_YES] };
const HOOK_NONE = "ไม่รับตะขอ (เจาะรูอย่างเดียว)";
const HOOK_NOTE =
  "เลือกตะขอ/ห่วงจากเมนูได้ 1 แบบต่อชุด — ดูรูปอะไหล่ทั้งหมดในแท็บ “ตะขอ / ห่วง” ท้ายหน้า · " +
  "ต้องการหลายแบบหรือมากกว่า 1 ชิ้น แจ้งในหมายเหตุถึงร้าน";
const hookOptions = HOOK_GROUPS.map((label) => {
  const o = structuredClone(src.data.options.find((x) => x.label === label));
  if (label === "ตะขอ") {
    o.showWhen = drillOn; // เดิมชี้ "รับตะขอไหม"
    o.note = HOOK_NOTE;
    // Kit เป็นติ๊กหลายแบบ+ระบุจำนวน — ที่นี่เป็นเมนู dropdown เลือก 1 แบบ (ถอด qty ทิ้ง)
    o.display = "dropdown";
    o.choices = [{ name: HOOK_NONE }, ...o.choices.map(({ qty, qtyUnit, qtyMax, ...c }) => c)];
  } else {
    // กลุ่มสี: showWhen ชี้ "ตะขอ" ตามเดิม · เกตชั้นสองเปลี่ยนเป็น "เจาะรูตะขอ"
    o.showWhenAlso = drillOn;
  }
  return o;
});
log.push(
  `ชุดตะขอ ${hookOptions.length + 1} กลุ่ม (เกต "${DRILL_LABEL}" · ตะขอเมนู dropdown ${hookOptions[0].choices.length} ตัวเลือก นำด้วย "${HOOK_NONE}" · สี ${hookOptions.length - 1} กลุ่ม qtyFrom+showWhenAlso)`
);

// ── 2) ต่อท้ายรายการกลุ่ม (รันซ้ำ = ทับของเดิม) ─────────────────────────────────
const known = new Set([DRILL_LABEL, ...HOOK_GROUPS]);
d.options = [...d.options.filter((o) => !known.has(o.label)), structuredClone(DRILL_GROUP), ...hookOptions];
log.push(`ลำดับกลุ่ม: …${d.options.slice(-17).map((o) => o.label).join(" · ")}`);

// ── 3) แท็บ "ตะขอ / ห่วง" ยกจาก Kit — แก้บรรทัดที่บอกว่าระบุจำนวนได้ (ที่นี่ติ๊กแบบละ 1 ชิ้น) ──
const TAB_QTY_OLD =
  "• ตะขอ/ห่วงแบบอื่นคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น) ตั้งแต่ชิ้นแรก ทุกจำนวนที่สั่ง — ระบุจำนวนตะขอต่อ 1 ชุดได้ ระบบคูณให้อัตโนมัติ";
const TAB_QTY_NEW =
  "• ตะขอ/ห่วงแบบอื่นคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น) ตั้งแต่ชิ้นแรก ทุกจำนวนที่สั่ง — เลือกจากเมนูได้ 1 แบบต่อชุด (ต้องการหลายแบบ แจ้งในหมายเหตุถึงร้าน)";
const tab = structuredClone(srcTab);
if (!tab.text.includes(TAB_QTY_NEW)) {
  if (!tab.text.includes(TAB_QTY_OLD)) console.log("   ⚠️ แท็บตะขอ: ไม่เจอบรรทัดระบุจำนวน — ข้อความต้นแบบ Kit เปลี่ยน");
  tab.text = tab.text.replace(TAB_QTY_OLD, TAB_QTY_NEW);
}
d.tabs = (d.tabs ?? []).filter((t) => t.title !== HOOK_TAB);
d.tabs.splice(1, 0, tab);
log.push(`แท็บ "${tab.title}" (ภาพ ${tab.images?.length ?? 0})`);

// ── 4) ข้อความในหน้า ────────────────────────────────────────────────────────
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
d.tabs = d.tabs.map((t) => ({ ...t, text: patchText(t.text), ...(t.html ? { html: patchText(t.html) } : {}) }));
d.body = (d.body ?? []).map((b) => ({ ...b, text: patchText(b.text) }));
if (d.seo?.faqs) {
  for (const f of d.seo.faqs) {
    if (f.a === FAQ_A_NEW) continue;
    if (f.a === FAQ_A_OLD) {
      f.a = FAQ_A_NEW;
      fixed++;
    }
  }
}
const allTexts = [d.description, d.terms, ...(d.highlights ?? []), ...d.tabs.flatMap((t) => [t.text, t.html])];
const stale = TEXT_FIXES.filter(([, newTxt]) => !allTexts.some((s) => s?.includes(newTxt)));
log.push(`ข้อความแก้ ${fixed} จุด${stale.length ? ` ⚠️ หาที่แก้ไม่เจอ ${stale.length} จุด (ข้อความต้นทางเปลี่ยน)` : ""}`);
for (const [oldTxt] of stale) console.log(`   ⚠️ ไม่เจอ: ${oldTxt.slice(0, 70)}…`);
if (d.seo?.faqs && !d.seo.faqs.some((f) => f.a === FAQ_A_NEW)) console.log("   ⚠️ FAQ อะไหล่: หาคำตอบเดิมไม่เจอ");

d.savedAt = new Date().toISOString();

// ── สรุป ────────────────────────────────────────────────────────────────────
console.log(`📦 ${d.name} (${TGT_ID}) — เจาะรูตะขอ + ชุดตะขอจาก Acrylic Kit\n`);
for (const l of log) console.log(`   • ${l}`);
console.log(
  `\n   กลุ่มตัวเลือก ${tgt.data.options.length} → ${d.options.length} · แท็บ ${tgt.data.tabs.length} → ${d.tabs.length}`
);
console.log(`   ฉบับร่าง (hidden): ${d.hidden === true ? "ใช่ — ยังไม่ขึ้นหน้าร้าน" : "ไม่ (เผยแพร่แล้ว)"}`);

// --json <path> = เขียนผลลัพธ์ลงไฟล์ไว้ตรวจ (ไม่แตะฐานข้อมูล)
const jsonAt = process.argv.indexOf("--json");
if (jsonAt > -1 && process.argv[jsonAt + 1]) {
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
