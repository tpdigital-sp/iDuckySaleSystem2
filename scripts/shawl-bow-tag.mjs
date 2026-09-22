#!/usr/bin/env node
/**
 * ผ้าคลุมไหล่ (shawl) — เพิ่มของเสริม "แท็กโบว์เกาหลี" ขนาด 2 × 2.5 ซม. ผืนละ +฿3
 *
 *   node scripts/shawl-bow-tag.mjs           (ดูก่อน ไม่เขียน DB)
 *   node scripts/shawl-bow-tag.mjs --write   (เขียนจริง + อ่านกลับเทียบ)
 *
 * เจ้าของร้านสั่ง 22 ก.ย. 69: "แท็กโบว์เกาหลี ขนาด 2*2.5 ซม เพิ่ม 3 บาทต่อชิ้น"
 *
 * ทรงกลุ่ม = แบบเดียวกับของเสริมตัวอื่นทั้งเว็บ (Acrylic Kit กลุ่ม "แม่เหล็ก" · Premium Bag "ป้ายแท็ก")
 *   display "multi" + collapsible → หน้าสินค้าโชว์แค่แถวสวิตช์ "ไม่ใช้ก็ข้ามได้ · เปิดแล้วเริ่ม +฿3"
 *   ไม่ติ๊ก = ไม่คิดเงิน · ติ๊ก = +฿3 ต่อผืน ทุกช่วงจำนวน (ไม่ตั้ง extraFromQty)
 *   ดู [[iducky-addon-collapsible]]
 *
 * ⚠️ แกนตารางราคาของใบนี้คือกลุ่ม "ขนาด" (pricing.driverLabels ทั้งใบหลักและทุกเรท)
 *    ชื่อกลุ่มใหม่ต้องไม่ไปชน ไม่งั้นราคาหล่นไป product.price ([[iducky-price-driver-trap]])
 *    สคริปต์เช็คให้ก่อนเขียน + อ่านกลับเช็คซ้ำ
 *
 * รันซ้ำได้: เจอกลุ่มชื่อเดียวกันแล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";

const PRODUCT_ID = "shawl";
const GROUP = "แท็กโบว์เกาหลี";
const CHOICE = "ติดแท็กโบว์เกาหลี ขนาด 2 × 2.5 ซม.";
const EXTRA = 3;
const SECTION = "2. ของเสริม";
const WRITE = process.argv.includes("--write");

const group = {
  label: GROUP,
  display: "multi",
  collapsible: true,
  section: SECTION,
  note: `แท็กโบว์เกาหลี ขนาด 2 × 2.5 ซม. — ติ๊กเลือกแล้วคิดเพิ่มผืนละ ฿${EXTRA} (ทุกช่วงจำนวน) · ไม่ต้องการก็ข้ามได้`,
  choices: [{ name: CHOICE, extra: EXTRA }],
};

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// ── ยามก่อนเขียน ────────────────────────────────────────────────────
const drivers = new Set([
  ...(data.pricing?.driverLabels ?? []),
  ...(data.priceRates ?? []).flatMap((r) => r.pricing?.driverLabels ?? []),
]);
if (drivers.has(GROUP)) { console.error(`ชื่อกลุ่ม "${GROUP}" ไปชนแกนตารางราคา — หยุด`); process.exit(1); }

const before = (data.options ?? []).map((o) => `${o.label}(${o.choices?.length ?? 0})`);
const pricingBefore = JSON.stringify(data.pricing);
const ratesBefore = JSON.stringify(data.priceRates);
console.log("กลุ่มเดิม:", before.join(" · "));
console.log("จะเพิ่ม/ทับ:", JSON.stringify(group, null, 1));
if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write ถึงเขียน DB)"); process.exit(0); }

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dumpDir = `.cache/${PRODUCT_ID}`;
mkdirSync(dumpDir, { recursive: true });
const dump = `${dumpDir}/before-bow-tag.json`;
if (existsSync(dump)) console.log("มีไฟล์สำรองอยู่แล้ว ไม่เขียนทับ:", dump);
else { writeFileSync(dump, JSON.stringify(data, null, 2)); console.log("สำรองข้อมูลเดิมไว้ที่", dump); }

const options = data.options ?? [];
const at = options.findIndex((o) => o.label === GROUP);
if (at >= 0) options[at] = group; else options.push(group);
const wantGroups = at >= 0 ? before.length : before.length + 1;
data.options = options;
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ──────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === GROUP);
const grp = (label) => got.find((o) => o.label === label);
const fails = [
  [got.filter((o) => o.label === GROUP).length === 1, "กลุ่มแท็กโบว์ซ้ำ/หาย"],
  [g?.display === "multi", "ไม่ใช่กลุ่มติ๊กหลายอย่าง"],
  [g?.collapsible === true, "ไม่ได้ปิดสวิตช์ไว้ก่อน"],
  [g?.choices?.length === 1, "จำนวนตัวเลือกไม่ใช่ 1"],
  [g?.choices?.[0]?.name === CHOICE, "ชื่อตัวเลือกไม่ตรง"],
  [g?.choices?.[0]?.extra === EXTRA, `+฿ ไม่ใช่ ${EXTRA}`],
  [!g?.extraFromQty, "ไปตั้งเกณฑ์จำนวน (ต้องคิดทุกช่วง)"],
  [g?.section === SECTION, "ชื่อชุดไม่ตรง"],
  // กลุ่มเดิมต้องอยู่ครบ ([[iducky-option-group-loss-guard]])
  [grp("ขนาด")?.choices?.length === 3, 'กลุ่ม "ขนาด" ไม่ครบ 3 ตัวเลือก'],
  [grp("ผ้า")?.choices?.length === 2, 'กลุ่ม "ผ้า" ไม่ครบ 2 เนื้อ'],
  [grp("สีไหมเย็บชิ้นงาน")?.choices?.length === 13, "สีไหมไม่ครบ 13 สี"],
  [got.length === wantGroups, "จำนวนกลุ่มเปลี่ยนผิดคาด"],
  // กันกับดักราคา
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(GROUP)), "ชื่อกลุ่มไปชนแกนตารางราคาของเรท"],
  [JSON.stringify(back.data.pricing) === pricingBefore, "ตารางราคาใบหลักเปลี่ยน"],
  [JSON.stringify(back.data.priceRates) === ratesBefore, "ตารางราคาของเรทเปลี่ยน"],
  [back.data.priceMin === 170 && back.data.priceMax === 600, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ เพิ่มกลุ่ม "${GROUP}" (${CHOICE} +฿${EXTRA}/ผืน) แล้ว · อ่านกลับตรงทุกข้อ`);
console.log("  กลุ่มตอนนี้:", got.map((o) => `${o.label}(${o.choices?.length ?? 0})`).join(" · "));
console.log("  savedAt =", back.data.savedAt);
