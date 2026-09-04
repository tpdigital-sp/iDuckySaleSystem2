#!/usr/bin/env node
/**
 * BANNER (banner-artcard · /products/BANNER) — ย้ายกลุ่ม "การตัด" ขึ้นไปต่อจาก "ชนิดกระดาษ"
 *
 *   node scripts/banner-cut-group-order.mjs            (โชว์ลำดับก่อน-หลัง เฉย ๆ)
 *   node scripts/banner-cut-group-order.mjs --write    (เขียน DB + อ่านกลับเทียบ)
 *
 * ทำไม: ลูกค้าเลือกกระดาษเสร็จควรบอกรูปทรง/การตัดต่อเลย (เป็นตัวคุมว่า 1 แผ่นได้กี่ชิ้น)
 * แล้วค่อยไปเรื่องผิว-เคลือบ ตามที่ร้านสั่ง (4 ก.ย. 69)
 *
 * ⚠️ "การตัด" มีกลุ่มลูกห้อยอยู่ 5 กลุ่ม (showWhen ชี้มาที่การตัด หรือชี้ต่อกันเป็นทอด ๆ)
 *    ต้องยกไปทั้งบล็อกตามลำดับเดิม ไม่งั้นเลือก "ไดคัทตามขนาด" แล้วช่อง "ขนาดตัด"
 *    จะไปโผล่ท้ายหน้าห่างจากตัวแม่ (กลุ่ม display=input ก็คือกล่อง 📐 ที่เรียงตามลำดับกลุ่มใน DB)
 *
 * ไม่แตะ imageSrc / choices / ราคา — สลับลำดับ options อย่างเดียว
 * (driverLabels = ชนิดกระดาษ × เคลือบ (เฉพาะด้านหน้า) อ้างด้วย "ชื่อกลุ่ม" ไม่ใช่ index จึงไม่กระทบ)
 * รันซ้ำได้: ถ้าเรียงถูกอยู่แล้วจะไม่เขียนทับ
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const PRODUCT_ID = "banner-artcard";
const ANCHOR = "ชนิดกระดาษ";              // ย้ายไปวางต่อจากกลุ่มนี้
const HEAD = "การตัด";                     // หัวบล็อกที่จะย้าย
/** ลูกของ "การตัด" ตามลำดับที่ต้องคงไว้ — ชี้ตรง หรือชี้ผ่าน "ขนาดตัด" อีกที */
const BLOCK = [HEAD, "ขนาดตัด", "ขนาดตัด (กว้าง)", "ขนาดตัด (สูง)", "ขนาดไดคัท (กว้าง)", "ขนาดไดคัท (สูง)"];

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (error) { console.error(error); process.exit(1); }
const data = row.data;
const before = data.options ?? [];

console.log("ลำดับเดิม:");
before.forEach((g, i) => console.log(` ${String(i).padStart(2)} ${g.label}`));

// ── จัดลำดับใหม่ ─────────────────────────────────────────────────────
const missing = BLOCK.filter((l) => !before.some((g) => g.label === l));
if (missing.length) { console.error("ไม่เจอกลุ่ม:", missing); process.exit(1); }
if (!before.some((g) => g.label === ANCHOR)) { console.error(`ไม่เจอกลุ่ม "${ANCHOR}"`); process.exit(1); }

const block = BLOCK.map((l) => before.find((g) => g.label === l));
const rest = before.filter((g) => !BLOCK.includes(g.label));
const at = rest.findIndex((g) => g.label === ANCHOR);
const after = [...rest.slice(0, at + 1), ...block, ...rest.slice(at + 1)];

// กันกลุ่มหาย/ซ้ำ — ต้องเป็นชุดเดิมเป๊ะ แค่สลับที่
if (after.length !== before.length) { console.error("จำนวนกลุ่มเพี้ยน", before.length, "→", after.length); process.exit(1); }
const key = (a) => a.map((g) => g.label).sort().join("│");
if (key(after) !== key(before)) { console.error("รายชื่อกลุ่มไม่ตรงของเดิม"); process.exit(1); }

console.log("\nลำดับใหม่:");
after.forEach((g, i) => console.log(` ${String(i).padStart(2)} ${g.label}${BLOCK.includes(g.label) ? "   ← ย้าย" : ""}`));

// ทุกกลุ่มที่มี showWhen ต้องอยู่ "หลัง" กลุ่มที่มันอ้างถึง ไม่งั้นช่องเสริมไปโผล่ก่อนตัวแม่
const pos = new Map(after.map((g, i) => [g.label, i]));
for (const [i, g] of after.entries()) {
  const dep = g.showWhen?.label;
  if (dep && !(pos.get(dep) < i)) { console.error(`ลำดับพัง: "${g.label}" อ้าง "${dep}" ที่อยู่ตำแหน่ง ${pos.get(dep)}`); process.exit(1); }
}

const order = (a) => a.map((g) => g.label).join("│");
if (order(after) === order(before)) {
  console.log("\n(เรียงถูกอยู่แล้ว — ไม่ต้องเขียน)");
  process.exit(0);
}

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write)"); process.exit(0); }

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
mkdirSync(`.cache/${PRODUCT_ID}`, { recursive: true });
writeFileSync(`.cache/${PRODUCT_ID}/backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

data.options = after;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ──────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = order(back.data.options);
if (got !== order(after)) { console.error("อ่านกลับไม่ตรง!\n", got); process.exit(1); }
// ตัวเลือก/รูป/ราคาต้องไม่หายไปกับการสลับลำดับ
for (const g of before) {
  const b = back.data.options.find((o) => o.label === g.label);
  if ((b.choices?.length ?? 0) !== (g.choices?.length ?? 0)) { console.error(`ตัวเลือกในกลุ่ม "${g.label}" หาย`); process.exit(1); }
  const imgs = (g.choices ?? []).filter((c) => c.imageSrc).length;
  const imgsBack = (b.choices ?? []).filter((c) => c.imageSrc).length;
  if (imgs !== imgsBack) { console.error(`imageSrc ในกลุ่ม "${g.label}" หาย`); process.exit(1); }
}
if (Object.keys(back.data.pricing?.cells ?? {}).length !== Object.keys(row.data.pricing?.cells ?? {}).length) { console.error("cells ราคาเพี้ยน"); process.exit(1); }
console.log("\n✓ ย้ายบล็อก \"การตัด\" ขึ้นต่อจาก \"ชนิดกระดาษ\" แล้ว · savedAt =", back.data.savedAt);
