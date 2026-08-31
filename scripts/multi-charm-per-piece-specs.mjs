#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — แยกสเปค "ประเภทอะคริลิค + งานสกรีน" เป็นรายชิ้น (ผู้ใช้สั่ง 29 ส.ค. 69)
 *
 *   node scripts/multi-charm-per-piece-specs.mjs           # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-per-piece-specs.mjs --write   # เขียนลงฐานข้อมูล
 *
 * เดิม: 1 พวงเลือกประเภท/งานสกรีนได้ชุดเดียวใช้ทั้งพวง — ชิ้นที่ 2+ เลือกได้แค่ "ขนาด"
 * ใหม่: แต่ละชิ้นมีชุดของตัวเอง (ขนาด → ประเภทอะคริลิค → สีอะคริลิค → งานสกรีน)
 *
 *   • กลุ่มเดิมกลายเป็นชุดของ "ชิ้นที่ 1" (เปลี่ยนชื่อ + ตามไปแก้แกนตารางราคา/กฎ/showWhen)
 *   • โคลนชุดเดียวกันให้ชิ้นที่ 2-10 พร้อมกฎครบทุกข้อ (โผล่เมื่อพวงมีชิ้นถึงลำดับนั้น)
 *   • ราคาชิ้นที่ k ดึงช่องตารางของสเปคชิ้นนั้นเอง ผ่าน priceAsDriverAlso
 *     (ชิ้นที่ 2 เป็นสีพิเศษ ชิ้นที่ 1 เป็นใส = คิดคนละราคาตามจริง)
 *   • กลุ่ม "รูปแบบการห้อย" โผล่เมื่อ พวงมี 2 ชิ้นขึ้นไป **หรือ** ติ๊กติ่งห้อยไว้ (showWhenAny)
 *
 * ⚠️ กลุ่ม "สรีนด้าน" ไม่โคลน — showWhen ตั้งค่าไว้ว่า "สกรีน 1 ด้าน" ซึ่งไม่ตรงชื่อตัวเลือกจริง
 *    ("สกรีน 1 ด้าน (ใต้)/(บน)") กลุ่มนี้จึงไม่เคยแสดงมาตั้งแต่ต้นทาง — คงไว้เฉพาะชิ้นที่ 1 ตามเดิม
 * ⚠️ ห้ามใส่กฎย้อนทิศ สีอะคริลิค → ประเภทอะคริลิค (ดู [[iducky-keyring-acrylic-type]])
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const COUNT_LABEL = "จำนวนชิ้นใน 1 พวง";
const HANG_LABEL = "รูปแบบการห้อย";
const CHARM_LABEL = "ติ่งห้อย";
const MAX_PIECES = 10;

/** กลุ่มที่กลายเป็น "ชุดสเปครายชิ้น" — ชื่อเดิม → ชื่อใหม่ต่อท้าย " ชิ้นที่ N" */
const TYPE = "ประเภทอะคริลิค";
const COLOR = "สีอะคริลิค";
const SCREEN = "งานสกรีน";
const SIDE = "สรีนด้าน"; // เปลี่ยนชื่อเป็นชิ้นที่ 1 แต่ไม่โคลน (ไม่เคยแสดง — ดูหัวไฟล์)
const PER_PIECE = [TYPE, COLOR, SCREEN]; // ชุดที่โคลนให้ชิ้นที่ 2-10
const RENAMED = [TYPE, COLOR, SCREEN, SIDE]; // ชุดที่เปลี่ยนชื่อเป็น "ชิ้นที่ 1"
const at = (label, k) => `${label} ชิ้นที่ ${k}`;
const SIZE = (k) => `ขนาดชิ้นที่ ${k}`;
/** ตัวเลือกจำนวนชิ้นที่ทำให้ชิ้นลำดับ k มีอยู่จริง ("k ชิ้น" ขึ้นไป) */
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

// ── ดึงสดจาก DB เสมอ (ห้าม dump เก่า — กัน drift) ──
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;
const log = [];
const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * กฎที่ชี้กลุ่มไม่มีจริง — สินค้านี้ติดมาจากต้นทาง 4 ข้อ (when "ตะขอ E " ที่ไม่มีกลุ่มนั้นแล้ว)
 * เป็นกฎตายที่ระบบข้ามอยู่แล้ว และมีเหมือนกันบนพวงกุญแจตัวจริง — งานนี้ไม่แตะ
 * แต่ต้องไม่ "เพิ่ม" ของใหม่ จึงจดไว้ก่อนแก้แล้วเทียบตอนท้าย
 */
const danglingOf = (prod) => {
  const labels = new Set(prod.options.map((o) => o.label));
  return (prod.rules ?? []).filter((r) => !labels.has(r.when?.label) || !labels.has(r.limit?.label)).length;
};
const danglingBefore = danglingOf(p);

// รันซ้ำได้: ถ้าเคยรันแล้วจะเจอชื่อ "ชิ้นที่ 1" อยู่แล้ว — ถอนของเก่าออกก่อนสร้างใหม่ทั้งชุด
const already = p.options.some((o) => o.label === at(TYPE, 1));
if (already) {
  const before = p.options.length;
  // คืนชื่อกลุ่มชิ้นที่ 1 กลับเป็นชื่อเดิม แล้วลบชุดชิ้นที่ 2+ ทิ้ง เพื่อสร้างใหม่จากศูนย์
  p.options = p.options.filter((o) => !PER_PIECE.some((b) => o.label.startsWith(b + " ชิ้นที่ ") && o.label !== at(b, 1)));
  p.rules = (p.rules ?? []).filter(
    (r) => ![r.when?.label, r.limit?.label].some((l) => PER_PIECE.some((b) => l?.startsWith(b + " ชิ้นที่ ") && l !== at(b, 1)))
  );
  const back = (l) => (RENAMED.some((b) => l === at(b, 1)) ? l.replace(/ ชิ้นที่ 1$/, "") : l);
  for (const o of p.options) {
    o.label = back(o.label);
    for (const c of [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])]) if (c?.label) c.label = back(c.label);
    delete o.priceAsDriverAlso;
  }
  for (const r of p.rules) {
    if (r.when?.label) r.when.label = back(r.when.label);
    if (r.limit?.label) r.limit.label = back(r.limit.label);
  }
  for (const m of [p.pricing, ...(p.priceRates ?? []).map((r) => r.pricing)]) if (m) m.driverLabels = m.driverLabels.map(back);
  log.push(`รันซ้ำ: ถอนชุดรายชิ้นของรอบก่อนออกก่อน (กลุ่ม ${before} → ${p.options.length}) แล้วสร้างใหม่ทั้งชุด`);
}

const opts = p.options;
const src = Object.fromEntries(RENAMED.map((l) => [l, opts.find((o) => o.label === l)]));
for (const [l, o] of Object.entries(src)) if (!o) throw new Error(`ไม่พบกลุ่ม "${l}" — โครงสินค้าเปลี่ยน หยุดก่อน`);

// ── 1) เปลี่ยนชื่อกลุ่มเดิมเป็น "ชุดของชิ้นที่ 1" (ตามไปแก้ทุกที่ที่อ้างชื่อ) ──
const rename = Object.fromEntries(RENAMED.map((l) => [l, at(l, 1)]));
const ren = (l) => rename[l] ?? l;
for (const o of opts) {
  o.label = ren(o.label);
  for (const c of [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])]) if (c?.label) c.label = ren(c.label);
}
for (const r of p.rules ?? []) {
  if (r.when?.label) r.when.label = ren(r.when.label);
  if (r.limit?.label) r.limit.label = ren(r.limit.label);
}
for (const m of [p.pricing, ...(p.priceRates ?? []).map((r) => r.pricing)]) if (m) m.driverLabels = m.driverLabels.map(ren);
log.push(`เปลี่ยนชื่อกลุ่มเดิมเป็นชุดชิ้นที่ 1: ${RENAMED.map((l) => `"${l}" → "${at(l, 1)}"`).join(" · ")}`);
log.push(`  ↳ แกนตารางราคาใหม่: ${p.pricing.driverLabels.join(" │ ")}`);

src[TYPE].note = "เนื้ออะคริลิคของชิ้นที่ 1 — ราคาชิ้นนี้คิดตามแบบที่เลือก (ดูตารางราคาด้านบน)";
src[SCREEN].note = "งานสกรีนของชิ้นที่ 1 — แต่ละชิ้นในพวงเลือกไม่เหมือนกันได้";

// ── 2) โคลนชุดสเปคให้ชิ้นที่ 2-10 ──
// กฎที่ต้องโคลนตาม = กฎที่ "ผลลัพธ์" ตกกับกลุ่มในชุด (ต้นทางเป็นกลุ่มในชุดเดียวกัน หรือกลุ่มกลางอย่างความหนา)
const inSet1 = PER_PIECE.map((l) => at(l, 1));
const setRules = (p.rules ?? []).filter((r) => inSet1.includes(r.limit?.label));
const outsideSrc = setRules.filter((r) => !inSet1.includes(r.when?.label)).map((r) => r.when?.label);
log.push(`กฎของชุดสเปค ${setRules.length} ข้อ (ต้นทางนอกชุด: ${[...new Set(outsideSrc)].join(", ") || "ไม่มี"}) — โคลนตามทุกชิ้น`);

const newOpts = [];
const newRules = [];
for (let k = 2; k <= MAX_PIECES; k++) {
  const show = { label: COUNT_LABEL, choices: fromPiece(k) };
  for (const base of PER_PIECE) {
    const o = clone(src[base]);
    o.label = at(base, k);
    // เงื่อนไขเดิมที่ชี้กลุ่มในชุด (เช่น สีอะคริลิค ที่โผล่ตามประเภท) ให้ชี้กลุ่มของชิ้นเดียวกัน
    const point = (c) => c && inSet1.includes(c.label) && (c.label = c.label.replace(/ ชิ้นที่ 1$/, ` ชิ้นที่ ${k}`));
    point(o.showWhen);
    point(o.showWhenAlso);
    (o.showWhenAll ?? []).forEach(point);
    // + ต้องมีชิ้นลำดับนี้อยู่จริงถึงจะถาม
    if (!o.showWhen) o.showWhen = show;
    else if (!o.showWhenAlso) o.showWhenAlso = show;
    else o.showWhenAll = [...(o.showWhenAll ?? []), show];
    o.note = base === COLOR ? o.note : `${base === TYPE ? "เนื้ออะคริลิค" : "งานสกรีน"}ของชิ้นที่ ${k} — เลือกต่างจากชิ้นอื่นได้ ราคาคิดตามสเปคของชิ้นนี้เอง`;
    newOpts.push(o);
  }
  for (const r of setRules) {
    const c = clone(r);
    const swap = (l) => (inSet1.includes(l) ? l.replace(/ ชิ้นที่ 1$/, ` ชิ้นที่ ${k}`) : l);
    c.when.label = swap(c.when.label);
    c.limit.label = swap(c.limit.label);
    newRules.push(c);
  }
  // ราคาชิ้นนี้ = ช่องตารางของสเปคชิ้นนี้ (ขนาด × ประเภท × งานสกรีน ของชิ้นที่ k)
  const size = opts.find((o) => o.label === SIZE(k));
  if (!size) throw new Error(`ไม่พบกลุ่ม "${SIZE(k)}" — หยุดก่อน`);
  size.priceAsDriverAlso = { [at(TYPE, 1)]: at(TYPE, k), [at(SCREEN, 1)]: at(SCREEN, k) };
  size.note = `ขนาดของชิ้นที่ ${k} — ราคาชิ้นนี้คิดจากขนาด + เนื้ออะคริลิค + งานสกรีนของชิ้นที่ ${k} เอง`;
}
p.rules = [...(p.rules ?? []), ...newRules];
log.push(`สร้างชุดสเปคชิ้นที่ 2-${MAX_PIECES}: ${newOpts.length} กลุ่ม + ${newRules.length} กฎ`);
log.push(`  ↳ ราคาชิ้นที่ 2-${MAX_PIECES} ผูก priceAsDriverAlso → ประเภท/งานสกรีนของชิ้นตัวเอง`);

// ── 3) เรียงลำดับใหม่: ชุดของแต่ละชิ้นอยู่ติดกัน ──
const bucket = new Map(); // label → กลุ่ม
for (const o of [...opts, ...newOpts]) bucket.set(o.label, o);
const ordered = [];
const take = (label) => {
  const o = bucket.get(label);
  if (o) {
    ordered.push(o);
    bucket.delete(label);
  }
};
take("ความหนาอะคริลิค");
take(COUNT_LABEL);
for (let k = 1; k <= MAX_PIECES; k++) {
  take(SIZE(k));
  for (const base of PER_PIECE) take(at(base, k));
  if (k === 1) take(at(SIDE, 1));
}
take(HANG_LABEL);
for (const o of [...bucket.values()]) ordered.push(o); // ที่เหลือ (ตะขอ/สีตะขอ/ติ่งห้อย) ตามลำดับเดิม
p.options = ordered;
log.push(`เรียงลำดับ: ชุดสเปคของแต่ละชิ้นอยู่ติดกัน (รวม ${p.options.length} กลุ่ม)`);

// ── 4) รูปแบบการห้อย — โผล่เมื่อ "หลายชิ้น" หรือ "ติ๊กติ่งห้อย" ──
const hang = p.options.find((o) => o.label === HANG_LABEL);
const charm = p.options.find((o) => o.label === CHARM_LABEL);
if (!hang || !charm) throw new Error(`ไม่พบกลุ่ม "${HANG_LABEL}" หรือ "${CHARM_LABEL}" — หยุดก่อน`);
delete hang.showWhen;
hang.showWhenAny = [
  { label: COUNT_LABEL, choices: fromPiece(2) },
  { label: CHARM_LABEL, choices: charm.choices.map((c) => c.name) },
];
hang.note = "เลือกวิธีเรียงชิ้นงาน/ติ่งห้อยในพวง — ไม่มีค่าใช้จ่ายเพิ่ม";
log.push(`"${HANG_LABEL}": โผล่เมื่อพวงมี 2 ชิ้นขึ้นไป **หรือ** ติ๊กติ่งห้อยไว้ (showWhenAny)`);

// ── 5) ข้อความที่ยังบอกว่าเลือกครั้งเดียวทั้งพวง ──
const OLD_LINE = "• ตะขอ/อะไหล่คิดครั้งเดียวต่อพวง · ความหนา งานสกรีน ประเภทอะคริลิค เลือกครั้งเดียวใช้ทั้งพวง";
const NEW_LINE =
  "• แต่ละชิ้นเลือกสเปคของตัวเองได้: ขนาด · เนื้ออะคริลิค (ใส/ขาวขุ่น/สีพิเศษ) · งานสกรีน — ราคาคิดตามสเปคของชิ้นนั้น ๆ\n" +
  "• ความหนาอะคริลิคเลือกครั้งเดียวใช้ทั้งพวง · ตะขอ/อะไหล่คิดครั้งเดียวต่อพวง";
for (const tab of p.tabs ?? []) {
  if (typeof tab.text !== "string" || !tab.text.includes(OLD_LINE)) continue;
  tab.text = tab.text.replace(OLD_LINE, NEW_LINE);
  log.push(`แท็บ "${tab.title}": เขียนบรรทัด "เลือกครั้งเดียวใช้ทั้งพวง" ใหม่`);
}
const OLD_HL = "เลือกความหนา งานสกรีน และอะคริลิคสีพิเศษได้เหมือนพวงกุญแจปกติ";
const NEW_HL = "แต่ละชิ้นเลือกเนื้ออะคริลิคและงานสกรีนของตัวเองได้ (คนละแบบก็ได้)";
if ((p.highlights ?? []).includes(OLD_HL)) {
  p.highlights = p.highlights.map((h) => (h === OLD_HL ? NEW_HL : h));
  log.push("highlights: เขียนบรรทัดสเปครายชิ้นใหม่");
}
const FAQ = {
  q: "แต่ละชิ้นในพวงเลือกเนื้ออะคริลิค/งานสกรีนต่างกันได้ไหม?",
  a: "ได้ครับ ทุกชิ้นมีชุดตัวเลือกของตัวเอง — ชิ้นที่ 1 เป็นอะคริลิคใสสกรีน 1 ด้าน ชิ้นที่ 2 เป็นสีพิเศษสกรีน 2 ด้านก็ได้ ราคาคิดตามสเปคจริงของแต่ละชิ้น",
};
if (p.seo?.faqs && !p.seo.faqs.some((f) => f.q === FAQ.q)) {
  p.seo.faqs.push(FAQ);
  log.push("SEO FAQ: เพิ่มคำถามสเปครายชิ้น");
}

// ── ตรวจก่อนเขียน ──
const checks = [];
const ok = (name, pass) => checks.push(`${pass ? "✅" : "❌"} ${name}`);
const labels = p.options.map((o) => o.label);
const drivers = p.pricing.driverLabels;
ok("ทุกแกนตารางราคามีกลุ่มตัวเลือกจริง (กัน price driver trap)", drivers.every((d) => labels.includes(d)));
ok("แกนตารางเป็นชุดของชิ้นที่ 1", drivers.includes(at(TYPE, 1)) && drivers.includes(at(SCREEN, 1)));
ok("ทุกเรทใช้แกนชุดเดียวกับตารางระดับสินค้า", (p.priceRates ?? []).every((r) => r.pricing.driverLabels.join() === drivers.join()));
ok(`ชุดสเปคครบทุกชิ้น 1-${MAX_PIECES}`, [...Array(MAX_PIECES)].every((_, i) => PER_PIECE.every((b) => labels.includes(at(b, i + 1)))));
ok("ไม่มีชื่อกลุ่มเก่าค้าง (ไม่มีสังกัดชิ้น)", !RENAMED.some((l) => labels.includes(l)));
ok("ไม่มีชื่อกลุ่มซ้ำ", new Set(labels).size === labels.length);
ok(
  "ทุกเงื่อนไข showWhen ชี้กลุ่มที่มีจริง",
  p.options.every((o) =>
    [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])].every((c) => !c?.label || labels.includes(c.label))
  )
);
ok(
  `ไม่เพิ่มกฎที่ชี้กลุ่มไม่มีจริง (ของเดิมติดมา ${danglingBefore} ข้อ ตอนนี้ ${danglingOf(p)} ข้อ)`,
  danglingOf(p) === danglingBefore
);
ok(
  "ทุกกฎของชุดสเปครายชิ้นชี้กลุ่มที่มีจริง",
  p.rules
    .filter((r) => PER_PIECE.some((b) => r.when.label.startsWith(b) || r.limit.label.startsWith(b)))
    .every((r) => labels.includes(r.when.label) && labels.includes(r.limit.label))
);
ok("ไม่มีกฎย้อนทิศ สีอะคริลิค → ประเภทอะคริลิค", !p.rules.some((r) => r.when.label.startsWith(COLOR) && r.limit.label.startsWith(TYPE)));
ok(
  `ชิ้นที่ 2-${MAX_PIECES} ผูกราคาเข้าสเปคของตัวเองครบ`,
  [...Array(MAX_PIECES - 1)].every((_, i) => {
    const k = i + 2;
    const o = p.options.find((x) => x.label === SIZE(k));
    return o?.priceAsDriver === SIZE(1) && o.priceAsDriverAlso?.[at(TYPE, 1)] === at(TYPE, k) && o.priceAsDriverAlso[at(SCREEN, 1)] === at(SCREEN, k);
  })
);
ok(`"${HANG_LABEL}" มีเงื่อนไขหรือ 2 ทาง`, hang.showWhenAny?.length === 2 && !hang.showWhen);

console.log(log.map((l) => "• " + l).join("\n"));
console.log("\nลำดับกลุ่ม (10 ตัวแรก): " + labels.slice(0, 10).join(" › "));
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
