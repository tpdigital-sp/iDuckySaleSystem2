#!/usr/bin/env node
/**
 * 🎁 ตั้งค่าโปร "แพ็กเกจรองหลังฟรี" ให้ตรงกับกติกาที่ร้านใช้จริง (29 ส.ค. 69)
 *
 *   • 1 ชิ้น = รองหลัง 1 ใบ ตั้งแต่ชิ้นแรก (เดิม ครบ 50 ชิ้น ได้ 50 ใบ)
 *   • ผูกของแถมกับสินค้า "กระดาษรองหลัง" (package-backing) แล้วดึงขนาด+รูปมาจากสินค้าตัวนั้น
 *   • เศษที่ไม่เต็มครึ่งแผ่น A3 ได้ "ซองใส-หลังขาว" แทน
 *   • เงื่อนไขที่ระบบตรวจเอง: อะคริลิคต้องขนาด 4 ซม. ขึ้นไป (สินค้าที่ขนาดตายตัวอย่าง Griptok ปล่อยผ่าน)
 *
 * ⚠️ กติกานี้ทำงานครบเมื่อโค้ดชุดใหม่ขึ้น live แล้วเท่านั้น
 *    ถ้ารันก่อน deploy: เว็บจริงจะแจกรองหลัง 1 ใบ/ชิ้น ทันที แต่ยังไม่มีเมนูเลือกขนาด
 *    และยังไม่ตัดสิทธิ์ชิ้นที่เล็กกว่า 4 ซม. (โค้ดเก่าไม่รู้จักฟิลด์ใหม่)
 *
 * ใช้:  node scripts/gift-backing-setup.mjs           ← ดูอย่างเดียว (ไม่เขียน)
 *       node scripts/gift-backing-setup.mjs --write   ← เขียนจริง
 */
import fs from "node:fs";

const WRITE = process.argv.includes("--write");
const PROMO_ID = "gift-backing-package";
const GIFT_PRODUCT = "package-backing";
const SETTINGS_ROW = "__shop_payment__";

/**
 * จำนวนใบต่อแผ่น A3 ของ "ของแถม" ตามตารางที่ร้านใช้คุยกับลูกค้า
 * (ต่างจากที่บันทึกไว้ในหน้าสินค้าบางขนาด — ตารางของแถมนับรวมไดคัท/ซองใส)
 * ขนาดที่ไม่ได้ระบุตรงนี้ = ใช้ค่าจากหน้าสินค้าตามเดิม
 */
const PER_SHEET_OVERRIDE = {
  "7 × 7 cm": 24,
  "9 × 9 cm": 15,
  "6.3 × 10.5 cm": 14,
  "7.5 × 10 cm": 12,
};

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("❌ ไม่เจอ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ใน .env.local");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
const get = async (q) => (await fetch(`${URL}/rest/v1/products?${q}`, { headers: H })).json();

// ── 1) ขนาดจากสินค้ากระดาษรองหลัง (ชื่อ · รูป · จำนวนใบต่อแผ่น) ──
const [prod] = await get(`id=eq.${GIFT_PRODUCT}&select=data`);
if (!prod) {
  console.error(`❌ ไม่เจอสินค้า ${GIFT_PRODUCT}`);
  process.exit(1);
}
const sizeGroup = (prod.data.options ?? []).find((o) => o.label === "ขนาด");
if (!sizeGroup) {
  console.error('❌ สินค้ากระดาษรองหลังไม่มีกลุ่ม "ขนาด"');
  process.exit(1);
}
const sizes = (sizeGroup.choices ?? [])
  .map((c) => ({
    label: c.name,
    image: c.imageSrc || undefined,
    perSheet: PER_SHEET_OVERRIDE[c.name] ?? c.piecesPerUnit ?? c.perUnit ?? undefined,
    note: c.badge || undefined,
  }))
  // ตัด "📐 กำหนดขนาดเอง" และตัวที่ไม่มีทั้งรูปและจำนวนต่อแผ่นออก
  .filter((x) => x.image || (x.perSheet ?? 0) > 0)
  .map((x) => (PER_SHEET_OVERRIDE[x.label] ? { ...x, note: `ได้ ${x.perSheet} ใบ + ไดคัท พร้อมซองใส` } : x));

// ── 2) เขียนทับเฉพาะโปรของแถมรองหลัง (โปรอื่นไม่แตะ) ──
const [row] = await get(`id=eq.${SETTINGS_ROW}&select=data`);
const gifts = row.data.gifts ?? [];
const idx = gifts.findIndex((g) => g.id === PROMO_ID);
if (idx < 0) {
  console.error(`❌ ไม่เจอโปร ${PROMO_ID} ในตั้งค่าร้าน`);
  process.exit(1);
}
const before = gifts[idx];
const after = {
  ...before,
  minQty: 1,
  step: 1,
  giveQty: 1,
  giftProductId: GIFT_PRODUCT,
  sizeLabel: "ขนาดรองหลัง",
  sizes,
  partial: { name: "ซองใส-หลังขาว", minFill: 0.5 },
  condition: "อะคริลิคที่สั่งต้องขนาด 4 ซม. ขึ้นไป หนา 3 มม.",
  requires: [{ label: "ขนาด", minCm: 4, cmMode: "min", whenMissing: "pass" }],
};

console.log("── ก่อน ──");
console.log(`  ครบ ${before.minQty} ชิ้น → ได้ ${before.giveQty} · ทุก ๆ ${before.step ?? before.minQty} ชิ้นได้เพิ่ม · ขนาด: ${before.sizes?.length ?? 0} แบบ`);
console.log("── หลัง ──");
console.log(`  ครบ ${after.minQty} ชิ้น → ได้ ${after.giveQty} · ทุก ๆ ${after.step} ชิ้นได้เพิ่ม`);
console.log(`  เศษไม่ถึงครึ่งแผ่น A3 → ${after.partial.name}`);
console.log(`  เงื่อนไขอัตโนมัติ: ขนาด ≥ ${after.requires[0].minCm} ซม. (ไม่มีกลุ่มขนาด = ปล่อยผ่าน)`);
for (const s of sizes) console.log(`  • ${s.label} — ${s.perSheet ?? "?"} ใบ/แผ่น A3${s.image ? " · มีรูป" : ""}`);

if (!WRITE) {
  console.log("\n👀 ดูอย่างเดียว — ใส่ --write เพื่อเขียนจริง");
  process.exit(0);
}
gifts[idx] = after;
const res = await fetch(`${URL}/rest/v1/products?id=eq.${SETTINGS_ROW}`, {
  method: "PATCH",
  headers: H,
  body: JSON.stringify({ data: { ...row.data, gifts } }),
});
console.log(res.ok ? "\n✅ บันทึกแล้ว" : `\n❌ บันทึกไม่สำเร็จ (${res.status})`);
