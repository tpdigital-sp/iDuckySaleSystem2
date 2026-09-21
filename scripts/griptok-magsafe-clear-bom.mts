/**
 * 🧲 "Griptok ใส" เป็นวัสดุแฝงของกริ๊กต๊อก MagSafe — ขายทุกชิ้นต้องหักออก 1 ชิ้น
 *
 *   node --conditions=react-server --import tsx scripts/griptok-magsafe-clear-bom.mts            (ดูเฉย ๆ)
 *   node --conditions=react-server --import tsx scripts/griptok-magsafe-clear-bom.mts --apply
 *
 * ทำไม (เจ้าของร้านสั่ง 21 ก.ย. 69): หมวด Griptok มีแต่ SKU ทรงกลม/ทรงรี ที่ยังไม่ผูกกับอะไรเลย
 * แต่ของจริงขายกริ๊กต๊อก MagSafe 1 ชิ้นก็กินตัว Griptok ใสไป 1 ชิ้นทุกครั้ง ไม่ว่าลูกค้าเลือกทรงไหน
 * ตัวเลือกให้ลูกค้าเลือกไม่มีช่องนี้ → เข้าเส้นทาง "วัสดุแฝง" (bomFor) ไม่ใช่การผูกตัวเลือก
 *
 * เดินผ่าน saveStockItem + setBom ตัวเดียวกับปุ่มในหน้า /admin/stock (กติกาออกรหัส/ชื่อพ้องอยู่ที่นั่น)
 * ตัดจริงที่ cutStockForOrder ตอนใบเปลี่ยนเป็น "ชำระแล้ว" · ยกเลิกใบ = คืนให้เอง
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string];
    })
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

const { codeSlug, listStockItems, saveStockItem, setBom } = await import("../src/lib/server/stock");

const PRODUCT_ID = "griptok-magsafe";
const NAME = "Griptok ใส";
const PER = 1; // ชิ้นต่อกริ๊กต๊อก 1 ตัว
const APPLY = process.argv.includes("--apply");

const items = await listStockItems();
const already = items.find((i) => (i.bomFor?.[PRODUCT_ID] ?? 0) > 0 && i.name.trim() === NAME);
if (already) {
  console.log(`มีอยู่แล้ว — ${already.code} "${already.name}" ตัด ${already.bomFor![PRODUCT_ID]} ชิ้นต่อการขาย 1 ชิ้น · ไม่ต้องทำอะไร`);
  process.exit(0);
}

// ชื่อซ้ำ = ใช้ตัวเดิม ไม่สร้างใหม่ (กัน SKU งอก)
const existing = items.find((i) => i.name.trim() === NAME || (i.aliases ?? []).some((a) => a.trim() === NAME));
console.log(existing ? `ใช้ SKU เดิม ${existing.code} "${existing.name}"` : `สร้าง SKU ใหม่ "${NAME}" (รหัสชุด P-${codeSlug(PRODUCT_ID)}-B…)`);
console.log(`${APPLY ? "ตั้ง " : "จะตั้ง"} เป็นวัสดุแฝงของ ${PRODUCT_ID} — ขาย 1 ชิ้น หัก ${PER} ชิ้น (ทั้งทรงกลมและทรงรี)`);
if (!APPLY) { console.log("\n(ดูเฉย ๆ — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

const sku = existing ?? (await saveStockItem({
  name: NAME,
  unit: "ชิ้น",
  family: "Griptok",
  category: "อุปกรณ์มือถือ",
  codePrefix: `P-${codeSlug(PRODUCT_ID)}-B`,
}));
const item = await setBom(sku.id, PRODUCT_ID, PER);
if (!item) { console.log("⛔ ผูกไม่สำเร็จ — ไม่พบ SKU"); process.exit(1); }
console.log(`✅ ${item.code} "${item.name}" · ตัด ${item.bomFor?.[PRODUCT_ID]} ชิ้นต่อการขาย 1 ชิ้น · ยอดคงเหลือตอนนี้ ${item.balance}`);
process.exit(0);
