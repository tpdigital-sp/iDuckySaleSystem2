#!/usr/bin/env node
/**
 * พวงกุญแจอะคริลิค (keyring-copy-copy · slug "keyring") — เพิ่มกลุ่ม "รูปแบบการห้อย"
 * ให้เหมือนสินค้า "พวงกุญแจ หลายชิ้นใน 1 พวง" (keyring-multi-charm)
 *
 *   node scripts/keyring-hang-style.mjs           # ดูก่อนว่าจะแก้อะไร (ไม่เขียนจริง)
 *   node scripts/keyring-hang-style.mjs --write   # เขียนลงฐานข้อมูล (+ ก๊อปภาพการ์ด 3 ใบเข้าโฟลเดอร์ของสินค้านี้)
 *
 * สิ่งที่ทำ:
 *   1. ก๊อปภาพการ์ด 3 ใบ (hang-side / hang-stack / hang-custom v1) จากโฟลเดอร์ storage ของ
 *      keyring-multi-charm มาไว้โฟลเดอร์ของสินค้านี้ — สินค้าไม่ต้องพึ่งไฟล์ของสินค้าอื่น
 *   2. เพิ่มกลุ่ม "รูปแบบการห้อย" (display cards การ์ดมีภาพ 3 ใบ) วางถัดจากกลุ่ม "ติ่งห้อย"
 *      โผล่เมื่อ **ติ๊กติ่งห้อยไว้** เท่านั้น — สินค้านี้ตัวหลักมีชิ้นเดียว ไม่มีติ่งห้อยก็ไม่มีอะไรให้จัดผัง
 *      (ต่างจากสินค้าต้นแบบที่โผล่เมื่อพวงมี 2 ชิ้นขึ้นไป **หรือ** ติ๊กติ่งห้อย)
 *   3. เปิด artworkConsult (บังคับคุยผังกับแอดมินก่อนสั่ง) เฉพาะตอนเลือก "แบบอื่น ๆ (ติดต่อแอดมิน)"
 *   4. ข้อความประกอบ: บรรทัดในแท็บ "Add-on / อุปกรณ์เสริม" + คำถาม SEO (idempotent)
 *
 * รันซ้ำได้ — กลุ่มเดิมถูกอัปทับที่เดิม ไม่เกิดกลุ่มซ้ำ
 * ⚠️ กลุ่มนี้ไม่ใช่แกนตารางราคา (ไม่แตะ pricing/priceRates) — ห้ามเอาไปใส่ driverLabels
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-copy-copy";
const SRC_ID = "keyring-multi-charm";
const CHARM_LABEL = "ติ่งห้อย";
const HANG_LABEL = "รูปแบบการห้อย";
const HANG_ADMIN = "แบบอื่น ๆ (ติดต่อแอดมิน)";
const BUCKET = "product-images";
const FILES = ["hang-side-v1.jpg", "hang-stack-v1.jpg", "hang-custom-v1.jpg"];
const ART_BASE = `https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/${BUCKET}/products/${ID}`;

const HANG_TAB_HEAD = "• รูปแบบการห้อยติ่งห้อย";
const HANG_TAB_LINE =
  `${HANG_TAB_HEAD} (ฟรี ไม่มีค่าใช้จ่ายเพิ่ม): ห้อยด้านข้าง · ห้อยต่อ ๆ กันลงมา · ` +
  "แบบอื่น ๆ ทักแอดมินตกลงผังก่อนสั่ง";
const HANG_FAQ = {
  q: "ติ่งห้อยเลือกวิธีห้อยได้ไหม?",
  a: "ได้ครับ พอติ๊กติ่งห้อยแล้วจะมีให้เลือกในหน้าสั่งซื้อ 2 แบบ: ห้อยด้านข้าง (ติ่งห้อยมีห่วงของตัวเอง เกี่ยวรวมที่ห่วงหลักเดียวกับตัวพวงกุญแจ) หรือห้อยต่อ ๆ กันลงมาเป็นสาย — ไม่มีค่าใช้จ่ายเพิ่ม อยากได้ผังแบบอื่นทักแชทคุยกับแอดมินก่อนสั่งได้เลย",
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── ดึงสดจาก DB เสมอ (ห้าม dump เก่า — กัน drift) ──
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;
const opts = p.options ?? [];
const log = [];

// ── กลุ่มติ่งห้อย = เงื่อนไขเปิดของกลุ่มใหม่ (อ่านชื่อขนาดสดจากของจริง) ──
const charm = opts.find((o) => o.label === CHARM_LABEL);
if (!charm?.choices?.length) throw new Error(`ไม่พบกลุ่ม "${CHARM_LABEL}" — โครงสินค้าเปลี่ยน เช็คก่อน`);
const charmNames = charm.choices.map((c) => c.name);

const HANG_OPTION = {
  label: HANG_LABEL,
  display: "cards",
  showWhen: { label: CHARM_LABEL, choices: charmNames },
  note: "เลือกวิธีห้อยติ่งห้อยกับตัวพวงกุญแจ — ไม่มีค่าใช้จ่ายเพิ่ม",
  choices: [
    {
      name: "ห้อยด้านข้าง",
      desc: "ติ่งห้อยมีห่วงของตัวเอง เกี่ยวรวมกับห่วงหลักเดียวกับตัวพวงกุญแจ เรียงกันด้านข้าง",
      imageSrc: `${ART_BASE}/hang-side-v1.jpg`,
    },
    {
      name: "ห้อยต่อ ๆ กันลงมา",
      desc: "เจาะรูบน-ล่าง ร้อยห่วงต่อจากตัวพวงกุญแจลงมาเป็นสายแนวตั้ง",
      imageSrc: `${ART_BASE}/hang-stack-v1.jpg`,
    },
    {
      name: HANG_ADMIN,
      desc: "มีผังในใจ จัดแบบพิเศษได้ — ทักแชท/LINE แจ้งแอดมินก่อนกดสั่ง",
      imageSrc: `${ART_BASE}/hang-custom-v1.jpg`,
    },
  ],
};

// ── 1) ภาพการ์ด 3 ใบ — ก๊อปเข้าโฟลเดอร์ของสินค้านี้ (มีอยู่แล้วข้าม) ──
const { data: listed } = await sb.storage.from(BUCKET).list(`products/${ID}`, { limit: 1000 });
const have = new Set((listed ?? []).map((f) => f.name));
const todo = FILES.filter((f) => !have.has(f));
if (!todo.length) log.push(`ภาพการ์ด 3 ใบมีอยู่ในโฟลเดอร์ products/${ID} แล้ว — ไม่ต้องก๊อป`);
else if (!WRITE) log.push(`จะก๊อปภาพ ${todo.length} ใบ: ${todo.join(", ")} (จาก products/${SRC_ID})`);
else {
  for (const f of todo) {
    const { error: cErr } = await sb.storage.from(BUCKET).copy(`products/${SRC_ID}/${f}`, `products/${ID}/${f}`);
    if (cErr) throw cErr;
    log.push(`ก๊อปภาพ ${f} → products/${ID}`);
  }
}

// ── 2) กลุ่ม "รูปแบบการห้อย" — วางถัดจาก "ติ่งห้อย" · รันซ้ำ = อัปทับที่เดิม ──
const hangAt = opts.findIndex((o) => o.label === HANG_LABEL);
if (hangAt >= 0) {
  opts[hangAt] = HANG_OPTION;
  log.push(`อัปทับกลุ่ม "${HANG_LABEL}" (#${hangAt + 1})`);
} else {
  const at = opts.findIndex((o) => o.label === CHARM_LABEL);
  opts.splice(at + 1, 0, HANG_OPTION);
  log.push(`เพิ่มกลุ่ม "${HANG_LABEL}" ถัดจาก "${CHARM_LABEL}" (#${at + 2}) — การ์ด 3 ใบมีภาพ`);
}
p.options = opts;

// ── 3) แบบอื่น ๆ = ต้องคุยผังกับแอดมินก่อนสั่ง (บังคับเฉพาะตอนเลือกข้อนี้) ──
if (p.artworkConsult?.enabled && p.artworkConsult.when?.label && p.artworkConsult.when.label !== HANG_LABEL)
  throw new Error(`สินค้านี้มี artworkConsult ของกลุ่ม "${p.artworkConsult.when.label}" อยู่แล้ว — ทับไม่ได้ เช็คก่อน`);
p.artworkConsult = {
  enabled: true,
  block: true,
  when: { label: HANG_LABEL, choices: [HANG_ADMIN] },
  // ⚠️ ต้องมีข้อที่สองด้วย: กลุ่มรูปแบบการห้อยถูกซ่อนตอนไม่ติ๊กติ่งห้อย แต่ค่าที่เคยเลือกไว้ยังค้างอยู่
  //    (artworkConsultOf อ่าน selections ตรง ๆ ไม่เช็ค showWhen) — ไม่ตั้ง whenAlso ลูกค้าจะโดนบล็อก
  //    ค้างจากตัวเลือกที่มองไม่เห็นแล้ว
  whenAlso: { label: CHARM_LABEL, choices: charmNames },
  note:
    "การห้อยแบบพิเศษต้องตกลงผังกับแอดมินก่อนนะครับ — ทักไลน์บอกเลยว่าอยากห้อยติ่งห้อยกี่ชิ้น เรียงยังไง " +
    "(แนบภาพร่าง/ตัวอย่างได้) ทีมงานจัดผังให้ดูก่อน ตกลงกันเรียบร้อยแล้วค่อยกดสั่ง",
};
log.push(`เปิด artworkConsult เฉพาะตอน "ติ๊กติ่งห้อย + เลือก ${HANG_ADMIN}"`);

// ── 4) ข้อความประกอบ (idempotent) ──
for (const tab of p.tabs ?? []) {
  if (typeof tab.text !== "string" || !tab.title.startsWith("Add-on")) continue;
  const lines = tab.text.split("\n");
  const at = lines.findIndex((l) => l.startsWith(HANG_TAB_HEAD));
  if (at >= 0) {
    if (lines[at] !== HANG_TAB_LINE) { lines[at] = HANG_TAB_LINE; log.push(`แท็บ "${tab.title}": เขียนบรรทัดรูปแบบการห้อยใหม่`); }
  } else {
    const charmAt = lines.findIndex((l) => l.startsWith("• ส่วนเสริมติ่งห้อย"));
    lines.splice(charmAt >= 0 ? charmAt + 1 : lines.length, 0, HANG_TAB_LINE);
    log.push(`แท็บ "${tab.title}": เพิ่มบรรทัดรูปแบบการห้อย`);
  }
  tab.text = lines.join("\n");
}
if (p.seo?.faqs && !p.seo.faqs.some((f) => f.q === HANG_FAQ.q)) {
  p.seo.faqs.push(HANG_FAQ);
  log.push("SEO FAQ: เพิ่มคำถามรูปแบบการห้อย");
}

// ── ตรวจก่อนเขียน ──
const checks = [];
const ok = (name, pass) => { checks.push(`${pass ? "✅" : "❌"} ${name}`); };
const hang = p.options.find((o) => o.label === HANG_LABEL);
ok("มีกลุ่มรูปแบบการห้อยกลุ่มเดียว", p.options.filter((o) => o.label === HANG_LABEL).length === 1);
ok("การ์ด 3 ใบ ทุกใบมีภาพ + คำอธิบาย", hang.choices.length === 3 && hang.choices.every((c) => c.imageSrc && c.desc));
ok("โผล่เมื่อติ๊กติ่งห้อยเท่านั้น (ครบทุกขนาด)", hang.showWhen?.label === CHARM_LABEL && hang.showWhen.choices.length === charmNames.length);
ok("กลุ่มติ่งห้อยยังอยู่ครบ 9 ขนาด", charmNames.length === 9);
ok("artworkConsult บังคับเฉพาะตอนติ๊กติ่งห้อยด้วย (กันบล็อกค้างจากกลุ่มที่ซ่อน)", p.artworkConsult.whenAlso?.label === CHARM_LABEL && p.artworkConsult.whenAlso.choices.length === charmNames.length);
ok("ไม่ได้ไปแตะแกนตารางราคา (กัน price driver trap)", !(p.pricing?.driverLabels ?? []).includes(HANG_LABEL) && !(p.priceRates ?? []).some((r) => (r.pricing?.driverLabels ?? []).includes(HANG_LABEL)));
ok("ทุกแกนตารางราคายังมีกลุ่มตัวเลือกจริง", (p.pricing?.driverLabels ?? []).every((d) => p.options.some((o) => o.label === d)));
ok("จำนวนกลุ่มตัวเลือกเพิ่มขึ้นเท่านั้น ไม่มีกลุ่มหาย", p.options.length >= (row.data.options ?? []).length);
console.log(log.map((l) => "• " + l).join("\n"));
console.log("\n" + checks.join("\n"));
if (checks.some((c) => c.startsWith("❌"))) throw new Error("ตรวจไม่ผ่าน — ไม่เขียน");

p.savedAt = new Date().toISOString();
if (!WRITE) {
  console.log("\n👀 dry-run — เติม --write เพื่อเขียนจริง");
  process.exit(0);
}
const { error: wErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (wErr) throw wErr;
console.log("\n💾 เขียนลง Supabase แล้ว — เปิดดูที่ /products/keyring");
