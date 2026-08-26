#!/usr/bin/env node
/**
 * "อะคริลิคประกบ" (acrylic-prakob) — เพิ่มชุดตัวเลือกตะขอ/ห่วง แบบเดียวกับสินค้าพวงกุญแจ
 *
 *   node scripts/prakob-add-hooks.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/prakob-add-hooks.mjs --write   # บันทึกจริง
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 "เพิ่มตะขอให้หน่อย ดูในสินค้าพวงกุญแจ"
 *
 * คัดลอกจาก "Shake Shake Acrylic (พวงกุญแจเขย่า)" (new-mt2rp5i3-9488) ไม่ใช่พวงกุญแจอะคริลิค
 * ตัวแรกเริ่ม เพราะฉบับ Shake Shake ปรับ freeWhen/smallQtyFee ให้ไม่ผูกกับกลุ่ม "ความหนาอะคริลิค"
 * แล้ว (อะคริลิคประกบไม่มีกลุ่มนั้น — ประกบใช้ 3mm สองแผ่นเสมอ):
 *   • รับตะขอไหม → ตะขอ 31 แบบ (โชว์เมื่อ "รับตะขอ") → สีตะขอ 13 กลุ่ม (โชว์ตามแบบตะขอ)
 *   • Z1/Z2 (สีเงิน) แถมฟรี · แบบอื่น 1-10 ชิ้นเหมา 10 บาท/ชิ้น (smallQtyFee) · 11+ คิดตามอะไหล่ (extraFromQty)
 *   • กลุ่มยังลิงก์คลังตัวเลือกกลางผ่าน presetId เดิม (preset-3 / hook-color-*)
 * แท็บ "ตะขอ / ห่วง" (แผ่นอะไหล่รวม + ชาร์ตสี) คัดลอกมาด้วย — ภาพชี้ storage ของ Shake Shake
 * ใช้ร่วมกันได้ (แนวเดียวกับ griptok-mirror ที่ยืมภาพ griptok-acrylic) · แก้คำว่า "ชุด" → "ชิ้น"
 * เพราะประกบขายเป็นชิ้น ไม่ใช่เซ็ตเขย่า
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const SRC_ID = "new-mt2rp5i3-9488"; // Shake Shake Acrylic — ชุดตะขอฉบับล่าสุดที่ไม่ผูกความหนา
const TGT_ID = "acrylic-prakob";

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
if ((d.options ?? []).some((o) => HOOK_GROUPS.includes(o.label)))
  throw new Error("สินค้าเป้าหมายมีกลุ่มตะขออยู่แล้ว — เพิ่มไปแล้ว ไม่ต้องรันซ้ำ");
const missing = HOOK_GROUPS.filter((g) => !(src.data.options ?? []).some((o) => o.label === g));
if (missing.length)
  throw new Error(`ต้นแบบไม่มีกลุ่ม: ${missing.join(", ")} — โครง Shake Shake เปลี่ยน ตรวจก่อน`);
const srcTab = (src.data.tabs ?? []).find((t) => t.title === HOOK_TAB);
if (!srcTab) throw new Error(`ต้นแบบไม่มีแท็บ "${HOOK_TAB}" — ตรวจก่อน`);

// ── คัดลอกกลุ่มตัวเลือก (ตามลำดับต้นแบบ) ต่อท้ายกลุ่มเดิม ───────────────────────
const copied = HOOK_GROUPS.map((g) =>
  structuredClone(src.data.options.find((o) => o.label === g))
);
d.options = [...(d.options ?? []), ...copied];

// ── คัดลอกแท็บ แทรกถัดจาก "รายละเอียดเพิ่มเติม" (ตำแหน่งเดียวกับต้นแบบ) ─────────
const tab = structuredClone(srcTab);
tab.text = tab.text.replaceAll("ชุด", "ชิ้น");
d.tabs = [...(d.tabs ?? [])];
d.tabs.splice(1, 0, tab);

d.savedAt = new Date().toISOString();

console.log(`📦 ${d.name} (${TGT_ID}) ← ชุดตะขอจาก ${src.data.name} (${SRC_ID})`);
for (const o of copied) {
  const bits = [
    `${o.choices.length} ตัวเลือก`,
    o.display && `display=${o.display}`,
    o.showWhen && `โชว์เมื่อ ${o.showWhen.label}=${o.showWhen.choices.join("/")}`,
    o.presetId && `preset=${o.presetId}`,
  ].filter(Boolean);
  console.log(`   + "${o.label}" — ${bits.join(" · ")}`);
}
console.log(`   + แท็บ "${tab.title}" (ภาพ ${tab.images?.length ?? 0} · แก้ ชุด→ชิ้น)`);
console.log(`   รวมกลุ่มตัวเลือก ${tgt.data.options.length} → ${d.options.length} · แท็บ ${tgt.data.tabs.length} → ${d.tabs.length}`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const up = await sb.from("products").update({ data: d }).eq("id", TGT_ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
