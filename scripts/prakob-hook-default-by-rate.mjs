#!/usr/bin/env node
/**
 * "อะคริลิคประกบ" — ค่าเริ่มต้นกลุ่ม "รับตะขอไหม" ผูกกับเรทราคา (ProductOption.defaultBy)
 *
 *   node scripts/prakob-hook-default-by-rate.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/prakob-hook-default-by-rate.mjs --write   # บันทึกจริง
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 "ถ้าสแตนดี้อะคริลิคประกบ กลุ่มรับตะขอไหม: จะเริ่มต้นเป็น ไม่รับตะขอ"
 *   • เรท "สแตนดี้อะคริลิคประกบ"   → เริ่มที่ "ไม่รับตะขอ" (สแตนดี้มีฐาน ปกติไม่แขวน)
 *   • เรท "พวงกุญแจอะคริลิคประกบ" → เริ่มที่ "รับตะขอ" (สลับเรทกลับมาแล้วรีเซ็ตกลับด้วย)
 * ลูกค้ายังกดเปลี่ยนเองได้เสมอ — รีเซ็ตเฉพาะตอน "ค่าเรทเปลี่ยน" (ดู effect ใน ProductDetail)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "acrylic-prakob";
const GROUP = "รับตะขอไหม";
const DEFAULT_BY = {
  label: "เรทราคา",
  map: {
    "สแตนดี้อะคริลิคประกบ": "ไม่รับตะขอ",
    "พวงกุญแจอะคริลิคประกบ": "รับตะขอ",
  },
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

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);

const d = structuredClone(row.data);
const opt = (d.options ?? []).find((o) => o.label === GROUP);
if (!opt) throw new Error(`ไม่เจอกลุ่ม "${GROUP}" — รัน scripts/prakob-add-hooks.mjs ก่อน`);

// กันตั้งค่าชี้ค่าที่ไม่มีจริง — เรทต้องมีอยู่ และตัวเลือกปลายทางต้องอยู่ในกลุ่ม
const rateLabels = (d.priceRates ?? []).map((r) => r.label);
for (const [rateLabel, choice] of Object.entries(DEFAULT_BY.map)) {
  if (!rateLabels.includes(rateLabel))
    throw new Error(`ไม่มีเรท "${rateLabel}" ในสินค้า (มี: ${rateLabels.join(", ")})`);
  if (!opt.choices.some((c) => c.name === choice))
    throw new Error(`กลุ่ม "${GROUP}" ไม่มีตัวเลือก "${choice}"`);
}

console.log(`📦 ${d.name} (${ID}) · กลุ่ม "${GROUP}"`);
console.log("   defaultBy เดิม:", JSON.stringify(opt.defaultBy ?? null));
opt.defaultBy = DEFAULT_BY;
console.log("   defaultBy ใหม่:", JSON.stringify(opt.defaultBy));
d.savedAt = new Date().toISOString();

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
