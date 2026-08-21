#!/usr/bin/env node
/**
 * "GRIPTOK MAGSAFE" (griptok-magsafe) — ดึงราคาจากเว็บตารางราคา + อัปภาพ + เขียนสินค้า
 *
 *   node scripts/griptok-magsafe-art.mjs          # เตรียมภาพประจำตัวเลือกก่อน (.cache/griptok-magsafe/upload)
 *   node scripts/griptok-magsafe-apply.mjs        # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/griptok-magsafe-apply.mjs --write
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/griptok
 *   บล็อกหัวข้อ "GRIPTOK MAGSAFE UV Printing" (หน้านั้นมี GRIPTOK หลายแบบ จึงยึด "หัวข้อ" ไม่ใช่ลำดับตาราง)
 *   ในบล็อกมี 2 ตาราง:
 *     ตารางหลัก 5 คอลัมน์ : จำนวน | ทรงกลม | ทรงรี | ทรงกลม | ทรงรี
 *                            คู่ซ้าย = แบบ A (สำเร็จรูป) · คู่ขวา = แบบ B (แยกชิ้น)
 *                            หัวคอลัมน์บนเว็บซ้ำกัน 2 รอบ ป้าย "แบบ A"/"แบบ B" เป็นข้อความใต้ตาราง
 *     ตาราง Add On         : เพิ่มแผ่นอะคริลิคไดคัท 5-10 cm (ช่วงจำนวนคนละชุดกับตารางหลัก)
 *   สคริปต์อ่านสดทุกครั้ง ราคาบนเว็บเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * ⚠️ ตารางหลักกับตาราง Add On แบ่งช่วงจำนวนไม่เหมือนกัน (50-99/100-499 กับ 50-199/200-499)
 *    จึงรวมเป็นชุดช่วงเดียว (union) แล้วดึงราคาของแต่ละตารางมาตามช่วงที่ครอบอยู่
 *    ผลลัพธ์ที่ทุกจำนวนยังตรงกับเว็บเป๊ะ ๆ — ดูตารางเทียบที่สคริปต์พิมพ์ออกมาก่อนใส่ --write
 *
 * ⚠️ ตัวเลขในหมายเหตุ (ไม่รับตัว Griptok ลด 15 · coil base 15) ก็อ่านจากเว็บ ไม่ได้พิมพ์ทับไว้
 *    ข้อความบนเว็บเปลี่ยนรูปประโยคเมื่อไหร่ = สคริปต์หยุด ให้มาดูก่อนว่าเงื่อนไขเปลี่ยนจริงไหม
 *
 * ⚠️ "ไม่รับตัว Griptok (ลด 15)" ไม่ทำเป็นกลุ่มตัวเลือกให้ลูกค้ากด (ผู้ใช้สั่งถอดออก 21 ส.ค. 69)
 *    เหลือไว้เป็นข้อความในแท็บ/ข้อตกลงว่าให้แจ้งหมายเหตุถึงร้านแทน — อย่าเผลอเพิ่มกลับ
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v2 ครั้งหน้าขึ้น v3
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const REFRESH = process.argv.includes("--refresh");
const ID = "griptok-magsafe";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/griptok-magsafe/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/griptok";
const SECTION = "GRIPTOK MAGSAFE UV Printing";
const NAME = "GRIPTOK MAGSAFE";
const V = "v2";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = [NAME];

const UNIT = "ชิ้น";
const MODE_LABEL = "แบบ";
const SHAPE_LABEL = "ทรง";
const ADDON_LABEL = "เพิ่มแผ่นอะคริลิค (Add On)";
const COIL_LABEL = "Magsafe coil base";

const MODE_A = "แบบ A (สำเร็จรูป)";
const MODE_B = "แบบ B (แยกชิ้น)";
const ADDON_NONE = "ไม่เพิ่ม";

/* ── 1. ดึงบล็อก "GRIPTOK MAGSAFE UV Printing" จากหน้าเว็บ ──────────── */

const decode = (s) =>
  String(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
/**
 * ⚠️ ข้อความบางที่บนหน้าเว็บมีอักขระ NUL (\u0000) ปนอยู่จริง เช่น "1-10 ช\0\0ิ้น (เลือกตะขอ +10)"
 *    ถ้าไม่ล้างทิ้ง Postgres จะไม่ยอมบันทึก jsonb ("unsupported Unicode escape sequence")
 */
const strip = (s) =>
  decode(String(s).replace(/<[^>]+>/g, " "))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * ⚠️ Wix สลับส่ง 2 แบบ: หน้าที่เรนเดอร์มาแล้ว (มี <table> ~4.8MB) กับหน้าเปล่าที่ให้เบราว์เซอร์
 * ไปประกอบเอง (~460KB ไม่มีตารางเลย) — ยิงตอนไหนได้แบบไหนเดาไม่ได้
 * จึงลองซ้ำจนกว่าจะได้หน้าที่มีบล็อกนี้จริง แล้วเก็บลงแคชกลางที่ pricelist-scrape.mjs ใช้ร่วมกัน
 */
const CACHE = new URL("../.cache/pricelist/griptok.html", import.meta.url).pathname;
/**
 * หน้าที่ใช้ได้ = มี <table> จริง (หน้าเปล่าไม่มีเลยสักอัน)
 * ⚠️ อย่าเช็คด้วยหัวข้อเต็ม "GRIPTOK MAGSAFE UV Printing" — ในหน้าจริงข้อความถูกซอยด้วย <span>
 *    ตัวหนังสือจึงไม่ติดกันใน HTML ดิบ (ต้อง strip แท็กก่อน) · เช็คแค่คำว่า MAGSAFE พอ
 */
const usable = (h) => h.includes("<table") && h.includes("MAGSAFE");

async function loadPage() {
  if (!REFRESH && existsSync(CACHE)) {
    const cached = readFileSync(CACHE, "utf8");
    if (usable(cached)) return { html: cached, from: `แคช ${CACHE}` };
  }
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(PAGE, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${res.status}`);
    const fresh = await res.text();
    if (usable(fresh)) {
      writeFileSync(CACHE, fresh);
      return { html: fresh, from: `เว็บสด (ครั้งที่ ${i})` };
    }
    console.log(`   … ครั้งที่ ${i} Wix ส่งหน้าที่ยังไม่เรนเดอร์ตารางมา (${Math.round(fresh.length / 1024)} KB) ลองใหม่`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (existsSync(CACHE) && usable(readFileSync(CACHE, "utf8"))) {
    console.log(`   ⚠️ ดึงสดไม่สำเร็จ 5 ครั้ง — ใช้แคชเดิมแทน (${CACHE})`);
    return { html: readFileSync(CACHE, "utf8"), from: `แคชเดิม ${CACHE}` };
  }
  throw new Error(`Wix ส่งแต่หน้าเปล่า (ให้เบราว์เซอร์เรนเดอร์เอง) และไม่มีแคชไว้ — ลองใหม่ภายหลัง`);
}

const { html, from: pageFrom } = await loadPage();

/**
 * ไล่อ่านหน้าเว็บเป็น "ก้อน" ตามลำดับเอกสาร (ตาราง / ย่อหน้า / หัวข้อ)
 * ⚠️ ต้องเก็บตารางก่อน แล้วค่อยตัดย่อหน้าที่คร่อมตารางทิ้ง — หน้านี้มี <p> ที่ครอบ <table>
 *    ไว้ข้างใน ถ้าจับด้วย regex สลับกันตารางจะถูกย่อหน้ากลืนหายไปทั้งอัน
 */
function blocks() {
  const tables = [];
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows = [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) =>
      [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => strip(c[1]))
    );
    if (rows.length > 1) tables.push({ at: m.index, end: m.index + m[0].length, table: rows });
  }
  const texts = [];
  for (const m of html.matchAll(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>/gi)) {
    if (tables.some((t) => m.index < t.end && m.index + m[0].length > t.at)) continue; // ย่อหน้าที่คร่อมตาราง
    const s = strip(m[0]);
    if (s && !/^\.comp-/.test(s)) texts.push({ at: m.index, text: s });
  }
  return [...tables, ...texts].sort((a, b) => a.at - b.at);
}

const ALL = blocks();
const start = ALL.findIndex((b) => b.text === SECTION);
if (start < 0) throw new Error(`หาหัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
// หัวข้อสินค้าตัวถัดไปบนหน้าเดียวกัน — ตัวพิมพ์ใหญ่ล้วน + ลงท้าย "UV Printing"
// (อย่าจับแค่ /^griptok/i — ในบล็อกนี้มีข้อความ "Griptok แยกกับฐาน Magsafe" ที่จะกลายเป็นจุดจบผิด ๆ)
const end = ALL.findIndex((b, i) => i > start && b.text && /^GRIPTOK\s.*UV Printing$/.test(b.text));
if (end < 0) throw new Error(`หาจุดจบของบล็อก "${SECTION}" ไม่เจอ (หัวข้อ GRIPTOK ... UV Printing ถัดไป) — โครงหน้าเว็บอาจเปลี่ยน`);
const SEC = ALL.slice(start, end);

const TABLES = SEC.filter((b) => b.table);
if (TABLES.length !== 2)
  throw new Error(`บล็อก "${SECTION}" ควรมี 2 ตาราง (ตารางหลัก + Add On) แต่เจอ ${TABLES.length} — โครงหน้าเว็บเปลี่ยน`);

/** "1-10 ชิ้น" → upTo 10 · "500 ชิ้นขึ้นไป" / "500++" → upTo null */
const tierOf = (label) => {
  const m = label.match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)/);
  return { upTo: m ? Number(m[2].replace(/,/g, "")) : null, label: label.replace(/\s+/g, " ").trim() };
};

/** ตาราง (ช่วงจำนวน × คอลัมน์) → { tiers, cols: [{head, prices[]}] } */
function grid(rows, what) {
  const tiers = rows.slice(1).map((r) => tierOf(r[0]));
  tiers.at(-1).upTo = null; // ช่วงสุดท้ายเปิดปลายเสมอ
  if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo))
    throw new Error(`ช่วงจำนวนของตาราง${what}อ่านไม่ครบ — ตรวจหน้าเว็บก่อน`);
  const cols = rows[0].slice(1).map((head, ci) => ({
    head,
    prices: rows.slice(1).map((r) => {
      const n = Number(String(r[ci + 1]).replace(/[^\d]/g, ""));
      if (!n) throw new Error(`ตาราง${what} แถว "${r[0]}" คอลัมน์ "${head}" อ่านราคาไม่ออก ("${r[ci + 1]}")`);
      return n;
    }),
  }));
  return { tiers, cols };
}

/* ตารางหลัก — 4 คอลัมน์ราคา: (ทรงกลม, ทรงรี) ของแบบ A แล้วต่อด้วยของแบบ B */
const MAIN = grid(TABLES[0].table, "หลัก");
if (MAIN.cols.length !== 4)
  throw new Error(`ตารางหลักควรมี 4 คอลัมน์ราคา (2 ทรง × 2 แบบ) แต่เจอ ${MAIN.cols.length} — โครงหน้าเว็บเปลี่ยน`);
const [circleHead, ovalHead] = [MAIN.cols[0].head, MAIN.cols[1].head];
if (MAIN.cols[2].head !== circleHead || MAIN.cols[3].head !== ovalHead)
  throw new Error(
    `หัวคอลัมน์ตารางหลักไม่ได้ซ้ำเป็นคู่อย่างที่เคย (${MAIN.cols.map((c) => c.head).join(" | ")}) — ตรวจหน้าเว็บก่อน`
  );

/**
 * คู่คอลัมน์ไหนเป็นแบบ A / แบบ B — ยึด "ลำดับป้ายข้อความใต้ตาราง" (แบบ A มาก่อนแบบ B)
 * แล้วเช็คซ้ำว่าราคาคู่หลัง ≥ คู่หน้า (แบบ B แยกชิ้นได้ ราคาสูงกว่าเสมอ)
 */
// ⚠️ ป้าย "แบบ A" อยู่ใน <p> ก้อนเดียวกับตาราง จึงไม่โผล่เป็นก้อนข้อความแยก — อ่านจาก HTML ดิบช่วงระหว่าง 2 ตารางแทน
const between = strip(html.slice(TABLES[0].end, TABLES[1].at));
const iA = between.search(/แบบ\s*A\b/);
const iB = between.search(/แบบ\s*B\b/);
if (iA < 0 || iB < 0 || iA > iB)
  throw new Error(`ป้าย "แบบ A"/"แบบ B" ใต้ตารางหลักไม่ได้เรียง A→B ("${between.slice(0, 160)}") — ตรวจหน้าเว็บก่อน`);
for (const i of [0, 1])
  if (MAIN.cols[i + 2].prices.some((p, k) => p < MAIN.cols[i].prices[k]))
    throw new Error(`ราคาคู่คอลัมน์ที่ 2 (ควรเป็นแบบ B) ต่ำกว่าคู่แรก — คู่คอลัมน์อาจสลับกับเว็บแล้ว ตรวจก่อน`);

const MODE_COLS = {
  [MODE_A]: { [circleHead]: MAIN.cols[0], [ovalHead]: MAIN.cols[1] },
  [MODE_B]: { [circleHead]: MAIN.cols[2], [ovalHead]: MAIN.cols[3] },
};

/* ตาราง Add On — คอลัมน์เป็นขนาดแผ่นอะคริลิค 5cm..10cm */
const ADDON = grid(TABLES[1].table, "Add On แผ่นอะคริลิค");
const addonHead = SEC.find((b) => b.at < TABLES[1].at && b.at > TABLES[0].at && b.text && /Add\s*On/i.test(b.text))?.text;
if (!addonHead) throw new Error(`ไม่เจอหัวข้อ "Add On ..." เหนือตารางที่ 2 — ตารางที่ 2 อาจไม่ใช่ Add On แล้ว ตรวจก่อน`);
if (!ADDON.cols.every((c) => /^\d+\s*cm$/i.test(c.head)))
  throw new Error(`คอลัมน์ตาราง Add On ควรเป็นขนาด cm ทั้งหมด แต่เจอ "${ADDON.cols.map((c) => c.head).join(" | ")}"`);

/* ── 2. รวมช่วงจำนวนของ 2 ตารางเป็นชุดเดียว ────────────────────────── */

const bounds = [...new Set([...MAIN.tiers, ...ADDON.tiers].map((t) => t.upTo).filter((u) => u != null))].sort((a, b) => a - b);
const tiers = [...bounds, null].map((upTo, i, arr) => {
  const from = i === 0 ? 1 : arr[i - 1] + 1;
  return { upTo, label: upTo == null ? `${from} ${UNIT}ขึ้นไป` : `${from}-${upTo} ${UNIT}` };
});

/** ราคาในตาราง src ที่ครอบช่วง upTo นี้ (ช่วงแรกของ src ที่กว้างพอ) */
const priceAt = (src, col, upTo) => {
  const i = upTo == null ? src.tiers.length - 1 : src.tiers.findIndex((t) => t.upTo == null || t.upTo >= upTo);
  return col.prices[i];
};

const ADDON_CHOICES = [ADDON_NONE, ...ADDON.cols.map((c) => c.head)];
const addonCol = (name) => (name === ADDON_NONE ? null : ADDON.cols.find((c) => c.head === name));

const cells = {};
for (const mode of [MODE_A, MODE_B])
  for (const shape of [circleHead, ovalHead])
    for (const addon of ADDON_CHOICES) {
      const base = MODE_COLS[mode][shape];
      const plus = addonCol(addon);
      cells[`${mode}│${shape}│${addon}`] = tiers.map((t) => priceAt(MAIN, base, t.upTo) + (plus ? priceAt(ADDON, plus, t.upTo) : 0));
    }

const PRICING = { unit: UNIT, driverLabels: [MODE_LABEL, SHAPE_LABEL, ADDON_LABEL], tiers, cells };

/* ── 3. เงื่อนไข/ตัวเลขในหมายเหตุ — อ่านจากเว็บ ไม่พิมพ์ทับ ─────────── */

const noteText = SEC.filter((b) => b.text).map((b) => b.text);
const note = (re) => noteText.find((t) => re.test(t));

const freeMixBelow = Number(note(/(\d+)\s*[-–]\s*(\d+)\s*ชิ้น\s*สามารถคละลายได้/)?.match(/[-–]\s*(\d+)/)?.[1]);
const mixFrom = Number(note(/ตั้งแต่\s*(\d+)\s*ชิ้นขึ้นไป\s*คละลาย/)?.match(/ตั้งแต่\s*(\d+)/)?.[1]);
const mixMin = Number(note(/คละลาย\s*คละขนาด\s*ขั้นต่ำ\s*(\d+)\s*ชิ้น/)?.match(/ขั้นต่ำ\s*(\d+)/)?.[1]);
if (!freeMixBelow || !mixFrom || !mixMin || mixFrom !== freeMixBelow + 1)
  throw new Error(`อ่านเงื่อนไขคละลายจากหมายเหตุไม่ออก (คละอิสระถึง ${freeMixBelow} · ตั้งแต่ ${mixFrom} ขั้นต่ำ ${mixMin}) — ตรวจหน้าเว็บก่อน`);

const noGriptokOff = Number(note(/แบบ\s*B\s*หากไม่รับตัว\s*Griptok\s*จะลด\s*(\d+)\s*บาท/)?.match(/ลด\s*(\d+)/)?.[1]);
if (!noGriptokOff) throw new Error(`อ่านส่วนลด "แบบ B ไม่รับตัว Griptok" จากหน้าเว็บไม่ออก — ตรวจหน้าเว็บก่อน`);

const coilPrice = Number(note(/Magsafe\s*coil\s*base\s*อันละ\s*(\d+)\s*บาท/i)?.match(/อันละ\s*(\d+)/)?.[1]);
if (!coilPrice) throw new Error(`อ่านราคา "Magsafe coil base" จากหน้าเว็บไม่ออก — ตรวจหน้าเว็บก่อน`);

const clearBaseNote = note(/Griptok\s*ฐานสี/i);
const addonHookNote = ADDON.tiers.find((t) => /\(.*\)/.test(t.label))?.label;

/* ── 4. สรุปให้ดูก่อนเขียน ──────────────────────────────────────────── */

const allPrices = Object.values(cells).flat();
const priceRow = (mode, shape, addon) => cells[`${mode}│${shape}│${addon}`];

console.log(`📊 บล็อก "${SECTION}" — ที่มา: ${pageFrom}`);
console.log(`   ตารางหลัก ${MAIN.tiers.length} ช่วง: ${MAIN.tiers.map((t) => t.label).join(" · ")}`);
for (const mode of [MODE_A, MODE_B])
  for (const shape of [circleHead, ovalHead])
    console.log(`      ${mode} × ${shape} : ${MODE_COLS[mode][shape].prices.join(" / ")}`);
console.log(`   ตาราง ${addonHead} ${ADDON.tiers.length} ช่วง: ${ADDON.tiers.map((t) => t.label).join(" · ")}`);
for (const c of ADDON.cols) console.log(`      ${c.head} : ${c.prices.join(" / ")}`);
console.log(`\n   → รวมช่วงจำนวนเป็นชุดเดียว ${tiers.length} ช่วง: ${tiers.map((t) => t.label).join(" · ")}`);
for (const mode of [MODE_A, MODE_B])
  for (const shape of [circleHead, ovalHead])
    console.log(`      ${mode} × ${shape} (ไม่เพิ่มแผ่น) : ${priceRow(mode, shape, ADDON_NONE).join(" / ")}`);
console.log(`      ตัวอย่างเพิ่มแผ่น 7cm — ${MODE_A} × ${circleHead} : ${priceRow(MODE_A, circleHead, "7cm").join(" / ")}`);
console.log(
  `   หมายเหตุจากเว็บ: คละอิสระ 1-${freeMixBelow} ${UNIT} · ตั้งแต่ ${mixFrom} ${UNIT} ลายละ ${mixMin} ${UNIT}ขึ้นไป · ` +
    `แบบ B ไม่รับตัว Griptok ลด ${noGriptokOff} บาท · coil base อันละ ${coilPrice} บาท`
);
console.log(`   → ตารางราคา ${Object.keys(cells).length} ช่อง (แบบ × ทรง × Add On) · ราคา ฿${Math.min(...allPrices)}-${Math.max(...allPrices)}/${UNIT}`);

/* ── 5. อัปภาพ + เขียนสินค้า ────────────────────────────────────────── */

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
const url = (file) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/griptok-magsafe/${file}`;

async function put(name, buf) {
  const file = `${name}.jpg`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/griptok-magsafe/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

/**
 * รูปงานจริงในแกลเลอรี (id wixstatic จากแกลเลอรี "ตัวอย่าง GRIPTOK MAGSAFE" ของบล็อกนี้)
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม ใส่เกินไว้จะหายเงียบ ๆ
 * ภาพประจำตัวเลือกอีก 15 ภาพไม่นับรวมตรงนี้ (หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-compare-ab", "959b83_c1f74e1d98324df0a2a0cd92555e3ccd~mv2.jpg", "เทียบแบบ A (สำเร็จรูป) กับแบบ B (แยกชิ้น)"],
  ["photo-compare-shape", "959b83_09fc734a43f6441fa8a135122a3b4d54~mv2.jpg", "เทียบทรงรี (Oval) กับทรงกลม (Circle)"],
  ["photo-circle-phone", "959b83_d89a8ca1f2b24de8990afd5cea349a3a~mv2.jpg", "งานจริง — ฐานทรงกลมติดหลังมือถือ"],
  ["photo-oval-phone", "959b83_4cb9495629f04f32baae7b5548a784b0~mv2.jpg", "งานจริง — ฐานทรงรีติดหลังมือถือ ลายเดียวกัน"],
  ["photo-plate", "959b83_8e96d774578b4f6d88c78ca96f3b2593~mv2.jpg", "งานจริง — เสริมแผ่นอะคริลิคไดคัทด้านหลัง"],
];

const gallery = [];
for (const [file, wixId, label] of PHOTOS) {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  gallery.push({
    emoji: "🤳",
    gradient: "from-slate-100 to-blue-100",
    label,
    src: await put(`${file}-${V}`, Buffer.from(await res.arrayBuffer())),
  });
}
console.log(`\n🖼  รูปงานจริง ${gallery.length} ภาพ (จากแกลเลอรีบล็อก "${SECTION}" บนเว็บ)`);

// ภาพประจำตัวเลือก — เตรียมไว้แล้วโดย griptok-magsafe-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const ART_FILES = [
  "mode-a",
  "mode-b",
  "shape-circle",
  "shape-oval",
  "addon-none",
  ...ADDON.cols.map((c) => `addon-${c.head.replace(/[^\d]/g, "")}`),
  "size-chart",
  "coil-base",
];
const art = {};
for (const f of ART_FILES) art[f] = await put(`${f}-${V}`, local(f));
console.log(`🖼  ภาพประจำตัวเลือก ${ART_FILES.length} ภาพ (${DIR})`);

const { data: row } = await sb.from("products").select("id,data").eq("id", ID).maybeSingle();
if (row && !EXPECT_NAMES.includes(row.data?.name))
  throw new Error(`${ID} มีอยู่แล้วและชื่อ "${row.data?.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);
const d = row ? structuredClone(row.data) : {};

d.id = ID;
d.name = NAME;
d.slug = "GRIPTOK-MAGSAFE";
d.category = "phone-gadget";
d.emoji = "🤳";
d.gradient = "from-slate-100 to-blue-100";
d.unit = UNIT;
d.price = Math.min(...allPrices);
d.badge = "ใหม่";
d.rating = 5;
d.sold = d.sold ?? 0;
d.hidden = true; // เข้ามาเป็นฉบับร่าง ให้ทีมงานตรวจแล้วกดเผยแพร่เองที่ /admin/products

d.pricing = PRICING;
d.priceRates = [
  {
    id: "r1",
    label: `ราคาต่อ${UNIT}`,
    desc: `${mixFrom} ${UNIT}ขึ้นไปคละลาย/คละขนาดได้ ลายละ ${mixMin} ${UNIT}ขึ้นไป`,
    minPerDesign: mixMin,
    freeMixBelowQty: mixFrom,
    pricing: PRICING,
  },
];

const addonImage = (name) => (name === ADDON_NONE ? art["addon-none"] : art[`addon-${name.replace(/[^\d]/g, "")}`]);

d.options = [
  {
    label: MODE_LABEL,
    stockBearing: true,
    choices: [
      { name: MODE_A, imageSrc: art["mode-a"], popular: true },
      { name: MODE_B, imageSrc: art["mode-b"] },
    ],
  },
  {
    label: SHAPE_LABEL,
    stockBearing: true,
    choices: [
      { name: circleHead, imageSrc: art["shape-circle"] },
      { name: ovalHead, imageSrc: art["shape-oval"] },
    ],
  },
  {
    label: ADDON_LABEL,
    stockBearing: true,
    choices: ADDON_CHOICES.map((name) => ({ name, imageSrc: addonImage(name) })),
  },
  {
    label: COIL_LABEL,
    display: "multi",
    stockBearing: true,
    choices: [{ name: `เพิ่ม coil base ติดในเคส (อันละ ${coilPrice} บาท)`, extra: coilPrice, imageSrc: art["coil-base"] }],
  },
];

d.images = gallery;
d.imageSrc = gallery[0].src;

d.description =
  `Griptok ฐาน Magsafe พิมพ์ลายตามสั่งด้วยระบบ UV ดูดติดหลังเคส Magsafe ได้เลย ไม่มีขั้นต่ำในการสั่งผลิต ` +
  `เลือกได้ 2 แบบ — แบบ A สำเร็จรูปประกบติดกัน และแบบ B ที่ถอดตัว Griptok ออกจากฐานได้ ` +
  `มี 2 ทรงให้เลือก ${circleHead} และ ${ovalHead} เสริมแผ่นอะคริลิคไดคัทด้านหลังได้อีก 6 ขนาด (5-10 ซม.) ` +
  `ทุกตัวเลือกมีภาพให้ดูก่อนสั่งว่าหน้าตาเป็นแบบไหน ` +
  `ยิ่งสั่งเยอะยิ่งถูก เริ่มต้น${UNIT}ละ ${d.price} บาท`;
d.highlights = [
  "2 แบบให้เลือก — แบบ A สำเร็จรูป (แกะแยกไม่ได้) · แบบ B ถอดตัว Griptok ออกจากฐานได้",
  `2 ทรง — ${circleHead} · ${ovalHead} พร้อมภาพงานจริงลายเดียวกันให้เทียบ`,
  "เสริมแผ่นอะคริลิคไดคัทด้านหลังได้ 5-10 ซม. (มีการ์ดเทียบขนาดตามสเกลจริง)",
  "พิมพ์ระบบ UV สีสด คมชัด · ฐาน Griptok เป็นสีใส",
  `ไม่มีขั้นต่ำ — สั่ง 1 ${UNIT}ก็ได้ · 1-${freeMixBelow} ${UNIT} คละลายได้อิสระ`,
  `ยิ่งสั่งเยอะยิ่งถูก — ${tiers.at(-1).label} เหลือ${UNIT}ละ ${Math.min(...allPrices)} บาท`,
];

/** บรรทัดราคาของ 1 คอลัมน์ตามช่วงจำนวน "ของเว็บ" (ไม่ใช่ช่วงที่รวมแล้ว) — ให้ตรวจย้อนกับเว็บได้ */
const webLine = (src, col) => src.tiers.map((t, i) => `${t.label} ${col.prices[i]}`).join(" · ");

d.tabs = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      "GRIPTOK MAGSAFE พิมพ์ลายตามสั่งด้วยระบบ UV — ดูดติดกับเคส Magsafe ได้เลย\n" +
      "• แบบ A — สำเร็จรูป ตัว Griptok ประกบติดกับฐาน Magsafe แกะแยกออกจากกันไม่ได้\n" +
      "• แบบ B — ตัว Griptok แยกกับฐาน Magsafe ถอดออกจากกันได้\n" +
      `• แบบ B หากไม่รับตัว Griptok ลดให้ ${UNIT}ละ ${noGriptokOff} บาท — แจ้งในหมายเหตุถึงร้านตอนสั่ง\n` +
      `• มี 2 ทรง: ${circleHead} และ ${ovalHead}\n` +
      (clearBaseNote ? `• ${clearBaseNote}\n` : "") +
      `• ${addonHead} — แผ่นอะคริลิคไดคัทตามลาย ประกบด้านหลัง เลือกได้ ${ADDON.cols.map((c) => c.head).join(" / ")}\n` +
      (addonHookNote ? `• ช่วงปลีกของ Add On บนเว็บระบุไว้ว่า "${addonHookNote}"\n` : "") +
      `• Magsafe coil base อันละ ${coilPrice} บาท — แผ่นแม่เหล็กติดในเคส สำหรับเคสที่ยังไม่รองรับ Magsafe\n` +
      `• 1-${freeMixBelow} ${UNIT} คละลายได้อิสระ · ตั้งแต่ ${mixFrom} ${UNIT}ขึ้นไป คละลาย/คละขนาดได้ ลายละ ${mixMin} ${UNIT}ขึ้นไป\n` +
      "• ไม่ถึงจำนวนตามที่กำหนด คิดตามราคาปลีก",
    images: [art["size-chart"]],
    imageSize: "lg",
  },
  {
    title: "ราคาแต่ละแบบ",
    text:
      `ราคาต่อ${UNIT} (ตามตารางบนเว็บตารางราคา)::\n` +
      [MODE_A, MODE_B]
        .flatMap((mode) => [circleHead, ovalHead].map((shape) => `• ${mode} ${shape} — ${webLine(MAIN, MODE_COLS[mode][shape])}`))
        .join("\n") +
      `\n\n${addonHead} (บวกเพิ่มต่อ${UNIT})::\n` +
      ADDON.cols.map((c) => `• ${c.head} — ${webLine(ADDON, c)}`).join("\n") +
      `\n\nส่วนลด / ของเสริม::\n` +
      `• แบบ B ไม่รับตัว Griptok — ลด ${noGriptokOff} บาท/${UNIT} (แจ้งในหมายเหตุถึงร้าน ทางร้านหักให้ตอนสรุปยอด)\n` +
      `• Magsafe coil base — เพิ่ม ${coilPrice} บาท/${UNIT}`,
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
      "• ความละเอียด 300 dpi ขึ้นไป · ทำไฟล์ให้ตรงกับทรงและขนาดที่สั่ง\n" +
      "• ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)\n" +
      "• วางภาพให้เกินขอบเล็กน้อย (เผื่อตัดตก) และเลี่ยงวางจุดสำคัญของลายไว้ริมขอบ\n" +
      "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิก — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์",
    images: ["https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/acrylic-howto/howto-print-v1.jpg"],
    imageSize: "lg",
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      '• เลือกแบบ ทรง และแผ่นอะคริลิคเสริม แล้วแนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น จำนวนแต่ละลาย · วันที่ต้องการใช้งาน\n' +
      "• สั่งหลายแบบ/หลายทรง ให้เพิ่มลงตะกร้าแยกรายการ\n" +
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
      "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุรายละเอียด: แบบ · ทรง · แผ่นอะคริลิคเสริม · จำนวนแต่ละลาย · วันที่ใช้งาน (ถ้ามี)",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n" +
      "• สีเพี้ยนเกิน 10-15%\n" +
      "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• สี/ทรง หรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n" +
      "• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
      "ไม่รับเคลม::\n" +
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n" +
      "• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
      "ระยะเวลาในการเคลม::\n" +
      "EMS 7 วัน นับจากวันที่ส่งสินค้า หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

d.terms = [
  "พิมพ์ระบบ UV ลงบนตัวงานโดยตรง · ไม่มีขั้นต่ำในการสั่งผลิต",
  `1-${freeMixBelow} ${UNIT} คละลายได้อิสระ · ตั้งแต่ ${mixFrom} ${UNIT}ขึ้นไป คละลาย/คละขนาดได้ ลายละ ${mixMin} ${UNIT}ขึ้นไป ไม่ถึงตามจำนวน คิดตามราคาปลีก`,
  "แบบ A สำเร็จรูป แกะแยกตัว Griptok ออกจากฐาน Magsafe ไม่ได้",
  `แบบ B ถอดแยกได้ · หากไม่รับตัว Griptok ลดให้ ${UNIT}ละ ${noGriptokOff} บาท (แจ้งในหมายเหตุถึงร้าน ไม่มีให้กดเลือกบนหน้าสินค้า)`,
  ...(clearBaseNote ? [clearBaseNote] : []),
  `${addonHead} คิดเพิ่มตามขนาดแผ่นและจำนวนที่สั่ง (ตารางแยกจากราคาหลัก)`,
  `Magsafe coil base อันละ ${coilPrice} บาท สำหรับติดในเคสที่ยังไม่รองรับ Magsafe`,
  "ภาพประกอบของแผ่นอะคริลิคเสริมและ coil base เป็นการ์ดอธิบายตามสเกล ไม่ใช่รูปถ่ายสินค้า",
  "ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
  "ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% งานคนละรอบอาจสีไม่เท่ากันพอดี",
].join("\n");

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
d.priceMin = Math.min(...allPrices);
d.priceMax = Math.max(...allPrices);
d.savedAt = new Date().toISOString();

console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category} · slug ${d.slug}`);
console.log(`   ราคา ฿${d.priceMin}-${d.priceMax}/${UNIT} · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(
  `   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือก ${d.options.flatMap((o) => o.choices).filter((c) => c.imageSrc).length}/${d.options.flatMap((o) => o.choices).length} ตัว`
);
console.log(`   แท็บ: ${d.tabs.map((t) => t.title).join(" · ")} · สถานะ: ${d.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

// คอลัมน์กระจก (name/category/price/badge) ต้องอัปด้วย — หน้ารายการสินค้าอ่านจากคอลัมน์ ไม่ใช่ใน data
const save = await sb
  .from("products")
  .upsert({ id: ID, data: d, name: d.name, category: d.category, price: d.price, badge: d.badge, sold: d.sold });
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log(`\n✅ อัปภาพ + บันทึกแล้ว — ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
