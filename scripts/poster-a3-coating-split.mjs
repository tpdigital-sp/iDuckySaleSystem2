#!/usr/bin/env node
/**
 * POSTER (poster-a3) — แยกปุ่ม "เคลือบเงา / เคลือบด้าน" ออกจากกัน + เพิ่มลายเคลือบพิเศษของด้านหลัง
 *
 *   node scripts/poster-a3-coating-split.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/poster-a3-coating-split.mjs --write
 *
 * งานที่ร้านสั่ง 4 ก.ย. 69:
 *   1) "แยกปุ่ม เงา และ ด้าน ออกจากกัน" — เดิมต้องเลือก 2 ชั้น (เคลือบเงา / ด้าน → แล้วค่อยเลือก เงา/ด้าน)
 *      และปุ่ม เงา/ด้าน ใช้รูปงานจริงที่ย่อแล้วดูเหมือนกัน → ตัดเหลือชั้นเดียว + ภาพวาดที่ต่างกันชัด
 *   2) "เคลือบพิเศษ (ด้านหลัง) ไม่มีตัวเลือกพิเศษให้เลือก" — ด้านหน้ามีกลุ่มเลือกลาย ด้านหลังไม่มี
 *
 * โครงใหม่ (หน้า/หลังสมมาตรกัน):
 *   เคลือบ (เฉพาะด้านหน้า) : ไม่เคลือบ · เคลือบเงา · เคลือบด้าน · เคลือบพิเศษ        ← แกนราคาที่ 2
 *     └ ลายเคลือบพิเศษ (เดิมชื่อ "เคลือบ") : กลิตเตอร์ · ทราย · hologram ทั้ง 8      ← โผล่เมื่อเลือกเคลือบพิเศษ
 *   เคลือบด้านหลัง : ไม่เคลือบด้านหลัง · เคลือบเงา (ด้านหลัง) +10 · เคลือบด้าน (ด้านหลัง) +10 · เคลือบพิเศษ (ด้านหลัง) +30
 *     └ ลายเคลือบพิเศษ (ด้านหลัง) : ลายชุดเดียวกับด้านหน้า (กลุ่มใหม่)               ← โผล่เมื่อเลือกเคลือบพิเศษ (ด้านหลัง)
 *
 * ⚠️ "เคลือบ (เฉพาะด้านหน้า)" เป็นแกนตารางราคา (driverLabels ที่ 2) — คีย์ "…│เคลือบเงา / ด้าน"
 *    ต้องถูกแตกเป็น "…│เคลือบเงา" และ "…│เคลือบด้าน" ราคาเท่าเดิมทั้งคู่ ไม่งั้นราคาหล่นไป product.price เงียบ ๆ
 * ⚠️ ต้องรัน scripts/poster-a3-coating-face-art.mjs --write ก่อน (สคริปต์นี้เช็คว่าไฟล์ภาพขึ้นคลังแล้ว)
 * รันซ้ำได้: ถ้าโครงเป็นแบบใหม่อยู่แล้วจะบอกว่า "ทำไว้แล้ว" แล้วออก ไม่เขียนซ้ำ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "poster-a3";
const EXPECT_NAME = "POSTER";

const FRONT = "เคลือบ (เฉพาะด้านหน้า)";
const FRONT_OLD = "เคลือบเงา / ด้าน";
const GLOSS = "เคลือบเงา";
const MATTE = "เคลือบด้าน";
const SPECIAL = "เคลือบพิเศษ";
const CHILD_OLD = "เคลือบ";
const CHILD_NEW = "ลายเคลือบพิเศษ";
const BACK = "เคลือบด้านหลัง";
const BACK_OLD = "เคลือบเงา/ด้าน (ด้านหลัง)";
const BACK_GLOSS = "เคลือบเงา (ด้านหลัง)";
const BACK_MATTE = "เคลือบด้าน (ด้านหลัง)";
const BACK_SPECIAL = "เคลือบพิเศษ (ด้านหลัง)";
const BACK_CHILD = "ลายเคลือบพิเศษ (ด้านหลัง)";
const SECTION_COAT = "3. เคลือบผิว";

const DESC_GLOSS = "ฟิล์มใสผิวมัน สะท้อนแสง สีสดจัดขึ้น · กันรอย กันชื้น";
const DESC_MATTE = "ฟิล์มใสผิวด้าน ไม่สะท้อนแสง สีนุ่มตา ลายนิ้วมือไม่ติด · กันรอย กันชื้น";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const BASE = pick("NEXT_PUBLIC_SUPABASE_URL");
const sb = createClient(BASE, pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const die = (m) => { console.error("✗ " + m); process.exit(1); };
const img = (f) => `${BASE}/storage/v1/object/public/product-images/products/${ID}/${f}`;
const URL_GLOSS = img("coat-gloss-v1.jpg");
const URL_MATTE = img("coat-matte-v1.jpg");

/* ภาพต้องขึ้นคลังแล้วจริง ๆ (กันเขียน imageSrc ที่ชี้ไฟล์ไม่มีอยู่) */
for (const u of [URL_GLOSS, URL_MATTE]) {
  const r = await fetch(u, { method: "HEAD" });
  if (!r.ok) die(`ยังไม่มีไฟล์ภาพในคลัง: ${u}\n  → รัน node scripts/poster-a3-coating-face-art.mjs --write ก่อน`);
}

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = row.data;
const opts = d.options ?? [];
const group = (label) => opts.find((o) => o.label === label);

if (group(GLOSS) === undefined && group(FRONT)?.choices.some((c) => c.name === GLOSS) && group(BACK_CHILD)) {
  console.log("โครงเป็นแบบใหม่อยู่แล้ว — ไม่ต้องทำอะไร");
  process.exit(0);
}

// ── 1) กลุ่มหน้า: แตก "เคลือบเงา / ด้าน" เป็น 2 ตัว ────────────────────
const front = group(FRONT) ?? die(`ไม่พบกลุ่ม ${FRONT}`);
const atOld = front.choices.findIndex((c) => c.name === FRONT_OLD);
if (atOld < 0) die(`ไม่พบตัวเลือก "${FRONT_OLD}" ในกลุ่ม ${FRONT} (อาจแตกไปแล้ว)`);
const oldChoice = front.choices[atOld];
front.choices.splice(atOld, 1,
  { ...oldChoice, name: GLOSS, desc: DESC_GLOSS, imageSrc: URL_GLOSS },
  { ...oldChoice, name: MATTE, desc: DESC_MATTE, imageSrc: URL_MATTE });

// ── 2) ตารางราคา: แตกคอลัมน์ "เคลือบเงา / ด้าน" เป็นสองคอลัมน์ ราคาเท่าเดิม ──
const cells = d.pricing?.cells ?? die("ไม่พบ pricing.cells");
const moved = [];
for (const key of Object.keys(cells)) {
  if (!key.endsWith(`│${FRONT_OLD}`)) continue;
  const head = key.slice(0, -FRONT_OLD.length);
  for (const name of [GLOSS, MATTE]) {
    if (cells[head + name]) die(`มีคีย์ราคา "${head + name}" อยู่แล้ว — หยุดกันเขียนทับ`);
    cells[head + name] = [...cells[key]];
  }
  delete cells[key];
  moved.push(key);
}
if (!moved.length) die(`ไม่พบคีย์ราคาที่ลงท้ายด้วย "│${FRONT_OLD}"`);

// ── 3) กลุ่มลูกด้านหน้า: เหลือเฉพาะลายพิเศษ + เปลี่ยนชื่อให้ตรงหน้าที่ ────
const child = group(CHILD_OLD) ?? die(`ไม่พบกลุ่ม ${CHILD_OLD}`);
const specials = child.choices.filter((c) => c.name !== "เงา" && c.name !== "ด้าน");
if (specials.length !== child.choices.length - 2) die(`กลุ่ม ${CHILD_OLD} ไม่มีตัวเลือก เงา/ด้าน ครบ 2 ตัว`);
child.label = CHILD_NEW;
child.choices = specials;
child.showWhen = { label: FRONT, choices: [SPECIAL] };

// ── 4) กลุ่มด้านหลัง: แตกเงา/ด้าน + เพิ่มกลุ่มเลือกลายพิเศษของด้านหลัง ────
const back = group(BACK) ?? die(`ไม่พบกลุ่ม ${BACK}`);
const atBackOld = back.choices.findIndex((c) => c.name === BACK_OLD);
if (atBackOld < 0) die(`ไม่พบตัวเลือก "${BACK_OLD}"`);
const oldBack = back.choices[atBackOld];
back.choices.splice(atBackOld, 1,
  { ...oldBack, name: BACK_GLOSS, desc: DESC_GLOSS, imageSrc: URL_GLOSS },
  { ...oldBack, name: BACK_MATTE, desc: DESC_MATTE, imageSrc: URL_MATTE });
if (!back.choices.some((c) => c.name === BACK_SPECIAL)) die(`ไม่พบตัวเลือก "${BACK_SPECIAL}"`);

if (group(BACK_CHILD)) die(`มีกลุ่ม "${BACK_CHILD}" อยู่แล้ว`);
/* ลายชุดเดียวกับด้านหน้าเป๊ะ (ชื่อ+ภาพ) — ค่าบริการอยู่ที่ตัวแม่แล้ว ตัวลายไม่คิดเพิ่ม */
const backChild = {
  label: BACK_CHILD,
  section: SECTION_COAT,
  showWhen: { label: BACK, choices: [BACK_SPECIAL] },
  choices: specials.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}) })),
};
opts.splice(opts.findIndex((o) => o.label === BACK) + 1, 0, backChild);

// ── 5) กฎ: ทิ้งกฎล็อกลูกของ "เคลือบเงา / ด้าน" · ชี้กฎลายพิเศษไปชื่อกลุ่มใหม่ ──
const rules = d.rules ?? [];
const before = rules.length;
d.rules = rules
  .filter((r) => !(r.when?.label === FRONT && r.when?.choice === FRONT_OLD && r.limit?.label === CHILD_OLD))
  .map((r) => (r.limit?.label === CHILD_OLD ? { ...r, limit: { ...r.limit, label: CHILD_NEW } } : r));
if (d.rules.length !== before - 1) die(`คาดว่าจะทิ้งกฎ 1 ข้อ แต่ได้ ${before - d.rules.length}`);
if (d.rules.some((r) => r.limit?.label === CHILD_OLD || r.when?.label === CHILD_OLD)) die(`ยังมีกฎอ้างกลุ่มชื่อเก่า "${CHILD_OLD}"`);

// ── 6) ข้อความ SEO ที่ไล่รายชื่อตัวเลือก (สร้างอัตโนมัติ) — สร้างใหม่ให้ตรงโครงปัจจุบัน ──
/* สูตรเดียวกับ autoSeoOf variant 0 ใน src/lib/auto-seo.ts: "label: ชื่อ 6 ตัวแรก" ต่อกันด้วย " · " */
const optLine = opts
  .filter((o) => o.label && o.choices?.length)
  .map((o) => `${o.label}: ${o.choices.map((c) => c.name.trim()).filter(Boolean).slice(0, 6).join(", ")}`)
  .join(" · ");
const faq = (d.seo?.faqs ?? []).find((f) => /มีชนิดกระดาษอะไรให้เลือก/.test(f.q ?? ""));
if (faq) { faq.a = optLine; console.log("· อัปเดตข้อความ FAQ ที่ไล่รายชื่อตัวเลือกให้ตรงโครงใหม่"); }

// ── สรุปก่อนเขียน ────────────────────────────────────────────────────
console.log("\nกลุ่มเคลือบหลังแก้:");
for (const o of opts.filter((o) => /เคลือบ/.test(o.label))) {
  const when = o.showWhen ? `   ← แสดงเมื่อ ${o.showWhen.label} = ${o.showWhen.choices.join("/")}` : "";
  console.log(`  ${o.label}${when}`);
  for (const c of o.choices) console.log(`     · ${c.name}${c.extra ? ` +฿${c.extra}` : ""}${c.imageSrc ? "  🖼" : ""}`);
}
console.log(`\nคีย์ราคาที่แตก: ${moved.length} คีย์ → ${GLOSS} / ${MATTE} (ราคาเท่ากันทั้งคู่)`);
console.log(`กฎเหลือ ${d.rules.length} ข้อ (เดิม ${before})`);

if (!WRITE) { console.log("\n(ยังไม่เขียน — รันด้วย --write)"); process.exit(0); }

d.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (updErr || !upd?.length) die(`update พัง/0 แถว ${updErr?.message ?? ""}`);

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ──────────────────
const { data: back2 } = await sb.from("products").select("data").eq("id", ID).single();
const g = (l) => back2.data.options.find((o) => o.label === l);
const names = (l) => (g(l)?.choices ?? []).map((c) => c.name);
if (!names(FRONT).includes(GLOSS) || !names(FRONT).includes(MATTE) || names(FRONT).includes(FRONT_OLD))
  die(`กลุ่ม ${FRONT} ไม่ตรงที่ตั้งใจ: ${names(FRONT).join(", ")}`);
if (g(CHILD_OLD)) die(`ยังมีกลุ่มชื่อเก่า "${CHILD_OLD}"`);
if (names(CHILD_NEW).includes("เงา") || names(CHILD_NEW).includes("ด้าน")) die(`กลุ่ม ${CHILD_NEW} ยังมี เงา/ด้าน ค้าง`);
if (!names(BACK).includes(BACK_GLOSS) || !names(BACK).includes(BACK_MATTE) || names(BACK).includes(BACK_OLD))
  die(`กลุ่ม ${BACK} ไม่ตรงที่ตั้งใจ: ${names(BACK).join(", ")}`);
if (names(BACK_CHILD).join("|") !== names(CHILD_NEW).join("|")) die(`ลายด้านหลังไม่ตรงกับด้านหน้า`);
/* ราคา: ทุกกระดาษต้องมีคอลัมน์ใหม่ครบ และเท่ากับราคาเดิมของ "เคลือบเงา / ด้าน" */
const backCells = back2.data.pricing.cells;
for (const key of moved) {
  const head = key.slice(0, -FRONT_OLD.length);
  if (backCells[key]) die(`คีย์เก่ายังอยู่: ${key}`);
  const a = backCells[head + GLOSS];
  const b = backCells[head + MATTE];
  if (!a || !b) die(`คีย์ราคาใหม่หาย: ${head + GLOSS} / ${head + MATTE}`);
  if (a.join() !== b.join() || a.join() !== cells[head + GLOSS].join()) die(`ราคาไม่ตรงที่ตั้งใจ: ${head}`);
}
/* ตัวเลือกในแกนราคาต้องมีคอลัมน์ราคาครบทุกตัว (ยกเว้น "ไม่เคลือบ" ที่มีอยู่เดิม) */
for (const paper of names("ชนิดกระดาษ"))
  for (const coat of names(FRONT))
    if (!backCells[`${paper}│${coat}`]) die(`ไม่มีราคาสำหรับ ${paper}│${coat}`);
console.log(`\n✓ แยก เงา/ด้าน แล้ว · ลายเคลือบพิเศษมีทั้งหน้า+หลัง · ราคาครบทุกช่อง · กลุ่มทั้งหมด ${back2.data.options.length} · savedAt =`, back2.data.savedAt);
