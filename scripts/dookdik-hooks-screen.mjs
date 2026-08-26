#!/usr/bin/env node
/**
 * "อะคริลิคดุ๊กดิ๊ก" (acrylic-dookdik) — 2 งานตามผู้ใช้สั่ง 26 ส.ค. 69:
 *
 *   1) แบบ "พวงกุญแจ" รับตะขอได้ — คัดลอกชุดตะขอ/ห่วง 15 กลุ่ม + แท็บ "ตะขอ / ห่วง"
 *      จาก Shake Shake Acrylic (new-mt2rp5i3-9488 ต้นแบบชุดตะขอ ฉบับไม่ผูกความหนา)
 *      ราคาตะขอใช้ตรรกะเดียวกับสินค้าพวงกุญแจ (แนวเดียวกับ prakob-hook-free-retail.mjs):
 *        • ช่วง 1-10 อัน ฟรีทุกแบบ (รวมในราคาแล้ว) — ตัด smallQtyFee เหมา 10฿ ของ Shake Shake ทิ้ง
 *        • 11 อันขึ้นไปคิดเพิ่มตามราคาอะไหล่จริง (extraFromQty: 11 — กลุ่มสีตะขอตั้งไว้แล้วทุกกลุ่ม)
 *        • ห่วง Z1 / โซ่ Z2 (สีเงิน) ฟรีทุกช่วงจำนวน (freeWhen เดิม)
 *      ทุกกลุ่มโชว์เฉพาะ แบบ=พวงกุญแจ:
 *        • "รับตะขอไหม" → showWhen แบบ=พวงกุญแจ
 *        • "ตะขอ" → showWhenAlso (ช่องว่างอยู่)
 *        • "สีตะขอ …" → showWhenAll (showWhenAlso ถูกใช้ผูก "รับตะขอไหม" ไปแล้ว)
 *
 *   2) เลือกงานสกรีนได้ — กลุ่ม "งานสกรีน" 4 แบบมาตรฐานร้าน (การ์ด+รูปชุด acrylic-howto
 *      เดียวกับ standee-keyring) ทุกตัว 0฿ เพราะราคาสินค้ารวมค่าสกรีน 2 ด้านแล้ว
 *
 *   node scripts/dookdik-hooks-screen.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/dookdik-hooks-screen.mjs --write   # บันทึกจริง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const SRC_ID = "new-mt2rp5i3-9488"; // Shake Shake Acrylic — ต้นแบบชุดตะขอ
const TGT_ID = "acrylic-dookdik";
const KEYRING = "พวงกุญแจ"; // ค่าในกลุ่ม "แบบ" ที่เปิดชุดตะขอ

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
const HOOK_TAB = "ตะขอ / ห่วง";

const ASK_NOTE =
  'ตะขอ/ห่วงมีให้เลือกกว่า 30 แบบตามแผ่นอะไหล่ของร้าน — **ช่วง 1-10 อัน ฟรีทุกแบบ (รวมในราคาแล้ว)** สั่ง 11 อันขึ้นไปคิดเพิ่มตามชนิด · ห่วง Z1 / โซ่ Z2 (สีเงิน) ฟรีทุกช่วงจำนวน (ดูรูปอะไหล่ทั้งหมดในแท็บ "ตะขอ / ห่วง" ท้ายหน้า)';

const TAB_TEXT = `เลือกตะขอได้จากแผ่นอะไหล่ของร้าน (เฉพาะแบบพวงกุญแจ)::
• ช่วง 1-10 อัน เลือกตะขอ/ห่วงแบบไหนก็ได้ ฟรีทุกแบบ (รวมในราคาแล้ว)
• สั่ง 11 อันขึ้นไปคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/อัน) — ระบบบวกให้อัตโนมัติเมื่อเลือก
• ห่วง Z1 (ห่วงกลมเงิน) และ Z2 (โซ่ไข่ปลาเงิน) ฟรีทุกช่วงจำนวน
• ตะขอบางแบบเลือกสีได้ (ดูชาร์ตสีด้านล่าง) — เลือกได้ในหน้าสินค้าเมื่อเลือกตะขอแบบนั้น
• ตะขอ BB/BC เป็นสีสุ่ม เลือกสีไม่ได้

ดูรูปอะไหล่ทั้งหมด::
• ภาพแรกคือแผ่นอะไหล่รวมของร้าน มีรหัสกำกับทุกตัว (Z1, Z2, A-V, AA-BC)
• ภาพถัดไปคือชาร์ตสีของตะขอที่มีหลายสี (G · H · I · S · T · U)`;

const HOWTO = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/acrylic-howto";
const SCREEN_GROUP = {
  label: "งานสกรีน",
  note: "**ราคารวมค่าสกรีน 2 ด้านแล้ว** — เลือกสกรีน 2 ด้านได้โดยไม่บวกเพิ่ม",
  display: "cards",
  choices: [
    {
      name: "สกรีน 1 ด้าน (ใต้)",
      desc: "พิมพ์ใต้แผ่น มองลายผ่านเนื้ออะคริลิคใส ผิวเรียบเงา ลายไม่ถลอก — แบบมาตรฐานของร้าน",
      popular: true,
      imageSrc: `${HOWTO}/screen-1side-under-v1.jpg`,
    },
    {
      name: "สกรีน 1 ด้าน (บน)",
      desc: "พิมพ์บนผิวหน้า ลายคมชัด สัมผัสเนื้อลายได้",
      imageSrc: `${HOWTO}/screen-1side-top-v1.jpg`,
    },
    {
      name: "สกรีน 2 ด้าน (ใต้-บน)",
      desc: "พิมพ์สองหน้า — ฝั่งหนึ่งใต้แผ่น อีกฝั่งบนผิว",
      popular: true,
      imageSrc: `${HOWTO}/screen-2side-under-top-v1.jpg`,
    },
    {
      name: "สกรีน 2 ด้าน (บน-บน)",
      desc: "พิมพ์บนผิวทั้งสองหน้า",
      imageSrc: `${HOWTO}/screen-2side-top-top-v1.jpg`,
    },
  ],
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const [{ data: src, error: e1 }, { data: tgt, error: e2 }] = await Promise.all([
  sb.from("products").select("id,data").eq("id", SRC_ID).single(),
  sb.from("products").select("id,data").eq("id", TGT_ID).single(),
]);
if (e1) throw new Error(`อ่านต้นแบบไม่ได้ — ${e1.message}`);
if (e2) throw new Error(`อ่านสินค้าเป้าหมายไม่ได้ — ${e2.message}`);

const d = structuredClone(tgt.data);

// ── กันรันซ้ำ / กันโครงเปลี่ยน ────────────────────────────────────────────────
if ((d.options ?? []).some((o) => HOOK_GROUPS.includes(o.label) || o.label === SCREEN_GROUP.label))
  throw new Error("สินค้าเป้าหมายมีกลุ่มตะขอ/งานสกรีนอยู่แล้ว — เพิ่มไปแล้ว ไม่ต้องรันซ้ำ");
const design = (d.options ?? []).find((o) => o.label === "แบบ");
if (!design || !design.choices.some((c) => c.name === KEYRING))
  throw new Error(`สินค้าเป้าหมายไม่มีกลุ่ม "แบบ" หรือไม่มีตัวเลือก "${KEYRING}" — ตรวจก่อน`);
const missing = HOOK_GROUPS.filter((g) => !(src.data.options ?? []).some((o) => o.label === g));
if (missing.length)
  throw new Error(`ต้นแบบไม่มีกลุ่ม: ${missing.join(", ")} — โครง Shake Shake เปลี่ยน ตรวจก่อน`);
const srcTab = (src.data.tabs ?? []).find((t) => t.title === HOOK_TAB);
if (!srcTab) throw new Error(`ต้นแบบไม่มีแท็บ "${HOOK_TAB}" — ตรวจก่อน`);

// ── งานสกรีน แทรกถัดจาก "แบบ" ────────────────────────────────────────────────
const designIdx = d.options.findIndex((o) => o.label === "แบบ");
d.options.splice(designIdx + 1, 0, structuredClone(SCREEN_GROUP));

// ── ชุดตะขอ: คัดลอก + ผูกกับ แบบ=พวงกุญแจ + ราคาแบบสินค้าพวงกุญแจ ──────────────
const onlyKeyring = { label: "แบบ", choices: [KEYRING] };
const copied = HOOK_GROUPS.map((g) =>
  structuredClone(src.data.options.find((o) => o.label === g))
);
for (const o of copied) {
  if (o.label === "รับตะขอไหม") {
    if (o.showWhen) throw new Error(`"${o.label}" มี showWhen อยู่แล้ว — โครงต้นแบบเปลี่ยน ตรวจก่อน`);
    o.showWhen = onlyKeyring;
    o.note = ASK_NOTE;
  } else if (o.label === "ตะขอ") {
    if (o.showWhenAlso) throw new Error(`"${o.label}" มี showWhenAlso อยู่แล้ว — โครงต้นแบบเปลี่ยน ตรวจก่อน`);
    o.showWhenAlso = onlyKeyring;
    delete o.smallQtyFee; // เหมา 10฿ ช่วง 1-10 ของ Shake Shake — ดุ๊กดิ๊กให้ฟรีตามตรรกะพวงกุญแจ
    o.extraFromQty = 11;
  } else {
    // สีตะขอ … — showWhen/showWhenAlso ถูกใช้แล้ว ใส่เงื่อนไขข้อสามผ่าน showWhenAll
    if (o.showWhenAll?.length) throw new Error(`"${o.label}" มี showWhenAll อยู่แล้ว — โครงต้นแบบเปลี่ยน ตรวจก่อน`);
    o.showWhenAll = [onlyKeyring];
    if (o.extraFromQty !== 11)
      throw new Error(`"${o.label}" extraFromQty=${o.extraFromQty} ไม่ใช่ 11 — โครงต้นแบบเปลี่ยน ตรวจก่อน`);
  }
}
d.options = [...d.options, ...copied];

// ── แท็บ "ตะขอ / ห่วง" แทรกถัดจาก "รายละเอียดเพิ่มเติม" · ข้อความฉบับราคาพวงกุญแจ ──
const tab = structuredClone(srcTab);
tab.text = TAB_TEXT;
d.tabs = [...(d.tabs ?? [])];
d.tabs.splice(1, 0, tab);

d.savedAt = new Date().toISOString();

console.log(`📦 ${d.name} (${TGT_ID}) ← ชุดตะขอจาก ${src.data.name} (${SRC_ID})`);
console.log(`   + "งานสกรีน" ${SCREEN_GROUP.choices.length} ตัวเลือก (0฿ ทุกตัว — ราคารวม 2 ด้านแล้ว) แทรกถัดจาก "แบบ"`);
for (const o of copied) {
  const conds = [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? [])]
    .filter(Boolean)
    .map((w) => `${w.label}=${w.choices.join("/")}`)
    .join(" และ ");
  console.log(`   + "${o.label}" — ${o.choices.length} ตัวเลือก · โชว์เมื่อ ${conds}${o.extraFromQty ? ` · extraFromQty=${o.extraFromQty}` : ""}`);
}
console.log(`   + แท็บ "${tab.title}" (ภาพ ${tab.images?.length ?? 0} · ข้อความฉบับ 1-10 อันฟรี)`);
console.log(`   รวมกลุ่มตัวเลือก ${tgt.data.options.length} → ${d.options.length} · แท็บ ${tgt.data.tabs.length} → ${d.tabs.length}`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const up = await sb.from("products").update({ data: d }).eq("id", TGT_ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
