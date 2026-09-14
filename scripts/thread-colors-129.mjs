#!/usr/bin/env node
/**
 * 🧵 สีไหม Madeira Polyneon ครบ 129 เบอร์ — สินค้างานปักทุกตัวที่ใช้ชุดสีนี้
 * เจ้าของร้านส่งภาพรายการสีมา 14 ก.ย. 69 ("สีไหม ปรับเป็นตามภาพที่ส่งให้") — เดิมมีให้เลือก 80 เบอร์
 *
 *   node scripts/thread-colors-129.mjs           # dry-run · วาดชาร์ตลง .tmpwork/ ไม่เขียนอะไร
 *   node scripts/thread-colors-129.mjs --write   # อัปรูป 129 ใบ + ชาร์ต แล้วเขียนตัวเลือกลง DB ทุกสินค้า
 *
 * 🎨 รูปสวอตช์มาจาก "ชาร์ตสีจริงของ Madeira" (MADEIRA_POLYNEON.pdf บนไดรฟ์ร้าน)
 *    ครอปไว้แล้วเป็นไฟล์ใน repo: scripts/assets/thread-madeira/<เบอร์>.jpg (880×240)
 *    ⚠️ รูปในไฟล์ PDF มีแค่ ~116×33 px ต่อสี — ขยายตรง ๆ แล้วเห็นเป็นตารางหยาบบนมือถือ (เจ้าของร้านแจ้ง)
 *    จึงวาดใหม่เป็นแถบไล่เฉดเรียบจาก "สีเฉลี่ยรายแถว" ของรูปจริง — ได้สี+แสงเงาเดิม แต่คมทุกขนาด
 *    อยากครอปใหม่/เพิ่มเบอร์ → รัน scripts/assets/thread-madeira/extract-from-pdf.py (ต้อง mount ไดรฟ์)
 *
 * ⚠️ ชุดเก่า 80 เบอร์ครอปจากรูปถ่ายชาร์ตของร้าน (products/armpatch-1/code-<เบอร์>.jpg) — สีเข้มกว่าจริง
 *    ชุดใหม่ลงคนละพาธ (products/armpatch-1/thread/) ของเก่ายังอยู่ครบ ถ้าจะย้อนกลับก็ชี้ URL เดิมได้
 * 🔗 ทุกสินค้าใช้รูปชุดเดียวกัน (เดิมก็ยืมของอาร์มปักอยู่แล้ว) — แก้ที่เดียวเห็นผลทุกหน้า
 *    ค่าเพิ่มต่อสี (extra) ของแต่ละสินค้า "คงของเดิม" ไม่ตั้งใหม่:
 *    อาร์มปัก/Crossbody = ฿10 ต่อสี · กระเป๋าผ้า/Shoulder/ตุ๊กตา = 0 (คิดส่วนเกินที่กลุ่ม "สีไหมไม่เกิน 3 สี" แยกต่างหาก)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
/** สินค้าที่ใช้สีไหมชุดนี้ (กลุ่มที่ตั้ง swatchGrid + มีสีเกิน 40 เบอร์) */
const PRODUCTS = ["armpatch-1", "clothbag-4", "crossbody-bag", "shoulder-bag", "new-mt2saszv-9863"];
const DIR = "products/armpatch-1/thread"; // พาธใหม่ใน bucket product-images
const V = "3"; // ?v= กันแคชเวลาอัปทับพาธเดิม (v3 = วาดใหม่ให้คม + ใส่ลายเนื้อไหมกลับเข้าไป 14 ก.ย. 69)
const ASSETS = "scripts/assets/thread-madeira";
const OUT = ".tmpwork/thread-colors/";

/** 129 เบอร์ตามภาพที่เจ้าของร้านส่ง (เรียงเลขน้อย→มาก เหมือนในภาพ) */
const CODES = `
1506 1507 1521 1529 1538 1539 1540 1554 1559 1561 1563 1564 1566 1567
1569 1577 1593 1594 1610 1612 1613 1614 1615 1616 1619 1620 1621 1624
1625 1626 1627 1630 1637 1639 1640 1645 1647 1649 1653 1658 1660 1662
1668 1675 1680 1683 1685 1687 1692 1694 1701 1702 1707 1711 1722 1723
1724 1730 1736 1740 1742 1746 1750 1753 1755 1763 1765 1768 1769 1777 1779
1781 1787 1791 1794 1796 1798 1799 1800 1801 1803 1805 1810 1811 1816
1817 1822 1826 1827 1829 1834 1839 1849 1850 1851 1853 1856 1866 1872
1874 1883 1886 1892 1896 1900 1906 1909 1910 1911 1920 1921 1925 1926
1932 1933 1934 1935 1939 1940 1946 1949 1951 1956 1958 1976 1977 1988
1990 1994`
  .trim()
  .split(/\s+/);

/** เบอร์ที่ชาร์ต Madeira ตั้งชื่อกำกับไว้ — สีขาว/ดำหลายเบอร์แยกด้วยตาไม่ออก ต้องมีชื่อห้อย */
const NAMED = {
  1800: "1800 Black",
  1801: "1801 Super white",
  1803: "1803 Creme white",
  1805: "1805 Fluoresc. white",
};

/** กลุ่มสีตามคอลัมน์ในชาร์ต Madeira (16 คอลัมน์ + นีออน) — ใช้เขียนแท็บ "สีไหม Madeira" ในหน้าสินค้า */
const FAMILIES = [
  ["เหลือง–ครีม", "1561 1624 1625 1626 1683 1724 1763 1866 1951"],
  ["ส้ม–พีช", "1521 1621 1637 1653 1755 1765 1817 1826 1839 1853"],
  ["แดง–ชมพูอมส้ม", "1567 1616 1620 1639 1707 1777 1779 1781"],
  ["ชมพู–บานเย็น", "1787 1816 1909 1910 1921 1990 1994"],
  ["ม่วง–ลาเวนเดอร์", "1630 1680 1711 1722 1834 1911 1933"],
  ["น้ำเงินเข้ม", "1529 1566 1627 1976"],
  ["น้ำเงิน–ฟ้าอ่อน", "1675 1742 1829 1874 1934"],
  ["ฟ้า–ฟ้าคราม", "1563 1577 1593 1594 1694 1827 1892 1896 1932 1977"],
  ["มิ้นต์–เทอร์ควอยซ์", "1645 1647 1685 1692 1746 1750 1799 1849"],
  ["เขียว", "1649 1701 1702 1768 1769 1851 1900 1940 1988"],
  ["เขียวขี้ม้า–กากี", "1569 1668 1794 1796 1798 1906 1920 1939 1956"],
  ["น้ำตาล–อิฐ", "1554 1559 1658 1660 1753 1856 1926 1958"],
  ["ครีม–งาช้าง", "1723 1736 1872 1949"],
  ["เทาอ่อน–น้ำตาลทอง", "1538 1540 1662 1730 1791 1810 1822"],
  ["เทาเข้ม–กรมท่า", "1506 1507 1539 1612 1614 1615 1619 1640 1687 1740 1886"],
  ["ขาว–เทาอ่อน–ดำ", "1564 1610 1613 1800 1801 1803 1805 1811"],
  ["นีออน (Fluorescent)", "1850 1883 1925 1935 1946"],
].map(([label, list]) => [label, list.split(" ")]);

const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};
const nameOf = (code) => NAMED[code] ?? code;

if (new Set(CODES).size !== CODES.length) die("รายการเบอร์มีซ้ำ");
if (CODES.length !== 129) die(`ต้องมี 129 เบอร์ แต่นับได้ ${CODES.length}`);
{
  const flat = FAMILIES.flatMap(([, list]) => list);
  if (flat.length !== CODES.length || flat.some((c) => !CODES.includes(c)) || new Set(flat).size !== flat.length)
    die("กลุ่มสี (FAMILIES) ไม่ตรงกับรายการเบอร์");
}

/* ── 1) รูปสวอตช์ในrepo ── */
mkdirSync(OUT, { recursive: true });
const art = {};
for (const code of CODES) {
  const f = `${ASSETS}/${code}.jpg`;
  if (!existsSync(f)) die(`ไม่มีรูปสวอตช์ ${f} — รัน ${ASSETS}/extract-from-pdf.py ก่อน (ต้อง mount ไดรฟ์ร้าน)`);
  art[code] = readFileSync(f);
}
console.log(`🎨 รูปสวอตช์ครบ ${CODES.length} ใบ จาก ${ASSETS}/`);

/* ── 2) ชาร์ตรวม (ปุ่ม "🔍 ดูตารางสีเต็ม" ในหน้าสินค้า) ── */
const COLS = 6;
const ROWS = Math.ceil(CODES.length / COLS);
const CELL_W = 340;
const CELL_H = 116;
const PAD = 40;
const HEAD = 150;
const SW_W = 200;
const SW_H = 72;
const W = PAD * 2 + COLS * CELL_W;
const H = HEAD + ROWS * CELL_H + PAD;

const cellX = (i) => PAD + (i % COLS) * CELL_W;
const cellY = (i) => HEAD + Math.floor(i / COLS) * CELL_H;

const swatches = await Promise.all(
  CODES.map(async (code, i) => ({
    input: await sharp(art[code]).resize(SW_W, SW_H).toBuffer(),
    left: cellX(i) + CELL_W - SW_W - 24,
    top: cellY(i) + Math.round((CELL_H - SW_H) / 2),
  }))
);
const FONT = "Noto Sans Thai, Sarabun, Thonburi, Helvetica, sans-serif";
const labels = CODES.map((code, i) => {
  const sx = cellX(i) + CELL_W - SW_W - 24;
  const sy = cellY(i) + Math.round((CELL_H - SW_H) / 2);
  return (
    `<text x="${cellX(i) + 22}" y="${cellY(i) + CELL_H / 2 + 12}" font-family="${FONT}" font-size="34" fill="#334155">${code}</text>` +
    // เส้นขอบบาง ๆ — ไหมสีขาว (1949/1801/1803/1805) จะได้ไม่จมไปกับพื้นขาว
    `<rect x="${sx - 0.5}" y="${sy - 0.5}" width="${SW_W + 1}" height="${SW_H + 1}" fill="none" stroke="#cbd5e1" stroke-width="1"/>`
  );
}).join("");
const chart = await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
  .composite([
    ...swatches,
    {
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
           <text x="${PAD + 20}" y="78" font-family="${FONT}" font-size="54" font-weight="bold" fill="#0f172a">สีไหม Madeira Polyneon</text>
           <text x="${PAD + 20}" y="120" font-family="${FONT}" font-size="30" fill="#64748b">iDucky · งานปัก เลือกได้ ${CODES.length} เบอร์ — สีจริงอาจเพี้ยนจากหน้าจอเล็กน้อย</text>
           ${labels}
         </svg>`
      ),
      left: 0,
      top: 0,
    },
  ])
  .jpeg({ quality: 88 })
  .toBuffer();
writeFileSync(`${OUT}chart.jpg`, chart);
console.log(`📋 วาดชาร์ต ${W}×${H} → ${OUT}chart.jpg`);

if (!WRITE) {
  console.log("\n(dry-run) เปิดดูชาร์ตก่อน แล้วรันซ้ำด้วย --write");
  process.exit(0);
}

/* ── 3) อัปรูป + เขียน DB ── */
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const sb = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const PUB = `${SUPA}/storage/v1/object/public/product-images`;
const imgOf = (code) => `${PUB}/${DIR}/${code}.jpg?v=${V}`;
const CHART_URL = `${PUB}/${DIR}/chart.jpg?v=${V}`;

for (const code of CODES) {
  const { error } = await sb.storage
    .from("product-images")
    .upload(`${DIR}/${code}.jpg`, art[code], { contentType: "image/jpeg", upsert: true });
  if (error) die(`อัป ${code}: ${error.message}`);
}
const upC = await sb.storage
  .from("product-images")
  .upload(`${DIR}/chart.jpg`, chart, { contentType: "image/jpeg", upsert: true });
if (upC.error) die(`อัปชาร์ต: ${upC.error.message}`);
console.log(`↑ อัปขึ้น ${DIR}/ แล้ว ${CODES.length + 1} ไฟล์`);

const MARK = "เบอร์ไหมที่มี แยกตามกลุ่มสี::";
const codeOf = (c) => String(c.name ?? c).split(" ")[0];
const famLine = ([label, list]) => `• ${label} — ${list.map(nameOf).join(" · ")}`;

/** แทนเลขจำนวนสีในข้อความทุกที่ของสินค้า ("80 เฉด" / "ถึง 80 เบอร์" / "สีไหม 80 สี") */
function retext(node, before, hits, path = "") {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      if (typeof v === "string") {
        const out = v.replace(new RegExp(`${before}(\\s*)(เฉด|เบอร์|สี)`, "g"), `${CODES.length}$1$2`);
        if (out !== v) {
          node[i] = out;
          hits.push(`${path}[${i}]`);
        }
      } else retext(v, before, hits, `${path}[${i}]`);
    });
    return node;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === "string") {
        const rx = new RegExp(`${before}(\\s*)(เฉด|เบอร์|สี)`, "g");
        const out = v.replace(rx, `${CODES.length}$1$2`);
        if (out !== v) {
          node[k] = out;
          hits.push(`${path}.${k}`);
        }
      } else retext(v, before, hits, `${path}.${k}`);
    }
  }
  return node;
}

for (const ID of PRODUCTS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
  if (error || !row) die(error?.message || `ไม่พบสินค้า ${ID}`);
  const p = structuredClone(row.data);

  /* กลุ่มสีไหม = กลุ่มตารางสวอตช์ที่มีสีเยอะ (กันชนกับกลุ่ม "สีไหมไม่เกิน 3 สี" ที่เป็นช่องจำนวน) */
  const opts = (p.options || []).filter((o) => o.swatchGrid && (o.choices || []).length >= 40);
  if (opts.length !== 1) die(`${ID}: เจอกลุ่มตารางสีไหม ${opts.length} กลุ่ม — ต้องมีกลุ่มเดียว`);
  const opt = opts[0];

  /* กันสีที่ลูกค้าเคยเลือกหาย: เบอร์เดิมทุกตัวต้องอยู่ในชุดใหม่ */
  const missing = (opt.choices || []).map(codeOf).filter((c) => !CODES.includes(c));
  if (missing.length) die(`${ID}: ชุดใหม่ไม่มีเบอร์เดิม ${missing.join(", ")}`);

  /* ค่าเพิ่มต่อสี — คงของเดิมของสินค้านั้น (ต้องเท่ากันทุกเบอร์ ไม่งั้นหยุด) */
  const extras = [...new Set((opt.choices || []).map((c) => c.extra ?? 0))];
  if (extras.length !== 1) die(`${ID}: ค่าเพิ่มต่อสีไม่เท่ากันทุกเบอร์ (${extras.join(", ")}) — ต้องตัดสินใจก่อน`);
  const extra = extras[0];

  const before = (opt.choices || []).length;
  opt.choices = CODES.map((code) => ({ name: nameOf(code), ...(extra ? { extra } : {}), imageSrc: imgOf(code) }));
  if (!opt.chartSrc || /thread-color\.jpg|\/thread\/chart\.jpg/.test(String(opt.chartSrc))) opt.chartSrc = CHART_URL;
  else console.log(`  ⚠️ ${ID}: chartSrc ชี้ไฟล์อื่นอยู่ ไม่แตะ (${opt.chartSrc})`);

  /* แท็บที่ไล่รายชื่อเบอร์ (อาร์มปักตัวเดียว) — เขียนรายชื่อใหม่ + เอาชาร์ตใหม่ขึ้นก่อนชาร์ตเก่า */
  const tab = (p.tabs || []).find((t) => String(t.text || "").includes(MARK));
  if (tab) {
    tab.text = String(tab.text).split(MARK)[0] + MARK + "\n" + FAMILIES.map(famLine).join("\n");
    tab.images = [CHART_URL, ...(tab.images || []).filter((u) => !String(u).includes(`/${DIR}/`))];
  }

  /* ข้อความที่บอกจำนวนสี (คำโปรย · จุดเด่น · FAQ · แท็บ) */
  const hits = [];
  /* 80 = จำนวนสีชุดเดิมทั่วร้าน — กวาดทุกรอบ เผื่อรอบก่อนแก้ตัวเลือกแล้วแต่ข้อความตกหล่น */
  for (const n of [...new Set([before, 80])]) {
    if (n === CODES.length) continue;
    retext(p, n, hits);
  }
  if (before !== CODES.length && !hits.length)
    console.log(`  ⚠️ ${ID}: ไม่เจอข้อความ "${before} เฉด/เบอร์/สี" — เช็คเองว่ามีที่ไหนต้องแก้ไหม`);

  p.savedAt = new Date().toISOString();
  const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
  if (up.error) die(`${ID}: ${up.error.message}`);
  if (!up.data?.length) die(`${ID}: update โดน 0 แถว`);

  /* ── อ่านกลับเทียบ ── */
  const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
  const q = back?.data;
  if (q?.savedAt !== p.savedAt) die(`${ID}: อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ`);
  const qo = (q.options || []).find((o) => o.swatchGrid && (o.choices || []).length >= 40);
  if (!qo) die(`${ID}: อ่านกลับไม่เจอกลุ่มสีไหม`);
  if (qo.choices.length !== CODES.length) die(`${ID}: อ่านกลับได้ ${qo.choices.length} เบอร์`);
  CODES.forEach((code, i) => {
    const c = qo.choices[i];
    if (c.name !== nameOf(code) || c.imageSrc !== imgOf(code) || (c.extra ?? 0) !== extra)
      die(`${ID}: อ่านกลับเบอร์ ${code} ไม่ตรง`);
  });
  if (!qo.swatchGrid || qo.display !== "multi") die(`${ID}: อ่านกลับ ตั้งค่ากลุ่มหาย`);
  if (qo.chartSrc !== CHART_URL) die(`${ID}: อ่านกลับ chartSrc ไม่ตรง`);
  if (qo.label !== opt.label || qo.note !== opt.note) die(`${ID}: อ่านกลับ ป้าย/คำอธิบายกลุ่มเพี้ยน`);
  if (tab) {
    const qt = (q.tabs || []).find((t) => String(t.text || "").includes(MARK));
    if (!qt || !CODES.every((c) => qt.text.includes(c))) die(`${ID}: อ่านกลับ แท็บสีไหมไม่ครบทุกเบอร์`);
    if (qt.images?.[0] !== CHART_URL) die(`${ID}: อ่านกลับ รูปในแท็บไม่ใช่ชาร์ตใหม่`);
  }
  for (const n of [...new Set([before, 80])]) {
    if (n === CODES.length) continue;
    const stillOld = JSON.stringify(q).match(new RegExp(`${n}\\s*(เฉด|เบอร์|สี)`, "g"));
    if (stillOld) die(`${ID}: ยังเหลือข้อความ "${stillOld[0]}"`);
  }

  console.log(
    `✓ ${ID} — สีไหม ${before} → ${qo.choices.length} เบอร์ · +฿${extra}/สี (คงเดิม)` +
      `${tab ? " · แท็บรายชื่อเบอร์" : ""} · ข้อความแก้ ${hits.length} จุด${hits.length ? " (" + hits.join(", ") + ")" : ""}`
  );
}

/* รูปต้องเปิดได้จริง */
for (const code of [CODES[0], CODES[64], CODES.at(-1)]) {
  const r = await fetch(imgOf(code), { method: "HEAD" });
  if (!r.ok) die(`เปิดรูป ${code} ไม่ได้ (${r.status})`);
}
const rc = await fetch(CHART_URL, { method: "HEAD" });
if (!rc.ok) die(`เปิดชาร์ตไม่ได้ (${rc.status})`);
console.log(`\n✓ เสร็จครบ ${PRODUCTS.length} สินค้า · รูป ${DIR}/?v=${V}`);
