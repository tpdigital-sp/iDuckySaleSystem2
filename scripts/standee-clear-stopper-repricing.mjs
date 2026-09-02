#!/usr/bin/env node
/**
 * "สแตนดี้อะคริลิค+จุกใส" — คิดราคาใหม่ทั้งก้อนจากตารางสดของ https://www.iduckyofficial-pricelists.com/pricestandy
 *
 *   node scripts/standee-clear-stopper-repricing.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/standee-clear-stopper-repricing.mjs --write   # เขียนจริง
 *
 * ผู้ใช้กำหนดที่มาของทุกตัวเลข 2 ก.ย. 69 — 4 ตารางบนหน้าเดียว ไม่มีเลขฝังในโค้ดนอกจากค่าจุกใส/แผ่นบน:
 *   1) ตารางเรทราคา (ราคาแผ่นอะคริลิค) — "ยังไม่บวกฐาน"
 *        เรทที่ 1 (สั่งแบบคละดีเทล)     → 3-20cm × 6 ช่วงจำนวน
 *        เรทที่ 2 (สั่งแบบ ไม่คละดีเทล) → 5-30cm × 4 ช่วงจำนวน (ขั้นต่ำ 50 ชิ้น)
 *   2) ตารางราคาฐาน สแตนดี้ (ไม่สกรีนฐาน / สกรีนฐาน) → กลุ่ม "ขนาดฐาน" + "ฐานสแตนดี้"
 *   3) ตาราง Add on อะคริลิคพิเศษ (ปลีก/ส่ง)          → กลุ่มเฉดพิเศษของ "ตัวสแตนดี้"
 *   4) ตาราง Add on อะคริลิคพิเศษ (ปลีก/ส่ง)          → กลุ่มเฉดพิเศษของ "ฐานสแตนดี้"
 *
 * ⚠️ ค่าฐาน 2 ขั้นแบบชุด standy (ผู้ใช้สั่งกลับ 2 ก.ย. 69 พร้อมรอบแก้ photo-fram-acrylic —
 *    ยกเลิกกติกา "คิดทุกช่วงจำนวน" ที่สั่งไว้ก่อนหน้าวันเดียวกัน):
 *      ปลีก 1-10 ชิ้น (extraBelow) = ฐานไม่เกิน 6 ซม. ฟรี · 7 ซม.ขึ้นไปเพิ่ม ซม.ละ 5 บาท (7=+5 · 20=+70)
 *      ตั้งแต่ 11 ชิ้น (extra ตัดที่ extraFromQty=11) = ตารางราคาฐานของร้านตรง ๆ
 *    ผลคือช่วงปลีกกลับมาตรงใบเสนอราคาเก่าของร้าน (ตัว 6cm + บน 2cm + ฐาน 3cm = 170)
 *    11 ชิ้นขึ้นไปเท่าเดิมทุกช่อง (109 / 95 ตรงใบเสนอราคาของร้าน)
 *
 * ราคา/ชิ้นในตาราง = ราคาแผ่นล่างตามขนาด + ค่าสกรีนแผ่นล่าง + จุกใส 10 + ราคาแผ่นบนตามขนาด + ค่าสกรีนแผ่นบน
 *   (ค่าจุกใส 10 มาจากข้อความในหน้าเว็บ "เพิ่มจุกยางหมุนได้ ชุดละ 10 บาท"
 *    ราคาแผ่นบน 2 ซม. = 20 คงที่ทุกช่วงจำนวน + เซนละ 10 — ผู้ใช้ยืนยันจากใบเสนอราคาจริง)
 *
 * รันซ้ำได้ — อ่านตารางสด คำนวณใหม่ทั้งก้อน แล้วทับของเดิม (ไม่ใช่การบวกส่วนต่าง)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const PAGE = "https://www.iduckyofficial-pricelists.com/pricestandy";
const ID = "new-mt1k6h3q-6601";
const NAME = "สแตนดี้อะคริลิค+จุกใส";

const BODY = "ขนาดตัวสแตนดี้ (แผ่นล่าง)";
const SCREEN = "งานสกรีน (แผ่นล่าง)";
const TOP = "ขนาดแผ่นบน (อะคริลิคใส)";
const BASE_SIZE = "ขนาดฐาน";
const BASE_PLATE = "ฐานสแตนดี้";
const SPECIAL = "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)";

const cm = (n) => `${n} ซม.`;
const STOPPER_FEE = 10;
const topPlatePrice = (size) => 20 + (size - 2) * 10;
/** ฐาน 2cm ไม่มีในตารางร้าน — ใช้เรทช่วง 3-5cm (ตรรกะเดียวกับสแตนดี้ปกติ) */
const BASE_FALLBACK_CM = 3;

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

/* ══ 1. อ่าน 4 ตารางสดจากเว็บ (แยกบล็อกเรทที่ 1 / เรทที่ 2) ═════════════ */
const res = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
if (!res.ok) throw new Error(`โหลด ${PAGE} ไม่ได้ — HTTP ${res.status}`);
const html = (await res.text()).replace(/\x00/g, ""); // กับดักเดิม: เซลล์ Wix มี NUL คั่นกลางคำ
const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const h1 = html.indexOf("เรทที่ 1 (สั่งแบบคละดีเทล)");
const h2 = html.indexOf("เรทที่ 2 (สั่งแบบ ไม่คละดีเทล)");
if (h1 < 0 || h2 < 0 || h2 < h1) throw new Error("หาหัวข้อ เรทที่ 1 / เรทที่ 2 ในหน้าไม่เจอ — โครงหน้าเว็บเปลี่ยน");
const parse = (m) =>
  [...m[0].matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map((r) =>
    [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
  );
const raw = [...html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/g)];
const T1 = raw.filter((m) => m.index > h1 && m.index < h2).map(parse);
const T2 = raw.filter((m) => m.index > h2).map(parse);

const find = (tables, pred, what) => {
  const t = tables.find((rows) => pred(rows.flat()));
  if (!t) throw new Error(`ไม่เจอตาราง ${what} — โครงหน้าเว็บเปลี่ยน ตรวจก่อน`);
  return t;
};
/** หัวคอลัมน์ "3cm" / "8" / "3-5cm" → กางเป็นเลขขนาดทีละเซนติเมตร */
const spread = (head) => {
  const m = head.match(/^(\d+)(?:\s*-\s*(\d+))?/);
  if (!m) throw new Error(`หัวคอลัมน์อ่านไม่ออก: "${head}"`);
  const out = [];
  for (let s = +m[1]; s <= +(m[2] ?? m[1]); s++) out.push(s);
  return out;
};
/** ตารางที่แถวแรกเป็นหัวขนาด แถวถัดไปเป็นค่า → { ชื่อแถว: { ขนาด: ค่า } } */
const bySize = (rows) => {
  const heads = rows[0].slice(1);
  const out = {};
  for (const row of rows.slice(1)) {
    if (!row[0]) continue;
    const map = {};
    heads.forEach((h, i) => {
      const v = Number(String(row[i + 1]).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(v)) throw new Error(`ค่าในตารางไม่ใช่ตัวเลข: "${row[0]}" คอลัมน์ "${h}" = "${row[i + 1]}"`);
      for (const s of spread(h)) map[s] = v;
    });
    out[row[0]] = map;
  }
  return out;
};
/** ตารางชนิดเดียวกันของสองบล็อกต้องเท่ากัน — ไม่งั้นใช้กลุ่มตัวเลือกชุดเดียวร่วมกันไม่ได้ */
const sameBothBlocks = (pred, what) => {
  const a = bySize(find(T1, pred, `${what} (เรทที่ 1)`));
  const b = bySize(find(T2, pred, `${what} (เรทที่ 2)`));
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`ตาราง ${what} ของเรทที่ 1 กับเรทที่ 2 ไม่เท่ากันแล้ว — ต้องแยกกลุ่มตัวเลือกต่อเรท หยุดก่อน`);
  return b;
};
/** ตารางราคาแผ่น: แถวแรก = หัวขนาด · แถวถัดไป = ช่วงจำนวน → { ขนาด: [ราคาเรียงตามช่วง] }, [ชื่อช่วง] */
const sheetOf = (rows) => {
  const heads = rows[0].slice(1);
  const tiers = rows.slice(1).map((r) => r[0]);
  const map = {};
  for (const [i, h] of heads.entries())
    for (const s of spread(h))
      map[s] = rows.slice(1).map((r) => {
        const v = Number(String(r[i + 1]).replace(/[^\d.-]/g, ""));
        if (!Number.isFinite(v)) throw new Error(`ราคาแผ่นไม่ใช่ตัวเลขที่ ${h} · ${r[0]}`);
        return v;
      });
  return { map, tiers };
};

const s1 = sheetOf(find(T1, (c) => c[0] === "จำนวน" && c.includes("1-10 ชิ้น"), "ราคาแผ่นอะคริลิค เรทที่ 1"));
const s2 = sheetOf(find(T2, (c) => c[0] === "จำนวน" && c.some((x) => /^50\s*-\s*100/.test(x)), "ราคาแผ่นอะคริลิค เรทที่ 2"));
const baseTable = sameBothBlocks((c) => c.includes("ไม่สกรีนฐาน") && c.includes("สกรีนฐาน"), "ราคาฐาน สแตนดี้");
const screenTable = sameBothBlocks((c) => c.includes("สกรีน 2 ด้าน") && c.includes("สกรีน 3 เลเยอร์"), "Add on งานสกรีน");
const specialTable = sameBothBlocks((c) => c.some((x) => x.includes("อคล.พิเศษ")), "Add on อะคริลิคพิเศษ");

const BASE_PLAIN = baseTable["ไม่สกรีนฐาน"];
const BASE_PRINT = baseTable["สกรีนฐาน"];
const WEB_2SIDE = screenTable["สกรีน 2 ด้าน"];
const rowLike = (t, kw, what) => {
  const k = Object.keys(t).find((n) => n.includes(kw));
  if (!k) throw new Error(`ไม่เจอแถว "${kw}" ในตาราง ${what}`);
  return t[k];
};
const SPECIAL_RETAIL = rowLike(specialTable, "ปลีก", "Add on อะคริลิคพิเศษ");
const SPECIAL_WHOLESALE = rowLike(specialTable, "ส่ง", "Add on อะคริลิคพิเศษ");

/** ค่าสกรีนฐาน = ส่วนต่าง สกรีนฐาน − ไม่สกรีนฐาน ต้องคงที่ทุกขนาด */
const printFees = new Set(Object.keys(BASE_PRINT).map((s) => BASE_PRINT[s] - BASE_PLAIN[s]));
if (printFees.size !== 1) throw new Error(`ค่าสกรีนฐานไม่คงที่ทุกขนาด (${[...printFees].join(",")}) — ตรวจก่อน`);
const BASE_PRINT_FEE = [...printFees][0];

const tierUpTo = (label) => {
  const m = label.match(/(\d[\d,]*)\s*-\s*(\d[\d,]*)/);
  if (m) return Number(m[2].replace(/,/g, ""));
  if (/ขึ้นไป/.test(label)) return null;
  throw new Error(`อ่านช่วงจำนวนไม่ออก: "${label}"`);
};
const prettyTier = (label) => label.replace(/\d{4,}/g, (n) => Number(n).toLocaleString("en-US"));

console.log("📄 อ่านตารางสดจากเว็บแล้ว");
console.log(`   เรทที่ 1 : ${s1.tiers.join(" · ")}  (ขนาด ${Object.keys(s1.map).join(",")} cm)`);
console.log(`   เรทที่ 2 : ${s2.tiers.join(" · ")}  (ขนาด ${Object.keys(s2.map).join(",")} cm)`);
console.log(`   ราคาฐาน  : 3cm ${BASE_PLAIN[3]} · 8cm ${BASE_PLAIN[8]} · 20cm ${BASE_PLAIN[20]} · สกรีนฐาน +${BASE_PRINT_FEE}`);
console.log(`   อคล.พิเศษ: ปลีก/ส่ง ที่ 3cm ${SPECIAL_RETAIL[3]}/${SPECIAL_WHOLESALE[3]} · ที่ 20cm ${SPECIAL_RETAIL[20]}/${SPECIAL_WHOLESALE[20]}`);

/* ══ 2. อ่านสินค้า ═══════════════════════════════════════════════════ */
const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);
if (row.name !== NAME) throw new Error(`id ${ID} ตอนนี้เป็นสินค้า "${row.name}" ไม่ใช่ "${NAME}" — หยุดก่อน`);
const d = structuredClone(row.data);
const before = structuredClone(row.data);

const groupOf = (label) => {
  const g = (d.options ?? []).find((o) => o.label === label);
  if (!g) throw new Error(`สินค้าไม่มีกลุ่ม "${label}" แล้ว — ตรวจก่อน`);
  return g;
};
const rateOf = (re, what) => {
  const r = (d.priceRates ?? []).find((x) => re.test(x.label));
  if (!r) throw new Error(`สินค้าไม่มี${what}แล้ว — ตรวจก่อน`);
  return r;
};
const rate1 = rateOf(/เรทที่ 1/, "เรทที่ 1");
const rate2 = rateOf(/เรทที่ 2/, "เรทที่ 2");
for (const r of [rate1, rate2])
  if (JSON.stringify(r.pricing.driverLabels) !== JSON.stringify([BODY, SCREEN, TOP]))
    throw new Error(`แกนตารางของ "${r.label}" เปลี่ยนแล้ว: ${JSON.stringify(r.pricing.driverLabels)} — ตรวจก่อน`);

const SCREENS = groupOf(SCREEN).choices.map((c) => c.name);
const ONE_SIDE_UNDER = SCREENS.find((n) => /^สกรีน 1 ด้าน \(ใต้\)/.test(n));
const TWO_SIDE = SCREENS.filter((n) => /2 ด้าน/.test(n));
if (!ONE_SIDE_UNDER || !TWO_SIDE.length) throw new Error(`กลุ่ม "${SCREEN}" เปลี่ยนโครงแล้ว (${SCREENS.join(" · ")}) — ตรวจก่อน`);
const BODY_SIZES = groupOf(BODY).choices.map((c) => parseInt(c.name, 10));
const TOP_SIZES = groupOf(TOP).choices.map((c) => parseInt(c.name, 10));
const BASE_SIZES = groupOf(BASE_SIZE).choices.map((c) => parseInt(c.name, 10));

/**
 * ค่าสกรีน 2 ด้านของแต่ละขนาด — ตารางเว็บมีถึง 16cm
 * ที่เหลือ (17-20cm) ถอดกลับจากตารางเรทที่ 1 เดิมของสินค้า: (2 ด้าน − 1 ด้าน) ที่แผ่นบน 2cm = SF[body] + SF[2]
 */
const SF = {};
const SF_TOP2 = WEB_2SIDE[2];
if (!Number.isFinite(SF_TOP2)) throw new Error("ตารางเว็บไม่มีค่าสกรีนของขนาด 2cm — ตรวจก่อน");
for (const s of new Set([...BODY_SIZES, ...TOP_SIZES])) {
  if (WEB_2SIDE[s] !== undefined) {
    SF[s] = WEB_2SIDE[s];
    continue;
  }
  const one = before.priceRates.find((r) => /เรทที่ 1/.test(r.label)).pricing.cells[`${cm(s)}│${ONE_SIDE_UNDER}│${cm(2)}`];
  const two = before.priceRates.find((r) => /เรทที่ 1/.test(r.label)).pricing.cells[`${cm(s)}│${TWO_SIDE[0]}│${cm(2)}`];
  if (!one || !two) throw new Error(`ถอดค่าสกรีนขนาด ${s}cm จากตารางเดิมไม่ได้ — ไม่มีช่องราคา`);
  SF[s] = two[0] - one[0] - SF_TOP2;
}

/* ══ 3. สร้างตารางราคาใหม่ทั้งสองเรท (ยังไม่บวกฐาน) ═════════════════════ */
const buildCells = (sheet, sizes) => {
  const cells = {};
  for (const b of sizes)
    for (const sc of SCREENS) {
      const twoSide = TWO_SIDE.includes(sc);
      for (const t of TOP_SIZES)
        cells[`${cm(b)}│${sc}│${cm(t)}`] = sheet[b].map(
          (p) => p + (twoSide ? SF[b] : 0) + STOPPER_FEE + topPlatePrice(t) + (twoSide ? SF[t] : 0)
        );
    }
  return cells;
};
const sizes1 = BODY_SIZES.filter((s) => s1.map[s]);
const sizes2 = BODY_SIZES.filter((s) => s2.map[s]);
if (sizes1.length !== BODY_SIZES.length)
  throw new Error(`ตารางเรทที่ 1 ไม่มีขนาด ${BODY_SIZES.filter((s) => !s1.map[s]).join(",")} cm — ตรวจก่อน`);
if (!sizes2.length) throw new Error("ตารางเรทที่ 2 ไม่มีขนาดที่สินค้านี้ขายเลย — ตรวจก่อน");

rate1.pricing.tiers = s1.tiers.map((label) => ({ upTo: tierUpTo(label), label: prettyTier(label) }));
rate1.pricing.cells = buildCells(s1.map, sizes1);
rate2.pricing.tiers = s2.tiers.map((label) => ({ upTo: tierUpTo(label), label: prettyTier(label) }));
rate2.pricing.cells = buildCells(s2.map, sizes2);
d.pricing = structuredClone(rate1.pricing); // ตารางกระจกของเรทแรก (หน้าร้านอ่าน priceRates ก่อนเสมอ)

/* ══ 4. ค่าฐาน — 2 ขั้นแบบชุด standy (ผู้ใช้สั่งกลับ 2 ก.ย. 69) ═════════
 *      ปลีก 1-10 ชิ้น: ไม่เกิน 6 ซม. ฟรี · 7 ซม.ขึ้นไป ซม.ละ 5 (extraBelow)
 *      ตั้งแต่ 11 ชิ้น: ตารางราคาฐานของร้าน (extra) */
const BASE_RETAIL_FREE_TO = 6;
const BASE_RETAIL_STEP = 5;
const baseRetailFee = (n) => Math.max(0, n - BASE_RETAIL_FREE_TO) * BASE_RETAIL_STEP;
const baseSizeGroup = groupOf(BASE_SIZE);
baseSizeGroup.extraFromQty = 11;
for (const c of baseSizeGroup.choices) {
  const n = parseInt(c.name, 10);
  const web = BASE_PLAIN[n] ?? BASE_PLAIN[BASE_FALLBACK_CM];
  if (!Number.isFinite(web)) throw new Error(`ตารางราคาฐานไม่มีขนาด ${c.name} — ตรวจก่อน`);
  c.extra = web;
  const below = baseRetailFee(n);
  if (below) c.extraBelow = below;
  else delete c.extraBelow; // 0 = ไม่เก็บฟิลด์
}
const printChoice = groupOf(BASE_PLATE).choices.find((c) => c.name === "สกรีนฐาน");
if (!printChoice) throw new Error(`กลุ่ม "${BASE_PLATE}" ไม่มีตัวเลือก "สกรีนฐาน" แล้ว — ตรวจก่อน`);
printChoice.extra = BASE_PRINT_FEE;

/* ══ 5. เฉดอะคริลิคพิเศษ — ของตัวสแตนดี้ และของฐาน ═══════════════════ */
const applyShade = (groups, sizes, kind, mkLabel) => {
  if (groups.length !== sizes.length)
    throw new Error(`กลุ่มเฉดพิเศษของ${kind} ${groups.length} กลุ่ม ≠ ${sizes.length} ขนาด — ตรวจก่อน`);
  groups.forEach((g, i) => {
    const s = sizes[i];
    const retail = SPECIAL_RETAIL[s];
    const wholesale = SPECIAL_WHOLESALE[s];
    if (!Number.isFinite(retail) || !Number.isFinite(wholesale))
      throw new Error(`ตาราง Add on อะคริลิคพิเศษ ไม่มีขนาด ${s}cm — ตรวจก่อน`);
    g.label = mkLabel(s, retail, wholesale);
    if (retail === wholesale) delete g.smallQtyFee;
    else g.smallQtyFee = { fee: retail, upToQty: 10 };
    for (const c of g.choices) c.extra = wholesale;
  });
};
/** กลุ่มเฉดเรียงตามขนาดที่มันผูกอยู่ (showWhen) — ยึด showWhen ไม่ใช่ลำดับใน options */
const shadeGroupsFor = (driverLabel, sizes, kind) => {
  const byChoice = new Map((d.options ?? []).filter((o) => o.showWhen?.label === driverLabel).map((o) => [o.showWhen.choices?.[0], o]));
  return sizes.map((s, i) => {
    const key = driverLabel === BODY ? cm(s) : groupOf(driverLabel).choices[i].name;
    const g = byChoice.get(key);
    if (!g) throw new Error(`ไม่เจอกลุ่มเฉดพิเศษของ${kind}ที่ผูกกับ "${key}" — ตรวจก่อน`);
    return g;
  });
};
applyShade(
  shadeGroupsFor(BODY, BODY_SIZES, "ตัวสแตนดี้"),
  BODY_SIZES,
  "ตัวสแตนดี้",
  (s, r, w) =>
    r === w
      ? `เลือกสีพิเศษ (ตัวสแตนดี้ ${s} ซม. · +${w} บาท/ชิ้น)`
      : `เลือกสีพิเศษ (ตัวสแตนดี้ ${s} ซม. · 1-10 ชิ้น +${r} · 11 ชิ้นขึ้นไป +${w} บาท/ชิ้น)`
);
applyShade(
  shadeGroupsFor(BASE_SIZE, BASE_SIZES, "ฐานสแตนดี้"),
  BASE_SIZES,
  "ฐานสแตนดี้",
  (s, r, w) =>
    r === w
      ? `เลือกสีพิเศษของฐาน (ขนาดฐาน ${s} ซม. · +${w} บาท/ชิ้น)`
      : `เลือกสีพิเศษของฐาน (ขนาดฐาน ${s} ซม. · 1-10 ชิ้น +${r} · 11 ชิ้นขึ้นไป +${w} บาท/ชิ้น)`
);

/* ══ 6. ช่วงราคา ════════════════════════════════════════════════════ */
const all = [d.pricing, ...d.priceRates.map((r) => r.pricing)].flatMap((m) => Object.values(m.cells).flat());
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);

/* ══ 7. ข้อความที่บอกกติกาค่าฐาน — ต้องตรงกับกติกา 2 ขั้น ══════════════
 * แต่ละรายการ: [เจ้าของ, ฟิลด์, [ข้อความเก่าที่ยอมรับ (รุ่นก่อน ๆ ทุกรุ่น)], ข้อความใหม่] */
const baseLadder = `3-5 ซม. ${BASE_PLAIN[3]} · 6-7 ซม. ${BASE_PLAIN[6]} · 8 ซม. ${BASE_PLAIN[8]} · 20 ซม. ${BASE_PLAIN[20]} บาท/ชิ้น`;
const retailRule = `1-10 ชิ้น ฐานไม่เกิน ${BASE_RETAIL_FREE_TO} ซม. ฟรี · ${BASE_RETAIL_FREE_TO + 1} ซม.ขึ้นไปเพิ่ม ซม.ละ ${BASE_RETAIL_STEP} บาท`;
const swaps = [
  [
    () => d.priceRates[0],
    "desc",
    [
      "ราคารวมแผ่นบน + จุกใส + ฐานแล้ว",
      "ราคารวมแผ่นบน + จุกใส แล้ว (ค่าฐานคิดเพิ่มตามขนาดฐาน)",
    ],
    `ราคารวมแผ่นบน + จุกใส แล้ว (ค่าฐาน: ${retailRule} · ตั้งแต่ 11 ชิ้น คิดตามตารางร้าน)`,
  ],
  [
    () => d.tabs[0],
    "text",
    [
      "• ราคาต่อชิ้นรวมค่าจุกใสแล้ว (ปกติชุดละ 10 บาท) และรวมฐานสแตนดี้แล้ว",
      `• ราคาต่อชิ้นรวมค่าจุกใสแล้ว (ปกติชุดละ 10 บาท) · ค่าฐานคิดเพิ่มตามขนาดฐานที่เลือก (${baseLadder})`,
    ],
    `• ราคาต่อชิ้นรวมค่าจุกใสแล้ว (ปกติชุดละ 10 บาท) · ค่าฐาน ${retailRule} · ตั้งแต่ 11 ชิ้น คิดตามตาราง (${baseLadder})`,
  ],
  [
    () => d.tabs[3],
    "text",
    [
      "ฐานรวมอยู่ในราคาแล้ว::\n• ทุกชิ้นได้ฐานอะคริลิค เลือกได้ว่าจะสกรีนลายลงฐานด้วยหรือไม่ (สกรีนฐาน +10 บาท/ชิ้น)\n• ขนาดฐาน 2-20 ซม. — ช่วงราคาปลีก 1-10 ชิ้น ฐานเล็ก (ไม่เกิน 6 ซม.) รวมในราคาแล้ว\n• ตั้งแต่ 11 ชิ้นขึ้นไป ค่าฐานคิดตามตารางของร้าน: 3-5 ซม. +10 · 8 ซม. +20 · 20 ซม. +80 บาท/ชิ้น",
      `ค่าฐานคิดแยกจากราคาในตาราง::\n• ทุกชิ้นได้ฐานอะคริลิค เลือกได้ว่าจะสกรีนลายลงฐานด้วยหรือไม่ (สกรีนฐาน +${BASE_PRINT_FEE} บาท/ชิ้น)\n• ขนาดฐาน 2-20 ซม. — ค่าฐานคิดตามตารางของร้านทุกจำนวน: ${baseLadder}\n• ราคาที่แสดงในตารางเรทเป็นค่าตัวสแตนดี้ + แผ่นบน + จุกใส — ค่าฐานบวกเพิ่มตามขนาดที่เลือก`,
    ],
    `ค่าฐานคิดแยกจากราคาในตาราง::\n• ทุกชิ้นได้ฐานอะคริลิค เลือกได้ว่าจะสกรีนลายลงฐานด้วยหรือไม่ (สกรีนฐาน +${BASE_PRINT_FEE} บาท/ชิ้น)\n• ขนาดฐาน 2-20 ซม. — ช่วงปลีก ${retailRule} (7 ซม. +5 · 8 ซม. +10 · ไปจนถึง 20 ซม. +70)\n• ตั้งแต่ 11 ชิ้นขึ้นไป ค่าฐานคิดตามตารางของร้าน: ${baseLadder}\n• ราคาที่แสดงในตารางเรทเป็นค่าตัวสแตนดี้ + แผ่นบน + จุกใส — ค่าฐานบวกเพิ่มตามขนาดที่เลือก`,
  ],
  [
    () => d.seo.faqs[3],
    "a",
    [
      "รวมแล้ว ทุกชิ้นได้ฐานอะคริลิค เลือกทรงกลม/สี่เหลี่ยมได้ไม่บวกเพิ่ม · ช่วง 11 ชิ้นขึ้นไปฐานขนาดใหญ่คิดเพิ่มตามตาราง และเลือกสกรีนลายลงฐานได้",
      `ยังไม่รวม — ราคาในตารางเป็นค่าตัวสแตนดี้ + แผ่นบน + จุกใส · ค่าฐานคิดเพิ่มตามขนาดฐานทุกจำนวน (${baseLadder}) · ทรงกลม/สี่เหลี่ยมไม่บวกเพิ่ม และเลือกสกรีนลายลงฐานได้ +${BASE_PRINT_FEE} บาท/ชิ้น`,
    ],
    `ยังไม่รวม — ราคาในตารางเป็นค่าตัวสแตนดี้ + แผ่นบน + จุกใส · ค่าฐาน ${retailRule} · ตั้งแต่ 11 ชิ้น คิดตามตาราง (${baseLadder}) · ทรงกลม/สี่เหลี่ยมไม่บวกเพิ่ม และเลือกสกรีนลายลงฐานได้ +${BASE_PRINT_FEE} บาท/ชิ้น`,
  ],
];
for (const [ownerFn, key, froms, to] of swaps) {
  const owner = ownerFn();
  if (!owner || typeof owner[key] !== "string") throw new Error(`หาข้อความที่ต้องแก้ไม่เจอ (${key}) — โครงสินค้าเปลี่ยน`);
  if (owner[key].includes(to)) continue; // รันซ้ำ
  const from = froms.find((f) => owner[key].includes(f));
  if (!from) throw new Error(`ข้อความเดิมเปลี่ยนไปแล้ว หาไม่เจอสักรุ่น:\n"${froms[froms.length - 1]}"\nในค่า:\n"${owner[key].slice(0, 300)}"`);
  owner[key] = owner[key].replace(from, to);
}
/* ข้อความที่มีตัวเลข "เริ่มต้น N บาท" ปนอยู่ — เขียนใหม่ทั้งประโยคด้วยเลขปัจจุบัน */
const startsAt = `เริ่มต้น ${d.priceMin} บาท`;
d.description = d.description
  .replace(/ราคาต่อชิ้นรวมทั้ง 2 แผ่น \+ จุกใส \+ ฐานแล้ว/, "ราคาต่อชิ้นรวมทั้ง 2 แผ่น + จุกใส แล้ว (ค่าฐานคิดเพิ่มตามขนาดฐาน)")
  .replace(/เริ่มต้น \d+ บาท/, startsAt);
d.seo.description = d.seo.description.replace(/เริ่มต้น \d+ บาท/, startsAt);
d.seo.faqs[0].a = d.seo.faqs[0].a
  .replace(/ราคารวมทั้ง 2 แผ่น จุกใส และฐานแล้ว/, "ราคารวมทั้ง 2 แผ่นและจุกใสแล้ว (ยังไม่รวมค่าฐาน)")
  .replace(/เริ่มต้นชิ้นละ \d+ บาท/, `เริ่มต้นชิ้นละ ${d.priceMin} บาท`);
{
  /* กันข้อความเก่าที่ยังบอกว่า "ราคารวมฐานแล้ว" หลงเหลือ — ต้องไม่มีเลยหลังแก้
   * (เทียบเป็นวลีเป๊ะ ๆ ไม่ใช้ regex กว้าง — ไม่งั้นไปโดน "ขนาดที่สั่งไม่นับรวมฐาน" ที่ถูกอยู่แล้ว) */
  const STALE_PHRASES = [
    "รวมฐานสแตนดี้แล้ว",
    "จุกใส + ฐานแล้ว",
    "จุกใส และฐานแล้ว",
    "ฐานรวมอยู่ในราคาแล้ว",
    "ฐานเล็ก (ไม่เกิน 6 ซม.) รวมในราคาแล้ว",
    // รุ่น "คิดทุกช่วงจำนวน" (ถูกยกเลิก 2 ก.ย. 69) — ต้องไม่เหลือ
    "ค่าฐานคิดตามตารางของร้านทุกจำนวน",
    "ค่าฐานคิดเพิ่มตามขนาดฐานทุกจำนวน",
  ];
  const stale = [];
  const walk = (o, path) => {
    if (typeof o === "string") {
      if (STALE_PHRASES.some((x) => o.includes(x))) stale.push(`${path}: ${o.slice(0, 160)}`);
      return;
    }
    if (o && typeof o === "object") for (const k of Object.keys(o)) walk(o[k], `${path}.${k}`);
  };
  for (const [k, v] of Object.entries({ description: d.description, seo: d.seo, tabs: d.tabs, priceRates: d.priceRates.map((r) => r.desc) })) walk(v, k);
  if (stale.length) throw new Error(`ยังมีข้อความบอกว่า "ราคารวมฐานแล้ว" หลงเหลืออยู่ — ตรวจก่อนเขียน\n  ${stale.join("\n  ")}`);
}

/* ══ 8. รายงาน ══════════════════════════════════════════════════════ */
const money = (n) => `฿${n}`;
console.log(`\n📦 ${NAME} (${ID})`);
console.log(`   เรทที่ 1: ${Object.keys(rate1.pricing.cells).length} ช่อง × ${rate1.pricing.tiers.length} ช่วง · ขนาด ${sizes1.join(",")} cm`);
console.log(`   เรทที่ 2: ${Object.keys(rate2.pricing.cells).length} ช่อง × ${rate2.pricing.tiers.length} ช่วง · ขนาด ${sizes2.join(",")} cm`);
console.log(`   ค่าฐาน 1-10 ชิ้น : ${baseSizeGroup.choices.map((c) => `${c.name} +${c.extraBelow ?? 0}`).join(" · ")}`);
console.log(`   ค่าฐาน 11 ชิ้นขึ้นไป: ${baseSizeGroup.choices.map((c) => `${c.name} +${c.extra}`).join(" · ")}`);
console.log(`   ช่วงราคา: ${before.priceMin}-${before.priceMax} → ${d.priceMin}-${d.priceMax} (ยังไม่รวมฐาน)`);

console.log("\n   ตรวจกับใบเสนอราคาของร้าน (ตัว 6cm · สกรีน 1 ด้าน (ใต้) · แผ่นบน 2cm · ฐานใส ทรงกลม 3cm):");
const cellAt = (rate, tier) => rate.pricing.cells[`${cm(6)}│${ONE_SIDE_UNDER}│${cm(2)}`][tier];
for (const [qty, rate, tier, quote] of [
  [1, rate1, 0, 170],
  [11, rate1, 1, 109],
  [50, rate2, 0, 95],
]) {
  // ฐาน 3cm: ปลีก 1-10 ชิ้น ฟรี (≤6 ซม.) · ตั้งแต่ 11 ชิ้น ตามตาราง
  const baseFee = qty <= 10 ? baseRetailFee(3) : BASE_PLAIN[3];
  const unit = cellAt(rate, tier) + baseFee;
  const tag = unit === quote ? "= ใบเสนอราคา ✅" : `≠ ใบเสนอราคา ${money(quote)} (ต่าง ${unit - quote > 0 ? "+" : ""}${unit - quote})`;
  console.log(`     ${String(qty).padStart(3)} ชิ้น → ตาราง ${money(cellAt(rate, tier))} + ฐาน ${money(baseFee)} = ${money(unit)}  ${tag}`);
}
if (cellAt(rate1, 0) + baseRetailFee(3) !== 170)
  throw new Error("ช่วงปลีกไม่ตรงใบเสนอราคา 170 บาท — ตรวจก่อนเขียน");

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d, price: d.priceMin }).eq("id", ID);
if (e2) throw new Error(`บันทึกไม่ได้ — ${e2.message}`);
console.log("\n💾 บันทึกแล้ว");
