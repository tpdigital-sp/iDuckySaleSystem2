/**
 * ผ้าแขวนผนัง (fabric-poster) — รอบแก้ 28 ส.ค. 69 ตามที่ผู้ใช้สั่ง
 *
 *  1. หน้ากว้างผ้าจริง 140 ซม. (เดิมทั้งระบบเขียน 145) — แก้ทั้งข้อความ, max ช่องกรอก,
 *     แผ่นคำนวณชิ้น/หลา (sheetYield + sizeFee.perPiece) และ defaultLongest ของทุกตัวเลือก
 *  2. ตัดเต็มหลา: ต่อผืนยาวได้ไม่เกิน 360 ซม. (4 หลา) — เกินจากนั้นแบ่งเป็นผืนละไม่เกิน 4 หลา
 *  3. ค่าตัดแบ่ง / เย็บขอบ / โพ้งขอบ คิดตามด้านที่ยาวที่สุด (กลไกเดิมถูกอยู่แล้ว — เขียนย้ำในข้อความ)
 *  4. เย็บขอบ → เลือกสีไหมได้ 13 สี (ชาร์ต MADEIRA ที่ผู้ใช้ส่งมา) ไม่คิดเงินเพิ่ม
 *     รูปการ์ดแต่ละสี = ครอปหลอดไหมจากชาร์ต · ชาร์ตเต็มแนบเป็น noteImageSrc ให้กดดูเต็มจอ
 *  5. โพ้งขอบ = ไหมสีขาวอย่างเดียว (กลุ่มสีไหมจึงโผล่เฉพาะตอนเลือก "เย็บขอบ")
 *  6. เพิ่มตัวเลือก "สั่งทำพิเศษ (คุยกับแอดมิน)" ในกลุ่มการตัด — askPrice ให้แอดมินตีราคา
 *     + ช่องกรอกรายละเอียด + artworkConsult (กล่องเขียว ทักไลน์ก่อนถึงจะกดสั่งได้)
 *
 * รันดูเฉย ๆ:  node scripts/fabric-poster-cut-thread.mjs
 * เขียนจริง:   node scripts/fabric-poster-cut-thread.mjs --write
 *
 * ⚠️ แก้รูปครั้งหน้าต้องขยับ V (ชื่อไฟล์เดิมโดน Next/CDN แคช)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const WRITE = process.argv.includes("--write");
const ID = "fabric-poster";
const V = "v1";

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
const url = (file) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

const OUT = new URL("../scratchpad_out/fabric-poster-thread/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/* ── สเปกใหม่ที่ผู้ใช้สั่ง ───────────────────────────────────────── */
const WIDTH = 140; // หน้ากว้างผ้าที่ตัดได้จริง (เดิมทั้งระบบเขียน 145)
const YARD = 90; // ยาวต่อ 1 หลา
const MAX_YARDS = 4; // ต่อผืนยาวสุด 4 หลา
const MAX_LEN = YARD * MAX_YARDS; // = 360 ซม.

const G_CUT = "การตัด";
const G_EDGE = "การเก็บขอบ";
const G_W = "ขนาดชิ้นงาน (กว้าง)";
const G_H = "ขนาดชิ้นงาน (ยาว)";
const G_THREAD = "สีไหมเย็บขอบ";
const G_SPECIAL = "รายละเอียดงานสั่งทำพิเศษ";
const C_FULL = "ตัดเต็มหลา";
const C_SPLIT = "ตัดแบ่งตามขนาด";
const C_SPECIAL = "สั่งทำพิเศษ (คุยกับแอดมิน)";
const C_SEW = "เย็บขอบ";
const C_SERGE = "โพ้งขอบ";

/**
 * 🧵 ชาร์ตสีไหม MADEIRA ที่ผู้ใช้ส่งมาในแชท 28 ส.ค. 69 (2000×1036 เก็บไว้ใน repo)
 * หลอดไหม 13 หลอดเรียงแถวเดียว — พิกัดกลางหลอดวัดจาก "ช่วงที่ไม่ใช่พื้นขาว" ตอนสแกนแนวนอน
 * ⚠️ เปลี่ยนไฟล์ชาร์ตเมื่อไหร่ต้องวัด SPOOL_CX ใหม่ (สคริปต์ assert ว่าเจอครบ 13 หลอด)
 */
const CHART = new URL("./assets/fabric-poster/thread-color-chart.jpg", import.meta.url).pathname;
const CHART_SIZE = { w: 2000, h: 1036 };
const SPOOL = { top: 412, height: 370, half: 58 }; // กรอบครอบหลอด (หลอดสูง ~417-778 กว้าง ~102)
const THREADS = [
  { code: "1803", name: "ขาว", cx: 211 },
  { code: "1816", name: "ชมพู", cx: 338 },
  { code: "1637", name: "แดง", cx: 468 },
  { code: "1866", name: "เหลือง", cx: 592 },
  { code: "1521", name: "ส้ม", cx: 725 },
  { code: "1702", name: "เขียวอ่อน", cx: 853 },
  { code: "1851", name: "เขียวเข้ม", cx: 981 },
  { code: "1827", name: "ฟ้า", cx: 1110 },
  { code: "1742", name: "น้ำเงิน", cx: 1242 },
  { code: "1711", name: "ม่วง", cx: 1371 },
  { code: "1614", name: "เทา", cx: 1500 },
  { code: "1658", name: "น้ำตาล", cx: 1633 },
  { code: "1800", name: "ดำ", cx: 1768 },
];
const threadName = (t) => `${t.name} (${t.code})`;

/* ── 1. ตรวจชาร์ต + ครอปหลอดไหม ─────────────────────────────────── */
const meta = await sharp(CHART).metadata();
if (meta.width !== CHART_SIZE.w || meta.height !== CHART_SIZE.h)
  throw new Error(`ชาร์ตสีไหมขนาดเปลี่ยน (${meta.width}×${meta.height}) — ต้องวัดพิกัด SPOOL_CX ใหม่`);

// กันพิกัดเลื่อน: ตรงกลางหลอดต้องไม่ใช่พื้นขาว และช่องว่างกึ่งกลางระหว่างหลอดต้องเป็นพื้นขาว
{
  const { data, info } = await sharp(CHART).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const white = (p) => p[0] > 246 && p[1] > 246 && p[2] > 246;
  const midY = SPOOL.top + Math.round(SPOOL.height / 2);
  for (let i = 0; i < THREADS.length; i++) {
    if (white(at(THREADS[i].cx, midY))) throw new Error(`ไม่เจอหลอดไหมตรงกลาง ${threadName(THREADS[i])}`);
    if (i && !white(at(Math.round((THREADS[i - 1].cx + THREADS[i].cx) / 2), midY)))
      throw new Error(`ช่องว่างระหว่างหลอด ${THREADS[i - 1].name}-${THREADS[i].name} ไม่ใช่พื้นขาว — พิกัดเลื่อน`);
  }
}

async function put(file, buf) {
  writeFileSync(`${OUT}${file}`, buf); // เก็บตัวอย่างไว้ดูก่อนเขียนจริงเสมอ
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

const threadImg = {};
for (const t of THREADS) {
  const buf = await sharp(CHART)
    .extract({ left: t.cx - SPOOL.half, top: SPOOL.top, width: SPOOL.half * 2, height: SPOOL.height })
    .jpeg({ quality: 92 })
    .toBuffer();
  threadImg[t.code] = await put(`thread-${t.code}-${V}.jpg`, buf);
}
const chartUrl = await put(`thread-chart-${V}.jpg`, await sharp(CHART).jpeg({ quality: 90 }).toBuffer());

/* ── 2. โหลดสินค้า + สำรอง ───────────────────────────────────────── */
const { data: row, error: readErr } = await sb.from("products").select("id,name,category,price,data").eq("id", ID).single();
if (readErr) throw readErr;
const d = structuredClone(row.data);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(`.backup-fabricposter-cutthread-${stamp}.json`, JSON.stringify(row, null, 2));

const opt = (label) => {
  const o = d.options?.find((x) => x.label === label);
  if (!o) throw new Error(`ไม่เจอกลุ่ม "${label}" — สินค้าถูกแก้โครงไปแล้ว หยุดก่อน`);
  return o;
};
const choice = (o, name) => {
  const c = o.choices?.find((x) => x.name === name);
  if (!c) throw new Error(`ไม่เจอตัวเลือก "${name}" ในกลุ่ม "${o.label}"`);
  return c;
};

/* ── 3. หน้ากว้าง 145 → 140 ทุกที่ (ข้อความ + ตัวเลข) ─────────────── */
let textFixed = 0;
const retext = (s) =>
  String(s)
    .replace(/145\s*(×|x|ซม|\.)/g, (m) => m.replace("145", String(WIDTH)))
    .replace(/กว้าง\s*145/g, `กว้าง ${WIDTH}`)
    .replace(/145×90/g, `${WIDTH}×${YARD}`);
const walkText = (node) => {
  if (Array.isArray(node)) return node.forEach(walkText);
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === "string" && v.includes("145")) {
      const next = retext(v);
      if (next !== v) {
        node[k] = next;
        textFixed++;
      }
    } else walkText(v);
  }
};
walkText(d);

// ตัวเลขเชิงกลไก: แผ่นคำนวณชิ้น/หลา + ขั้นค่าบริการตอน "ตัดเต็มหลา"
let numFixed = 0;
const fixSheet = (cfg) => {
  if (cfg && cfg.sheetW === 145) {
    cfg.sheetW = WIDTH;
    numFixed++;
  }
};
for (const o of d.options ?? []) {
  fixSheet(o.sheetYield);
  if (o.input?.max === 145) {
    o.input.max = WIDTH;
    numFixed++;
  }
  for (const c of o.choices ?? []) {
    if (!c.sizeFee) continue;
    fixSheet(c.sizeFee.perPiece);
    if (c.sizeFee.defaultLongest === 145) {
      c.sizeFee.defaultLongest = WIDTH;
      numFixed++;
    }
  }
}

/* ── 4. ตัดเต็มหลา: ต่อผืนยาวสุด 360 ซม. (4 หลา) + ค่าตัดเจียนขอบ ──── */
const cut = opt(G_CUT);
const CUT_TIERS = [
  { upTo: 30, fee: 5 },
  { upTo: 60, fee: 10 },
  { upTo: 90, fee: 15 },
  { upTo: 120, fee: 20 },
  { upTo: 150, fee: 25 },
];
const FULL_CUT_FEE = CUT_TIERS.find((t) => WIDTH <= t.upTo).fee; // ผืนเต็มหลา ด้านยาวสุด = หน้ากว้าง → ขั้น 150 = 25

/*
 * 💰 ค่าตัดของ "ตัดเต็มหลา" — คิดเฉพาะตอนเลือกเย็บขอบ/โพ้งขอบ (ต้องเจียนขอบผ้าให้ก่อนถึงเย็บได้)
 * เลือกไม่เย็บขอบ = รับผ้าเต็มผืน ไม่มีค่าใช้จ่ายเพิ่ม (ผู้ใช้สั่ง 28 ส.ค. 69)
 *   onlyWhen = ประตูแรก ไม่ตรง = ไม่คิดเลย
 *   when     = ชี้ไป "ตัดแบ่งตามขนาด" ซึ่งไม่มีทางตรงตอนอยู่บนตัวเลือกนี้ → ตกไปใช้ defaultLongest
 *              (ไม่ให้ไปอ่านค่าค้างในช่องขนาดชิ้นงานที่ถูกซ่อนอยู่) → ค่าตัดคงที่ต่อผืน
 */
choice(cut, C_FULL).sizeFee = {
  onlyWhen: { label: G_EDGE, choices: [C_SEW, C_SERGE] },
  when: { label: G_CUT, choices: [C_SPLIT] },
  tiers: CUT_TIERS.map((t) => ({ ...t })),
  widthLabel: G_W,
  heightLabel: G_H,
  defaultLongest: WIDTH,
};
delete choice(cut, C_FULL).badge; // เคยติดป้าย "ฟรี" — ตอนนี้ไม่ฟรีเสมอไปแล้ว (เย็บ/โพ้งขอบมีค่าตัด)
choice(cut, C_FULL).desc =
  `รับผ้าเต็มผืน หน้ากว้าง ${WIDTH} × ยาว ${YARD} ซม. ต่อ 1 หลา ไม่ตัดแบ่ง\n` +
  `ต่อผืนยาวได้สูงสุด ${MAX_LEN} ซม. (${MAX_YARDS} หลา) — สั่งเกิน ${MAX_YARDS} หลา ทางร้านแบ่งเป็นผืนละไม่เกิน ${MAX_YARDS} หลา\n` +
  `เลือกเย็บขอบ/โพ้งขอบ = มีค่าตัดเจียนขอบ +${FULL_CUT_FEE} บาท/ผืน · เลือกไม่เย็บขอบ = ไม่มีค่าใช้จ่ายเพิ่ม`;
cut.note =
  `1 หลา = กว้าง ${WIDTH} × ยาว ${YARD} ซม. · **ตัดเต็มหลา** หน้ากว้างสูงสุด ${WIDTH} ซม. ` +
  `ต่อผืนยาวสูงสุด ${MAX_LEN} ซม. (${MAX_YARDS} หลา) — **ไม่เย็บขอบไม่มีค่าใช้จ่ายเพิ่ม** ` +
  `แต่ถ้าเลือกเย็บขอบ/โพ้งขอบ มีค่าตัดเจียนขอบ +${FULL_CUT_FEE} บาท/ผืน · ` +
  `**ตัดแบ่งตามขนาด**: ระบุขนาดชิ้นงานแล้วระบบคำนวณให้อัตโนมัติ — ` +
  `จำนวนชิ้นที่ตัดได้ต่อหลา (เผื่อตัดตกระหว่างชิ้น 1-2 ซม.) และค่าตัดต่อชิ้น**ตามด้านที่ยาวที่สุด** ` +
  `(ไม่เกิน 30 ซม. +5 · 60 ซม. +10 · 90 ซม. +15 · 120 ซม. +20 · 150 ซม. +25 บาท/ชิ้น)`;

// ช่องกรอกขนาดชิ้นงาน — เพดานตามหน้ากว้างจริง
opt(G_W).input.hint =
  `ขนาดต่อชิ้น ใหญ่สุดไม่เกิน ${WIDTH}×${YARD} ซม. (1 หลา) — ค่าตัด/เย็บขอบคิดต่อชิ้นจาก**ด้านที่ยาวที่สุด** × จำนวนชิ้นที่ตัดได้ต่อหลา`;

/* ── 5. สั่งทำพิเศษ — ให้แอดมินตีราคา + ต้องคุยกับแอดมินก่อนสั่ง ──── */
cut.choices = cut.choices.filter((c) => c.name !== C_SPECIAL);
cut.choices.push({
  name: C_SPECIAL,
  badge: "ตีราคา",
  askPrice: true,
  desc:
    `งานนอกเหนือจากตารางนี้ — หน้ากว้างเกิน ${WIDTH} ซม. · ผืนยาวเกิน ${MAX_LEN} ซม. · เย็บ/ตัดแบบพิเศษ · เนื้อผ้าที่ไม่มีในรายการ\n` +
    "แจ้งรายละเอียดในช่องด้านล่างแล้วทักไลน์คุยกับแอดมิน ทางร้านตีราคาให้ก่อนเริ่มงาน",
});
d.options = d.options.filter((o) => o.label !== G_SPECIAL);
const iCut = d.options.findIndex((o) => o.label === G_CUT);
d.options.splice(iCut + 1, 0, {
  label: G_SPECIAL,
  display: "input",
  choices: [],
  showWhen: { label: G_CUT, choices: [C_SPECIAL] },
  // ⚠️ ช่องกรอกที่ไม่ตั้ง standardInput จะถูกนับเป็น "กล่อง 📐 งานสั่งทำ" แล้วไม่โผล่จนกว่าลูกค้าจะกดสวิตช์นั้น
  // — ที่นี่อยากให้กรอกได้ทันทีที่เลือก "สั่งทำพิเศษ" จึงต้องตั้งไว้ (ดู optionActive/isMadeToOrderOption)
  standardInput: true,
  input: {
    kind: "textarea",
    placeholder: "เช่น ผ้าฮาร์มิต หน้ากว้าง 160 ซม. ยาว 5 เมตร ต่อผืน เย็บขอบ 4 ด้าน ใส่ตาไก่ 6 จุด",
    hint: "บอกเนื้อผ้า · ขนาดที่ต้องการ · จำนวน · การเก็บขอบ/ตาไก่ ให้ครบ แอดมินจะตีราคากลับให้",
  },
});
d.artworkConsult = {
  enabled: true,
  block: true,
  when: { label: G_CUT, choices: [C_SPECIAL] },
  note:
    "งานสั่งทำพิเศษต้องคุยกับแอดมินก่อนนะครับ — ทักไลน์บอกขนาด/เนื้อผ้า/จำนวนที่ต้องการ ทางร้านจะเช็คหน้าผ้าที่ทำได้จริงแล้วตีราคาให้ก่อน ตกลงกันเรียบร้อยแล้วค่อยกดสั่ง",
};

/* ── 6. สีไหมเย็บขอบ 13 สี (โพ้งขอบ = ขาวอย่างเดียว) ─────────────── */
const edge = opt(G_EDGE);
edge.note =
  `ค่าเย็บขอบ/โพ้งขอบ คิดต่อชิ้น**ตามด้านที่ยาวที่สุด**ของชิ้นงาน (เย็บ +15 ถึง +75 · โพ้ง +10 ถึง +70 บาท/ชิ้น ดูตารางในแกลเลอรี) — ` +
  `**ตัดเต็มหลา** คิดที่ขั้น 150 ซม. ต่อผืน และ**มีค่าตัดเจียนขอบอีก +${FULL_CUT_FEE} บาท/ผืน** (ต้องเจียนขอบผ้าก่อนถึงเย็บได้) · ` +
  `**ตัดแบ่ง** ระบบคิดตามขนาดชิ้น × จำนวนชิ้นต่อหลาให้อัตโนมัติ · ` +
  `**ไม่เย็บขอบ** ตัดเต็มหลาไม่มีค่าใช้จ่ายเพิ่มเลย (ตัดแบ่งยังมีค่าตัดตามขนาดชิ้นตามปกติ) · ` +
  `**เย็บขอบ** เลือกสีไหมได้ 13 สี (ไม่คิดเพิ่ม) · **โพ้งขอบ** มีไหมสีขาวอย่างเดียว`;
choice(edge, C_SEW).desc = "พับเข้าเก็บขอบ ด้านละ 1 ซม. ขอบเรียบหนา เก็บริมเรียบร้อย · เลือกสีไหมได้ 13 สี";
choice(edge, C_SERGE).desc = "เย็บโพ้งริมผ้า 4 ด้าน กันลุ่ย ขอบบางกว่าเย็บขอบ · **ไหมโพ้งมีสีขาวอย่างเดียว**";

d.options = d.options.filter((o) => o.label !== G_THREAD);
const iEdge = d.options.findIndex((o) => o.label === G_EDGE);
d.options.splice(iEdge + 1, 0, {
  label: G_THREAD,
  display: "cards",
  showWhen: { label: G_EDGE, choices: [C_SEW] },
  note:
    "ไหมปัก MADEIRA จากประเทศเยอรมนี โพลีเอสเตอร์ 100% เส้นไหมเรียบเงา ทนต่อการซักฟอก — เลือกได้ 1 สีต่องาน **ไม่มีค่าใช้จ่ายเพิ่ม** · กดที่รูปเพื่อดูชาร์ตสีเต็ม",
  noteImageSrc: chartUrl,
  choices: THREADS.map((t) => ({ name: threadName(t), imageSrc: threadImg[t.code] })),
});

/* ── 7. แท็บ / เงื่อนไข / FAQ ────────────────────────────────────── */
const RULE_LINES = [
  `• ตัดเต็มหลา: หน้ากว้างสูงสุด ${WIDTH} ซม. · ต่อผืนยาวสูงสุด ${MAX_LEN} ซม. (${MAX_YARDS} หลา) — สั่งเกิน ${MAX_YARDS} หลา แบ่งเป็นผืนละไม่เกิน ${MAX_YARDS} หลา`,
  "• ค่าตัดแบ่ง / เย็บขอบ / โพ้งขอบ คิดต่อชิ้นตามด้านที่ยาวที่สุดของชิ้นงาน",
  `• ตัดเต็มหลา + เย็บขอบ/โพ้งขอบ มีค่าตัดเจียนขอบ +${FULL_CUT_FEE} บาท/ผืน (ต้องเจียนขอบผ้าก่อนถึงเย็บได้) — เลือกไม่เย็บขอบ ไม่มีค่าใช้จ่ายเพิ่ม`,
  `• เย็บขอบเลือกสีไหมได้ ${THREADS.length} สี (${THREADS.map((t) => t.name).join(" · ")}) ไม่คิดเงินเพิ่ม — โพ้งขอบมีไหมสีขาวอย่างเดียว`,
  `• งานนอกเหนือจากนี้ (หน้ากว้างเกิน ${WIDTH} ซม. · ผืนยาวเกิน ${MAX_LEN} ซม. · งานเย็บพิเศษ) เลือก "${C_SPECIAL}" แล้วทักไลน์ให้แอดมินตีราคา`,
];
/*
 * ⚠️ แท็บ/เงื่อนไขเดิมมีหัวข้อ (::) และย่อหน้าเว้นบรรทัดที่ต้องคงรูป — ห้ามกรองรายบรรทัด
 * (หัวข้อ "ราคาตัดแบ่งผ้า และเย็บเก็บริม — คิดต่อชิ้น ตามด้านที่ยาวที่สุด" จะหายไปด้วย)
 * จึงตัดที่ "หัวข้อประจำรอบนี้" แล้วต่อท้ายใหม่ทั้งบล็อก — รันซ้ำได้ไม่ทับซ้อน
 */
const MARK = "กติกาการตัด / สีไหมเย็บขอบ::";
const untilMark = (s) => String(s ?? "").split(MARK)[0].replace(/\s+$/, "");
const OPT_TAB = "OPTION เสริม (ตัดแบ่ง / เย็บขอบ / โพ้งขอบ / ตาไก่)";
for (const t of d.tabs ?? []) {
  if (t.title !== OPT_TAB) continue;
  t.text = `${untilMark(t.text)}\n\n${MARK}\n${RULE_LINES.join("\n")}`;
}
/*
 * เงื่อนไข (terms) ไม่มีหัวข้อ "::" — บรรทัดที่ไม่ขึ้นต้นด้วย * จะถูกมองเป็นบรรทัดต่อของข้อก่อนหน้า
 * จึงใช้ "ตัดบรรทัดของรอบนี้ทิ้งด้วยคำขึ้นต้น" แทนหัวข้อคั่น (รันซ้ำได้เหมือนกัน)
 */
const TERM_ADD = [
  `*ตัดเต็มหลา หน้ากว้างสูงสุด ${WIDTH} ซม. · ต่อผืนยาวสูงสุด ${MAX_LEN} ซม. (${MAX_YARDS} หลา) — สั่งเกินแบ่งเป็นผืนละไม่เกิน ${MAX_YARDS} หลา`,
  `*ตัดเต็มหลาที่เลือกเย็บขอบ/โพ้งขอบ มีค่าตัดเจียนขอบ +${FULL_CUT_FEE} บาทต่อผืน (ต้องเจียนขอบผ้าก่อนถึงเย็บได้) — เลือกไม่เย็บขอบ ไม่มีค่าใช้จ่ายเพิ่ม`,
  `*เย็บขอบเลือกสีไหมได้ ${THREADS.length} สี (ไหม MADEIRA เยอรมนี โพลีเอสเตอร์ 100%) ไม่คิดเงินเพิ่ม · โพ้งขอบมีไหมสีขาวอย่างเดียว`,
  "*งานสั่งทำพิเศษนอกเหนือจากตัวเลือกในหน้านี้ ทักไลน์คุยกับแอดมินเพื่อตีราคาก่อนสั่ง",
];
const TERM_HEADS = [
  "*ตัดเต็มหลา หน้ากว้างสูงสุด",
  "*ตัดเต็มหลาที่เลือกเย็บขอบ",
  "*เย็บขอบเลือกสีไหมได้",
  "*งานสั่งทำพิเศษนอกเหนือจาก",
];
d.terms = [
  ...String(d.terms ?? "")
    .split("\n")
    .filter((l) => !TERM_HEADS.some((h) => l.startsWith(h))),
  ...TERM_ADD,
].join("\n");

/*
 * FAQ: ตัดของรอบนี้ทิ้งด้วย "คำถามตรงตัว" ไม่ใช่ regex กว้าง ๆ
 * (เคยใช้ /สั่งทำพิเศษ/ จับคำถาม "สั่งขนาดพิเศษ..." ไม่ติด → รันซ้ำแล้วได้ FAQ ซ้ำ 3 ใบ)
 */
const FAQ_ADD = [
  {
    q: "สั่งตัดเต็มหลา มีค่าตัดเพิ่มไหม?",
    a: `ถ้าเลือก "ไม่เย็บขอบ" ไม่มีค่าใช้จ่ายเพิ่มเลยครับ รับผ้าเต็มผืน หน้ากว้าง ${WIDTH} × ยาว ${YARD} ซม. ต่อ 1 หลา ตามราคาในตาราง — แต่ถ้าเลือกเย็บขอบหรือโพ้งขอบ จะมีค่าตัดเจียนขอบผ้าเพิ่ม ${FULL_CUT_FEE} บาทต่อผืน เพราะต้องเจียนขอบผ้าให้เรียบก่อนถึงจะเย็บเก็บริมได้ (คิดแยกจากค่าเย็บขอบ/โพ้งขอบ) ระบบบวกให้อัตโนมัติตอนเลือก`,
  },
  {
    q: "เย็บขอบเลือกสีไหมได้ไหม?",
    a: `ได้ครับ — เลือก "เย็บขอบ" แล้วเลือกสีไหมได้ ${THREADS.length} สี (${THREADS.map((t) => t.name).join(" · ")}) ใช้ไหมปัก MADEIRA จากเยอรมนี โพลีเอสเตอร์ 100% เส้นเรียบเงา ทนต่อการซักฟอก ไม่คิดค่าใช้จ่ายเพิ่ม · ส่วน "โพ้งขอบ" มีไหมสีขาวอย่างเดียวครับ`,
  },
  {
    q: "สั่งขนาดพิเศษ นอกเหนือจากในหน้าสินค้าได้ไหม?",
    a: `ได้ครับ — ตัดเต็มหลาปกติหน้ากว้างสูงสุด ${WIDTH} ซม. และต่อผืนยาวสูงสุด ${MAX_LEN} ซม. (${MAX_YARDS} หลา) ถ้าต้องการเกินจากนี้ หรืออยากได้งานเย็บ/ตัดแบบพิเศษ ให้เลือก "${C_SPECIAL}" ในหัวข้อการตัด กรอกรายละเอียดแล้วทักไลน์ ทางร้านจะตีราคาให้ก่อนเริ่มงานครับ`,
  },
];
d.seo = d.seo ?? {};
const faqQs = new Set(FAQ_ADD.map((f) => f.q));
d.seo.faqs = [...(d.seo.faqs ?? []).filter((f) => !faqQs.has(f.q ?? "")), ...FAQ_ADD];

/* ── 8. เขียนกลับ ───────────────────────────────────────────────── */
console.log(`ข้อความแก้ 145→${WIDTH}: ${textFixed} ที่ · ตัวเลขกลไก: ${numFixed} ที่`);
console.log("การตัด:", cut.choices.map((c) => c.name).join(" | "));
console.log("การเก็บขอบ:", edge.choices.map((c) => c.name).join(" | "));
console.log(`${G_THREAD}: ${THREADS.map((t) => threadName(t)).join(" · ")}`);
console.log("รูปหลอดไหม + ชาร์ต:", OUT);
if (!WRITE) {
  console.log("— dry-run — ใส่ --write เพื่อเขียนจริง");
  process.exit(0);
}
const { error } = await sb
  .from("products")
  .update({ data: d, name: row.name, category: row.category, price: row.price })
  .eq("id", ID);
if (error) throw error;
console.log("✅ บันทึกแล้ว");
