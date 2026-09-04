#!/usr/bin/env node
/**
 * กระเป๋าใส่พวงกุญแจ (otherbag-8) — ภาพประจำตัวเลือกกลุ่ม "ผ้า" · ผู้ใช้สั่ง 3 ก.ย. 69
 *
 *   node scripts/keycover-fabric-images.mjs           (ดูว่าจะเขียนอะไร ยังไม่แตะ DB)
 *   node scripts/keycover-fabric-images.mjs --write   (เขียน + อ่านกลับเทียบ)
 *
 * ผู้ใช้ชี้ภาพจากแกลเลอรีของสินค้าเองมา 2 ใบ:
 *   ภาพที่ 4 (ตัวเนื้อเรียบ นุ่ม ไม่มีร่อง)      → ตัวเลือก "ขนสั้น"
 *   ภาพที่ 1 (ตัวมีร่องแนวตั้งถี่ ๆ ทั้งใบ)      → ตัวเลือก "ลูกฟูก"
 *
 * ใช้ URL ของภาพในแกลเลอรีตรง ๆ (ไม่อัปไฟล์ใหม่) เพราะ ProductDetail:562 จะเติมภาพประจำ
 * ตัวเลือกที่ "ไม่มีในแกลเลอรี" เข้าไปอีกช่อง — ชี้ที่ภาพเดิมแล้วแกลเลอรีคงที่ 4 ใบ
 * และกดการ์ดแล้ว jumpToImage หาเจอ = สลับภาพใหญ่ไปใบนั้นให้เลย
 *
 * รันซ้ำได้ (เขียนทับค่าเดิมของ 2 ตัวเลือกนี้เท่านั้น)
 * ⚠️ เขียนตรงไม่ผ่าน API = ไม่มี product_revisions — ดัมป์ของเดิมลง .cache/otherbag-8/ ก่อนเสมอ
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "otherbag-8";
const GROUP = "ผ้า";
/** ตัวเลือก → เลขลำดับภาพในแกลเลอรี (1-based) ตามที่ผู้ใช้ชี้มา */
const PICKS = { "ขนสั้น": 4, "ลูกฟูก": 1 };

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

mkdirSync(".cache/otherbag-8", { recursive: true });
writeFileSync(".cache/otherbag-8/before-fabric-images.json", JSON.stringify(data, null, 2));

const images = data.images ?? [];
const opt = (data.options ?? []).find((o) => o.label === GROUP);
if (!opt) { console.error(`ไม่เจอกลุ่ม "${GROUP}" — หยุดก่อน`); process.exit(1); }

const plan = [];
for (const [name, no] of Object.entries(PICKS)) {
  const c = (opt.choices ?? []).find((x) => x.name === name);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${name}" ในกลุ่ม ${GROUP} — ชื่ออาจถูกแก้ ตรวจก่อน`); process.exit(1); }
  const src = images[no - 1]?.src;
  if (!src) { console.error(`ไม่เจอภาพแกลเลอรีใบที่ ${no} (มี ${images.length} ใบ) — ลำดับภาพอาจถูกสลับ ตรวจก่อน`); process.exit(1); }
  plan.push([c, name, no, src]);
}

console.log(`สินค้า: ${PRODUCT_ID} · กลุ่ม "${GROUP}" (display=${opt.display}) · แกลเลอรี ${images.length} ใบ`);
for (const [c, name, no, src] of plan) console.log(`  ${name} ← ภาพที่ ${no}  ${src}  (เดิม: ${c.imageSrc ?? "ไม่มี"})`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write)"); process.exit(0); }

for (const [c, , , src] of plan) c.imageSrc = src;
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = (back.data.options ?? []).find((o) => o.label === GROUP);
const fails = [
  [g?.choices?.length === 2, "จำนวนตัวเลือกในกลุ่มผ้าเปลี่ยน"],
  [(back.data.images ?? []).length === images.length, "จำนวนภาพแกลเลอรีเปลี่ยน (ห้ามเกิด)"],
  ...plan.map(([, name, , src]) => [g?.choices?.find((c) => c.name === name)?.imageSrc === src, `ภาพ "${name}" ไม่ลง`]),
  [back.data.savedAt === data.savedAt, "savedAt ไม่ตรง — โดนเขียนแทรก รันซ้ำ"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" มีภาพครบ 2 ตัวเลือก · แกลเลอรียัง ${images.length} ใบ · savedAt =`, back.data.savedAt);
