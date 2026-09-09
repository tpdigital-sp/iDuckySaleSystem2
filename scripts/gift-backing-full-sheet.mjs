#!/usr/bin/env node
/**
 * 🎁 โปรรองหลัง: เปลี่ยนเกณฑ์ "เศษต้องเต็ม" จากครึ่งแผ่น (50%) เป็นเต็มแผ่น (100%)
 *
 * เจ้าของร้านสั่ง 9 ก.ย. 69: ของแถมรองหลังให้ถือว่า "ปลดล็อก" เมื่อสั่งครบ 1 แผ่น A3
 * (7×7 = 24 ใบ · 9×9 = 15 · 6.3×10.5 = 14 · 7.5×10 = 12) — ก่อนหน้านั้นไม่ขึ้นการ์ดของแถม
 * ให้ขึ้นแถบ "สั่งครบ 24 ชิ้น ปลดล็อก…" ในสรุปยอดแทน (giftUnlock ใน src/lib/gifts.ts อ่านค่านี้)
 *
 * เศษที่เกินแผ่นเต็มยังได้ "ซองใส-หลังขาว" แทนเหมือนเดิม จนกว่าจะครบแผ่นถัดไป
 * ย้อนกลับได้ที่ /admin/settings?tab=gift ช่อง "เศษต้องเต็ม" → 50
 *
 * ใช้: node scripts/gift-backing-full-sheet.mjs          (dry-run)
 *      node scripts/gift-backing-full-sheet.mjs --apply
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const PROMO_ID = "gift-backing-package";

const { data: row, error } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
if (error || !row) { console.error("❌ อ่าน __shop_payment__ ไม่ได้", error); process.exit(1); }
const gifts = Array.isArray(row.data?.gifts) ? row.data.gifts : [];
const g = gifts.find((x) => x?.id === PROMO_ID);
if (!g) { console.error(`❌ ไม่เจอโปร ${PROMO_ID}`); process.exit(1); }
if (!g.partial?.name) { console.error("❌ โปรนี้ไม่มี partial (ของแทน) — ไม่มีอะไรให้ปรับ"); process.exit(1); }

console.log(`โปร "${g.name}" · ของแทน "${g.partial.name}" · เศษต้องเต็ม: ${Math.round((g.partial.minFill ?? 0.5) * 100)}% → 100%`);
for (const s of g.sizes ?? []) console.log(`  · ${s.label}: ปลดล็อกเมื่อครบ ${s.perSheet} ชิ้น`);
if (!APPLY) { console.log("(dry-run — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

g.partial = { ...g.partial, minFill: 1 };
const next = { ...row.data, gifts, savedAt: new Date().toISOString() };
const { error: e2 } = await sb.from("products").update({ data: next }).eq("id", "__shop_payment__");
if (e2) { console.error("❌ เขียนไม่สำเร็จ", e2); process.exit(1); }
console.log("✅ เขียนแล้ว minFill = 1");
