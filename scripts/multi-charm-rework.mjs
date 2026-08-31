#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง (keyring-multi-charm) — ยกเครื่องตามคำสั่งผู้ใช้ 29 ส.ค. 69
 *
 *   node scripts/multi-charm-rework.mjs           # ดูก่อนว่าจะแก้อะไร (ไม่เขียนจริง)
 *   node scripts/multi-charm-rework.mjs --write   # เขียนลงฐานข้อมูล
 *
 * สิ่งที่แก้:
 *   1. ถอดความหนา 1mm ทั้งระบบ (ตัวเลือก + ช่องราคา + กฎ) — เหลือ 3mm / 2mm
 *   2. 3mm เลือกประเภท/สีอะคริลิคได้ครบ (ตรรกะเดิมที่ก๊อปมาจากพวงกุญแจถูกอยู่แล้ว —
 *      3mm → ประเภทอะคริลิค 3 แบบ → สีพิเศษเปิด 44 เฉด · 2mm → อะคริลิคใสเท่านั้น)
 *   3. เพิ่มกลุ่ม "รูปแบบการห้อย" (การ์ดมีภาพ 3 ใบจาก scripts/multi-charm-hang-art.mjs):
 *      ห้อยด้านข้าง · ห้อยต่อ ๆ กันลงมา · แบบอื่น ๆ (ติดต่อแอดมิน — เปิด artworkConsult
 *      บังคับติ๊กยืนยันว่าคุยผังกับแอดมินแล้วเฉพาะตอนเลือกข้อนี้)
 *   4. เรทติ่งห้อย 20/15/12 (1-10 / 11-29 / 30+ ชิ้น เริ่มที่ 2 ซม.) มีอยู่แล้วจาก
 *      extraSmall/extraBelow/extra — แก้เฉพาะข้อความ note/แท็บให้ตรงสินค้านี้
 *      (นับจากชิ้นรวมต่อลาย · ไม่มีเรทที่ 2 แล้ว)
 *
 * ⚠️ ห้ามใส่กฎย้อนทิศ สีอะคริลิค → ประเภทอะคริลิค (ดู [[iducky-keyring-acrylic-type]])
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const TH_GROUP = "ความหนาอะคริลิค";
const DROP_TH = "1mm";
const COUNT_LABEL = "จำนวนชิ้นใน 1 พวง";
const HANG_LABEL = "รูปแบบการห้อย";
const HANG_ADMIN = "แบบอื่น ๆ (ติดต่อแอดมิน)";
const ART_BASE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/keyring-multi-charm";

const HANG_OPTION = {
  label: HANG_LABEL,
  display: "cards",
  // โชว์เมื่อพวงมี 2 ชิ้นขึ้นไป — ชิ้นเดียวไม่มีอะไรให้จัดเรียง
  showWhen: { label: COUNT_LABEL, choices: ["2 ชิ้น", "3 ชิ้น", "4 ชิ้น", "5 ชิ้น", "6 ชิ้น", "7 ชิ้น", "8 ชิ้น", "9 ชิ้น", "10 ชิ้น"] },
  note: "เลือกวิธีเรียงชิ้นงานในพวง — ไม่มีค่าใช้จ่ายเพิ่ม",
  choices: [
    {
      name: "ห้อยด้านข้าง",
      desc: "ทุกชิ้นมีห่วงของตัวเอง เกี่ยวรวมกับห่วงหลัก 1 วง เรียงกันด้านข้าง",
      imageSrc: `${ART_BASE}/hang-side-v1.jpg`,
    },
    {
      name: "ห้อยต่อ ๆ กันลงมา",
      desc: "แต่ละชิ้นเจาะรูบน-ล่าง ร้อยห่วงต่อกันเป็นสายยาวแนวตั้ง",
      imageSrc: `${ART_BASE}/hang-stack-v1.jpg`,
    },
    {
      name: HANG_ADMIN,
      desc: "มีผังในใจ จัดแบบพิเศษได้ — ทักแชท/LINE แจ้งแอดมินก่อนกดสั่ง",
      imageSrc: `${ART_BASE}/hang-custom-v1.jpg`,
    },
  ],
};

const CHARM_NOTE =
  "อะคริลิคตัวเล็ก ๆ ห้อยเพิ่มในพวง · **ติ๊กได้หลายขนาดพร้อมกัน แต่ละขนาดระบุจำนวนชิ้นของตัวเอง** " +
  "(ขนาดละไม่เกิน 5 ชิ้น ต่อ 1 พวง) · **ราคาที่เห็นคือราคาเต็มต่อติ่งห้อย 1 ชิ้นแล้ว** " +
  "(ค่าติ่งห้อย + ค่าเพิ่มขนาด ซม. ละ 10 บาท นับจากมาตรฐาน 2 ซม.) · " +
  "ราคาสลับตามจำนวนชิ้นรวมที่สั่งต่อลาย: 1-10 ชิ้น 20.- · 11-29 ชิ้น 15.- · 30 ชิ้นขึ้นไป 12.- (ขนาดมาตรฐาน 2 ซม.)";

const CHARM_TAB_HEAD = "• ส่วนเสริมติ่งห้อย";
const CHARM_TAB_LINE =
  `${CHARM_TAB_HEAD} (มาตรฐาน 2cm): 1-10 ชิ้น 20.- / 11-29 ชิ้น 15.- / 30 ชิ้นขึ้นไป 12.- ` +
  "(นับจากจำนวนชิ้นรวมต่อลาย) · ใหญ่กว่า 2cm คิดเพิ่ม cm ละ 10.- สูงสุด 10cm · " +
  "เลือกได้หลายขนาด แต่ละขนาดระบุจำนวนเอง (สูงสุดขนาดละ 5 ชิ้นต่อ 1 พวง)";

const HANG_TAB_LINE = "• เลือกรูปแบบการห้อยได้ฟรี: ห้อยด้านข้าง · ห้อยต่อ ๆ กันลงมา · แบบอื่น ๆ แจ้งแอดมินก่อนสั่ง";
const HANG_HIGHLIGHT = "เลือกรูปแบบการห้อยได้ — ห้อยด้านข้าง หรือห้อยต่อ ๆ กันลงมา";

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

// ── 1) ถอด 1mm ออกจากกลุ่มความหนา ──
const th = opts.find((o) => o.label === TH_GROUP);
if (!th) throw new Error(`ไม่พบกลุ่ม "${TH_GROUP}" — หยุดก่อน`);
const thBefore = th.choices.length;
th.choices = th.choices.filter((c) => c.name !== DROP_TH);
if (!th.choices.length) throw new Error("ตัดแล้วกลุ่มความหนาว่าง — ผิดแน่ หยุดก่อน");
log.push(`ความหนา: ${thBefore} → ${th.choices.length} ตัวเลือก (${th.choices.map((c) => c.name).join(" / ")})`);

// ── ตัดช่องราคา 1mm ออกทุกตาราง (ระดับสินค้า + ทุกเรท) ──
const pruneMatrix = (m, tag) => {
  if (!m?.driverLabels || !m?.cells) return;
  const di = m.driverLabels.indexOf(TH_GROUP);
  if (di < 0) return;
  const before = Object.keys(m.cells).length;
  m.cells = Object.fromEntries(Object.entries(m.cells).filter(([k]) => k.split("│")[di] !== DROP_TH));
  if (!Object.keys(m.cells).length) throw new Error(`ตารางราคา ${tag} ว่างหลังตัด — ผิดแน่ หยุดก่อน`);
  log.push(`  ↳ ${tag}: ช่องราคา ${before} → ${Object.keys(m.cells).length}`);
};
pruneMatrix(p.pricing, "ระดับสินค้า");
for (const r of p.priceRates ?? []) pruneMatrix(r.pricing, `เรท ${r.id}`);

// ช่วงราคา min-max ใหม่จากตารางที่เหลือ
const vals = Object.values(p.pricing.cells).flat().filter((n) => Number.isFinite(n));
p.priceMin = Math.min(...vals);
p.priceMax = Math.max(...vals);
log.push(`  ↳ ช่วงราคาใหม่ ${p.priceMin} - ${p.priceMax}`);

// ── กฎที่อ้าง 1mm — ตัด 1mm ออกจากเงื่อนไข (กฎ 3mm→ประเภทครบ / 2mm→ใสเท่านั้น คงเดิม) ──
const rulesBefore = (p.rules ?? []).length;
p.rules = (p.rules ?? [])
  .map((r) => {
    if (r.when?.label !== TH_GROUP) return r;
    const kept = (r.when.choices ?? []).filter((c) => c !== DROP_TH);
    if (!kept.length) return null; // กฎที่เหลือแต่ 1mm — ทิ้งทั้งข้อ
    r.when.choices = kept;
    if (r.when.choice === DROP_TH) r.when.choice = kept[0];
    return r;
  })
  .filter(Boolean);
log.push(`กฎ: ${rulesBefore} → ${p.rules.length} ข้อ (ล้างเงื่อนไข ${DROP_TH})`);

// ── 3) กลุ่ม "รูปแบบการห้อย" — วางถัดจาก "ขนาดชิ้นที่ 10" · รันซ้ำ = อัปทับที่เดิม ──
const hangAt = opts.findIndex((o) => o.label === HANG_LABEL);
if (hangAt >= 0) {
  opts[hangAt] = HANG_OPTION;
  log.push(`อัปทับกลุ่ม "${HANG_LABEL}" (#${hangAt + 1})`);
} else {
  const lastSize = opts.findIndex((o) => o.label === "ขนาดชิ้นที่ 10");
  if (lastSize < 0) throw new Error('ไม่พบกลุ่ม "ขนาดชิ้นที่ 10" — โครงสินค้าเปลี่ยน เช็คก่อน');
  opts.splice(lastSize + 1, 0, HANG_OPTION);
  log.push(`เพิ่มกลุ่ม "${HANG_LABEL}" ถัดจาก "ขนาดชิ้นที่ 10" (#${lastSize + 2}) — การ์ด 3 ใบมีภาพ`);
}

// ── แบบอื่น ๆ ต้องคุยผังกับแอดมินก่อนสั่ง (บังคับเฉพาะตอนเลือกข้อนี้) ──
p.artworkConsult = {
  enabled: true,
  block: true,
  when: { label: HANG_LABEL, choices: [HANG_ADMIN] },
  note:
    "การห้อยแบบพิเศษต้องตกลงผังกับแอดมินก่อนนะครับ — ทักไลน์บอกเลยว่าอยากห้อยกี่ชิ้น เรียงยังไง " +
    "(แนบภาพร่าง/ตัวอย่างได้) ทีมงานจัดผังให้ดูก่อน ตกลงกันเรียบร้อยแล้วค่อยกดสั่ง",
};
log.push(`เปิด artworkConsult เฉพาะตอนเลือก "${HANG_ADMIN}"`);

// ── 4) ติ่งห้อย — เรท 20/15/12 มีอยู่แล้ว เช็คให้ชัวร์ + เขียน note ใหม่ให้ตรงสินค้านี้ ──
const charm = opts.find((o) => o.label === "ติ่งห้อย");
if (!charm) throw new Error('ไม่พบกลุ่ม "ติ่งห้อย" — หยุดก่อน');
const std = charm.choices.find((c) => c.name.startsWith("ติ่งห้อย 2 ซม."));
if (!std || std.extraSmall !== 20 || std.extraBelow !== 15 || std.extra !== 12 || charm.extraSmallUpToQty !== 10 || charm.extraFromQty !== 30)
  throw new Error(`เรทติ่งห้อยไม่ตรง 20/15/12 (เจอ ${JSON.stringify(std)}) — ข้อมูลเปลี่ยน เช็คก่อน`);
charm.note = CHARM_NOTE;
log.push("ติ่งห้อย: เรท 20/15/12 (1-10/11-29/30+ ชิ้นรวมต่อลาย) ถูกอยู่แล้ว · เขียน note ใหม่");

// ── ข้อความประกอบ (idempotent) ──
if (!(p.highlights ?? []).includes(HANG_HIGHLIGHT)) {
  p.highlights = [...(p.highlights ?? []), HANG_HIGHLIGHT];
  log.push("highlights: เพิ่มบรรทัดรูปแบบการห้อย");
}
for (const tab of p.tabs ?? []) {
  if (typeof tab.text !== "string") continue;
  const lines = tab.text.split("\n");
  const ci = lines.findIndex((l) => l.startsWith(CHARM_TAB_HEAD));
  if (ci >= 0 && lines[ci] !== CHARM_TAB_LINE) {
    lines[ci] = CHARM_TAB_LINE;
    log.push(`แท็บ "${tab.title}": เขียนบรรทัดติ่งห้อยใหม่ (ตัดข้อความเรทที่ 2 ที่ไม่มีแล้ว)`);
  }
  if (tab.title.startsWith("วิธีคิดราคา") && !lines.includes(HANG_TAB_LINE)) {
    lines.push(HANG_TAB_LINE);
    log.push(`แท็บ "${tab.title}": เพิ่มบรรทัดรูปแบบการห้อย`);
  }
  tab.text = lines.join("\n");
}
const HANG_FAQ = {
  q: "เลือกวิธีห้อยชิ้นงานได้ไหม?",
  a: "ได้ครับ เลือกได้ในหน้าสั่งซื้อ 2 แบบ: ห้อยด้านข้าง (ทุกชิ้นเกี่ยวห่วงหลักเรียงข้างกัน) หรือห้อยต่อ ๆ กันลงมาเป็นสาย — อยากได้ผังแบบอื่นทักแชทคุยกับแอดมินก่อนสั่งได้เลย",
};
if (p.seo?.faqs && !p.seo.faqs.some((f) => f.q === HANG_FAQ.q)) {
  p.seo.faqs.push(HANG_FAQ);
  log.push("SEO FAQ: เพิ่มคำถามรูปแบบการห้อย");
}

// ── ตรวจ 8 ข้อก่อนเขียน ──
const checks = [];
const ok = (name, pass) => checks.push(`${pass ? "✅" : "❌"} ${name}`) && !pass && process.exitCode;
const allText = JSON.stringify(p);
ok("ไม่เหลือ 1mm ที่ไหนเลยในสินค้า", !allText.includes('"1mm"'));
ok("ความหนาเหลือ 3mm/2mm และ 3mm เป็นค่าแรก (default)", th.choices[0]?.name === "3mm" && th.choices.length === 2);
const drivers = p.pricing.driverLabels;
ok("แกนตารางครบและทุกแกนมีกลุ่มตัวเลือกจริง (กัน price driver trap)", drivers.every((d) => opts.some((o) => o.label === d)));
ok("กฎ 3mm → ประเภทอะคริลิค 3 แบบ ยังอยู่", p.rules.some((r) => r.when?.label === TH_GROUP && (r.when.choices ?? []).includes("3mm") && r.limit?.label === "ประเภทอะคริลิค" && (r.limit.allow ?? []).length === 3));
ok("กฎ 2mm → อะคริลิคใสเท่านั้น ยังอยู่", p.rules.some((r) => r.when?.label === TH_GROUP && (r.when.choices ?? []).join() === "2mm" && r.limit?.label === "ประเภทอะคริลิค" && (r.limit.allow ?? []).join() === "อะคริลิคใส"));
ok("ไม่มีกฎย้อนทิศ สีอะคริลิค → ประเภทอะคริลิค", !p.rules.some((r) => r.when?.label === "สีอะคริลิค" && r.limit?.label === "ประเภทอะคริลิค"));
ok("กลุ่มรูปแบบการห้อยมีการ์ด 3 ใบ ทุกใบมีภาพ", opts.find((o) => o.label === HANG_LABEL)?.choices.every((c) => c.imageSrc) ?? false);
ok("ทุกช่องราคาเหลือเฉพาะ 3mm/2mm", Object.keys(p.pricing.cells).every((k) => ["3mm", "2mm"].includes(k.split("│")[drivers.indexOf(TH_GROUP)])));
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
console.log(`\n✅ เขียน ${ID} แล้ว (ยังเป็นฉบับร่าง — กดเผยแพร่ในหลังบ้านเมื่อพร้อม)`);
