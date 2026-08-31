#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — แยก "รูปแบบการห้อย" เป็น 2 กลุ่ม (ผู้ใช้สั่ง 29 ส.ค. 69)
 *
 *   node scripts/multi-charm-hang-groups.mjs           # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-hang-groups.mjs --write   # เขียนลงฐานข้อมูล
 *
 *   • "รูปแบบการห้อย"        — ชิ้นงานหลักในพวง · โผล่เมื่อพวงมี 2 ชิ้นขึ้นไป
 *   • "การห้อยติ่งห้อย"      — ของติ่งห้อยโดยเฉพาะ (การ์ดคนละชุด เห็นชิ้นหลัก + ติ่งเล็ก)
 *                              โผล่เมื่อติ๊กติ่งห้อยไว้ วางต่อท้ายกลุ่มติ่งห้อยทันที
 *
 * เลือก "แบบอื่น ๆ" จากกลุ่มไหนก็ต้องคุยผังกับแอดมินก่อนสั่ง — artworkConsult.whenAny (เงื่อนไข "หรือ")
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const COUNT_LABEL = "จำนวนชิ้นใน 1 พวง";
const HANG = "รูปแบบการห้อย";
const CHARM = "ติ่งห้อย";
const CHARM_HANG = "การห้อยติ่งห้อย";
const OTHER = "แบบอื่น ๆ (ติดต่อแอดมิน)";
const ART = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/keyring-multi-charm";
const MAX_PIECES = 10;
const fromPiece = (k) => Array.from({ length: MAX_PIECES - k + 1 }, (_, i) => `${k + i} ชิ้น`);

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

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;
const log = [];

const charm = p.options.find((o) => o.label === CHARM);
const hang = p.options.find((o) => o.label === HANG);
if (!charm || !hang) throw new Error(`ไม่พบกลุ่ม "${CHARM}" หรือ "${HANG}" — หยุดก่อน`);

// ── 1) กลุ่มเดิมกลับไปคุมเฉพาะ "ชิ้นงานหลัก" (ติ่งห้อยมีกลุ่มของตัวเองแล้ว) ──
delete hang.showWhenAny;
hang.showWhen = { label: COUNT_LABEL, choices: fromPiece(2) };
hang.note = "เลือกวิธีเรียงชิ้นงานหลักในพวง — ไม่มีค่าใช้จ่ายเพิ่ม";
log.push(`"${HANG}": กลับไปโผล่เมื่อพวงมี 2 ชิ้นขึ้นไป (คุมเฉพาะชิ้นงานหลัก)`);

// ── 2) กลุ่มใหม่ของติ่งห้อย — การ์ดคนละชุด (เห็นชิ้นหลัก + ติ่งเล็ก) ──
const CHARM_HANG_OPTION = {
  label: CHARM_HANG,
  display: "cards",
  showWhen: { label: CHARM, choices: charm.choices.map((c) => c.name) },
  note: "ติ่งห้อยที่เลือกไว้ด้านบน ให้ห้อยแบบไหน — ไม่มีค่าใช้จ่ายเพิ่ม",
  choices: [
    { name: "ห้อยด้านข้าง", desc: "ติ่งห้อยมีห่วงของตัวเอง เกี่ยวรวมที่ห่วงหลัก อยู่ข้างชิ้นงานหลัก", imageSrc: `${ART}/charm-side-v1.jpg` },
    { name: "ห้อยต่อ ๆ กันลงมา", desc: "ติ่งห้อยเจาะรูร้อยต่อจากชิ้นงานหลักลงมาเป็นสาย", imageSrc: `${ART}/charm-stack-v1.jpg` },
    { name: OTHER, desc: "อยากให้ติ่งห้อยอยู่ตำแหน่งอื่น — ทักแชท/LINE แจ้งแอดมินก่อนกดสั่ง", imageSrc: `${ART}/hang-custom-v1.jpg` },
  ],
};
const at = p.options.findIndex((o) => o.label === CHARM_HANG);
if (at >= 0) {
  p.options[at] = CHARM_HANG_OPTION;
  log.push(`อัปทับกลุ่ม "${CHARM_HANG}" (#${at + 1})`);
} else {
  // วางต่อท้ายกลุ่มติ่งห้อยทันที — ลูกค้าเลือกติ่งห้อยเสร็จก็เจอคำถามนี้ต่อเลย
  p.options.splice(p.options.indexOf(charm) + 1, 0, CHARM_HANG_OPTION);
  log.push(`เพิ่มกลุ่ม "${CHARM_HANG}" ต่อท้ายกลุ่ม "${CHARM}" (การ์ด 3 ใบมีภาพเฉพาะของติ่งห้อย)`);
}

// ── 3) เลือก "แบบอื่น ๆ" จากกลุ่มไหนก็ต้องคุยแอดมินก่อน (เงื่อนไข "หรือ") ──
p.artworkConsult = {
  enabled: true,
  block: true,
  whenAny: [
    { label: HANG, choices: [OTHER] },
    { label: CHARM_HANG, choices: [OTHER] },
  ],
  note:
    "การห้อยแบบพิเศษต้องตกลงผังกับแอดมินก่อนนะครับ — ทักไลน์บอกเลยว่าอยากห้อยกี่ชิ้น เรียงยังไง " +
    "(แนบภาพร่าง/ตัวอย่างได้) ทีมงานจัดผังให้ดูก่อน ตกลงกันเรียบร้อยแล้วค่อยกดสั่ง",
};
delete p.artworkConsult.when;
log.push(`กล่องคุยแอดมิน: บังคับเมื่อเลือก "${OTHER}" จากกลุ่มใดกลุ่มหนึ่งใน 2 กลุ่ม (whenAny)`);

// ── 4) ข้อความในแท็บ ──
const OLD = "• เลือกรูปแบบการห้อยได้ฟรี: ห้อยด้านข้าง · ห้อยต่อ ๆ กันลงมา · แบบอื่น ๆ แจ้งแอดมินก่อนสั่ง";
const NEW =
  "• เลือกรูปแบบการห้อยได้ฟรี ทั้งของชิ้นงานหลักและของติ่งห้อย (แยกกันคนละข้อ): ห้อยด้านข้าง · ห้อยต่อ ๆ กันลงมา · แบบอื่น ๆ แจ้งแอดมินก่อนสั่ง";
for (const tab of p.tabs ?? []) {
  if (typeof tab.text !== "string" || !tab.text.includes(OLD)) continue;
  tab.text = tab.text.replace(OLD, NEW);
  log.push(`แท็บ "${tab.title}": เขียนบรรทัดรูปแบบการห้อยใหม่`);
}

// ── ตรวจก่อนเขียน ──
const checks = [];
const ok = (name, pass) => checks.push(`${pass ? "✅" : "❌"} ${name}`);
const labels = p.options.map((o) => o.label);
const ch = p.options.find((o) => o.label === CHARM_HANG);
ok("กลุ่มการห้อยติ่งห้อยอยู่ถัดจากกลุ่มติ่งห้อยพอดี", labels.indexOf(CHARM_HANG) === labels.indexOf(CHARM) + 1);
ok("การ์ด 3 ใบมีภาพครบ และเป็นภาพชุดของติ่งห้อย", ch.choices.every((c) => c.imageSrc) && ch.choices[0].imageSrc.includes("charm-side"));
ok("โผล่เมื่อติ๊กติ่งห้อย (ครบทุกขนาด)", ch.showWhen.label === CHARM && ch.showWhen.choices.length === charm.choices.length);
ok("กลุ่มเดิมคุมเฉพาะชิ้นงานหลัก (2 ชิ้นขึ้นไป)", hang.showWhen?.label === COUNT_LABEL && !hang.showWhenAny);
ok("กล่องคุยแอดมินผูก 2 กลุ่มแบบ 'หรือ'", (p.artworkConsult.whenAny ?? []).length === 2 && !p.artworkConsult.when);
ok("ไม่มีชื่อกลุ่มซ้ำ", new Set(labels).size === labels.length);
ok("กลุ่มใหม่ไม่ชนแกนตารางราคา", !p.pricing.driverLabels.includes(CHARM_HANG));

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
console.log(`\n✅ เขียน ${ID} แล้ว (ยังเป็นฉบับร่าง)`);
