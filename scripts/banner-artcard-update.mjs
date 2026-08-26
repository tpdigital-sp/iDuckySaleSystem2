/**
 * BANNER (banner-artcard) — งานที่ผู้ใช้สั่ง 26 ส.ค. 69
 *  1) พิมพ์ 2 ด้าน เคลือบด้านหลังได้ (กลุ่ม "เคลือบด้านหลัง" + ผิวฟิล์มพิเศษด้านหลัง)
 *     ราคายึดส่วนต่างฝั่งหน้าของสินค้าตัวเอง: เงา/ด้าน +15 · พิเศษ +60 บาท/แผ่น
 *     (แบบเดียวกับ POSTER/กระดาษรองหลัง ที่ค่าเคลือบหลัง = ส่วนต่างค่าเคลือบหน้าของตัวเอง)
 *  2) เลือกไดคัทแล้วระบุขนาดชิ้นงาน → ระบบคำนวณจำนวนชิ้นต่อแผ่นให้
 *     โครงเดียวกับงานกระดาษ (Sticker-PP-Digital): "ไดคัทตามขนาด" เลือก A4-A7 หรือกำหนดขนาดเอง
 *     ส่วน "ไดคัทตามทรง" กรอกขนาดชิ้นงานตรง ๆ (sheetYield)
 *     พื้นที่วางจริงของแผ่น 65×30 = 64×29 (หักขอบด้านละ 0.5) · เว้นระหว่างชิ้น 0.5 ซม.
 *     จำนวนชิ้นของ A4-A7 คิดจากตัวจัดวางตัวเดียวกับช่องกรอกเอง จะได้ไม่ขัดกัน
 *  3) คละลาย: 1 แผ่น 1 ลาย · ลายที่เกินคิดลายละ 5 บาท · คละได้ไม่เกินชิ้นที่ตัดได้ต่อแผ่น
 *     (เพดานมาจาก capDesigns ของกลุ่มขนาด เมื่อไดคัท · จาก perUnit 1 ของ "ไม่ไดคัท" เมื่อเต็มแผ่น)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ID = "banner-artcard";
const CUT_LABEL = "การตัด";
const NO_CUT = "ไม่ไดคัท (เต็มแผ่น 65 × 30 cm)";
const CUT_SIZE = "ไดคัทตามขนาด";
const CUT_SHAPE = "ไดคัทตามทรง";
const SIZE_LABEL = "ขนาดตัด";
const CUSTOM_SIZE = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const CW_LABEL = "ขนาดตัด (กว้าง)";
const CH_LABEL = "ขนาดตัด (สูง)";
const SW_LABEL = "ขนาดไดคัท (กว้าง)";
const SH_LABEL = "ขนาดไดคัท (สูง)";
/** กลุ่มขนาดชุดเก่าของรอบก่อน (ใช้ชื่อเดียวคุมทั้งสองแบบไดคัท) — ถอดทิ้งก่อนวางชุดใหม่ */
const OLD_SIZE_LABELS = ["ขนาดชิ้นงาน (กว้าง)", "ขนาดชิ้นงาน (สูง)"];
/**
 * ขนาดตายตัวของงานกระดาษ + จำนวนชิ้นที่วางได้จริงบนพื้นที่วาง 64×29 เว้นระหว่างชิ้น 5 มม.
 * คิดจากตัวจัดวางตัวเดียวกับช่องกรอกขนาดเอง จะได้ไม่ขัดกันเอง (ผู้ใช้เลือกฐานนี้ 26 ส.ค. 69)
 * เช่น A7 = 18: วางนอน 5 ใบ × 2 แถว (สูง 15.3) + วางตั้ง 8 ใบอีกแถว (สูง 10.5) = 26.3 ซม.
 */
const A_SIZES = [
  ["A4", 2],
  ["A5", 4],
  ["A6", 9],
  ["A7", 18],
];
const BACK_LABEL = "เคลือบด้านหลัง";
const BACK_FILM = "ผิวฟิล์มพิเศษ (ด้านหลัง)";
const SHEET_NAME = "แผ่น (65×30 cm)";
const BY_SIZE = { label: CUT_LABEL, choices: [CUT_SIZE] };
const BY_SHAPE = { label: CUT_LABEL, choices: [CUT_SHAPE] };
/** พื้นที่วางชิ้นงานจริงของแผ่น 65×30 (หักขอบด้านละ 0.5) · เว้นระหว่างชิ้น 0.5 ซม. */
const yieldOf = (pairLabel) => ({ pairLabel, sheetW: 64, sheetH: 29, gap: 0.5, sheetName: SHEET_NAME });
const numInput = (placeholder, hint) => ({
  kind: "number",
  min: 1,
  max: 64,
  unit: "ซม.",
  placeholder,
  ...(hint ? { hint } : {}),
});

const PRESET = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/preset-coating";
const FILMS = [
  ["กลิตเตอร์", "glitter"],
  ["ทราย", "sand"],
  ["hologram-รุ้ง", "rainbow"],
  ["hologram-ดาว", "star"],
  ["hologram-หิมะ", "snow"],
  ["hologram-หัวใจ", "heart"],
  ["hologram-เหลี่ยม", "facet"],
  ["hologram-จุด", "dot"],
  ["hologram-Dust", "dust"],
  ["hologram-Stardust", "stardust"],
];

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const d = structuredClone(row.data);
const opts = d.options ?? [];
const at = (label) => opts.findIndex((o) => o.label === label);

/* ── 1) เคลือบด้านหลัง (เฉพาะพิมพ์ 2 ด้าน) ────────────────────────────── */
const backGroup = {
  label: BACK_LABEL,
  note: "เฉพาะงานพิมพ์ 2 ด้าน · เคลือบเงา / ด้าน +15 บาท/แผ่น · เคลือบพิเศษ +60 บาท/แผ่น",
  choices: [
    { name: "ไม่เคลือบด้านหลัง", desc: "ด้านหลังปล่อยเปลือย พิมพ์อย่างเดียว" },
    { name: "เคลือบเงา (ด้านหลัง)", extra: 15, desc: "ฟิล์มใสผิวเงา สีด้านหลังสดขึ้น กันรอยได้ดีขึ้น" },
    { name: "เคลือบด้าน (ด้านหลัง)", extra: 15, desc: "ฟิล์มผิวด้านนุ่ม ลดแสงสะท้อน" },
    { name: "เคลือบพิเศษ (ด้านหลัง)", extra: 60, desc: "ฟิล์มลายพิเศษ กลิตเตอร์ / ทราย / โฮโลแกรม" },
  ],
  showWhen: { label: "จำนวนด้านที่พิมพ์", choices: ["พิมพ์ 2 ด้าน"] },
};
const backFilmGroup = {
  label: BACK_FILM,
  display: "pills",
  choices: FILMS.map(([name, file]) => ({ name, imageSrc: `${PRESET}/${file}.jpg` })),
  showWhen: { label: BACK_LABEL, choices: ["เคลือบพิเศษ (ด้านหลัง)"] },
};
/** วางกลุ่มไว้ต่อจากกลุ่ม anchor — มีอยู่แล้วก็เขียนทับที่เดิม (รันซ้ำได้ ลำดับไม่เพี้ยน) */
function putAfter(anchor, group) {
  const i = at(group.label);
  if (i >= 0) {
    opts[i] = group;
    return;
  }
  const a = at(anchor);
  opts.splice(a >= 0 ? a + 1 : opts.length, 0, group);
}
putAfter("จำนวนด้านที่พิมพ์", backGroup);
putAfter(BACK_LABEL, backFilmGroup);

/* ── 2) ระบุขนาดชิ้นงานตอนไดคัท + คำนวณจำนวนชิ้นต่อแผ่น ───────────────── */
const cut = opts[at(CUT_LABEL)];
cut.note =
  "ไดคัทตามขนาด = เลือก A4 / A5 / A6 / A7 หรือกำหนดขนาดเอง · ไดคัทตามทรง = ระบุขนาดกรอบนอกของทรง — ระบบคำนวณให้ว่า 1 แผ่นตัดได้กี่ชิ้น";
cut.choices = cut.choices.map((c) =>
  // เต็มแผ่น = 1 ชิ้นต่อแผ่น → คละได้ไม่เกินจำนวนแผ่นที่สั่ง (ดู perUnitCapacity)
  c.name === NO_CUT ? { ...c, perUnit: 1 } : c
);
// ถอดกลุ่มขนาดชุดเก่าออกก่อน (รอบนี้แยกเป็นคนละชุดตามแบบไดคัท เหมือนงานกระดาษ)
for (const label of OLD_SIZE_LABELS) {
  const i = at(label);
  if (i >= 0) opts.splice(i, 1);
}
/* ── ไดคัทตามขนาด → เลือก A4-A7 หรือกำหนดขนาดเอง ── */
putAfter(CUT_LABEL, {
  label: SIZE_LABEL,
  note: "ขนาดสำเร็จของชิ้นงานหลังไดคัท — เลือกขนาดมาตรฐาน หรือกำหนดเองก็ได้",
  capDesigns: true,
  choices: [
    ...A_SIZES.map(([name, per]) => ({ name, piecesPerUnit: per, badge: `ได้ ${per} ชิ้น / ${SHEET_NAME}` })),
    { name: CUSTOM_SIZE },
  ],
  showWhen: BY_SIZE,
});
putAfter(SIZE_LABEL, {
  label: CW_LABEL,
  display: "input",
  choices: [],
  standardInput: true,
  input: numInput("เช่น 10", "ขนาดชิ้นงานหลังไดคัท วัดด้านที่กว้างที่สุด"),
  showWhen: { label: SIZE_LABEL, choices: [CUSTOM_SIZE] },
  showWhenAlso: BY_SIZE,
});
putAfter(CW_LABEL, {
  label: CH_LABEL,
  display: "input",
  choices: [],
  standardInput: true,
  capDesigns: true,
  input: numInput("เช่น 5"),
  sheetYield: yieldOf(CW_LABEL),
  showWhen: { label: SIZE_LABEL, choices: [CUSTOM_SIZE] },
  showWhenAlso: BY_SIZE,
});
/* ── ไดคัทตามทรง → กรอกขนาดชิ้นงานตรง ๆ (ขนาดกรอบนอกของทรง) ── */
putAfter(CH_LABEL, {
  label: SW_LABEL,
  display: "input",
  choices: [],
  standardInput: true,
  input: numInput("เช่น 10", "ขนาดกรอบนอกของทรง วัดด้านที่กว้างที่สุด"),
  showWhen: BY_SHAPE,
});
putAfter(SW_LABEL, {
  label: SH_LABEL,
  display: "input",
  choices: [],
  standardInput: true,
  capDesigns: true,
  input: numInput("เช่น 5"),
  sheetYield: yieldOf(SW_LABEL),
  showWhen: BY_SHAPE,
});
d.options = opts;

/* ── 3) กติกาคละลายใหม่ — 1 แผ่น 1 ลาย · ลายที่เกินลายละ 5 ────────────── */
// includedDesigns 2 = ลายที่ 2 บนแผ่นเดียวกันคิดค่าเหมา 5 พอดี ลายถัดไปบวกลายละ 5 ต่อเนื่อง
// ไม่ตั้ง onePerUnitFromQty แล้ว — เพดานลายมาจากจำนวนชิ้นต่อแผ่นแทน (perUnit / capDesigns)
d.mixRule = { baseFee: 5, includedDesigns: 2, extraFee: 5 };

/* ── ข้อความ ─────────────────────────────────────────────────────────── */
d.terms = [
  "• 1 แผ่น (65 × 30 cm) ต่อ 1 ลาย · ลายที่คละเกินจากนั้นบวกลายละ 5 บาท — คละได้มากสุดเท่าจำนวนชิ้นที่ตัดได้ต่อแผ่น",
  "• เคลือบด้านหน้าตามตัวเลือกที่เลือก · งานพิมพ์ 2 ด้าน เคลือบด้านหลังเพิ่มได้ (เงา / ด้าน +15 บาท · พิเศษ +60 บาท ต่อแผ่น)",
  "• พิมพ์ 2 ด้าน บวกแผ่นละ 15 บาท",
  "• ไดคัทตามขนาด บวกเพิ่ม 15 บาท/แผ่น (เลือก A4 / A5 / A6 / A7 หรือกำหนดขนาดเอง) · ไดคัทตามทรง บวกเพิ่ม 30 บาท/แผ่น — ระบุขนาดแล้วระบบคำนวณจำนวนชิ้นต่อแผ่นให้",
  "• ทางร้านใช้สี RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงจากไฟล์ ±5% ถึง ±15% · เครื่องพิมพ์คนละเครื่องสีต่างกันได้ 5-10%",
].join("\n");

const tab = (title) => (d.tabs ?? []).find((t) => t.title === title);
const t1 = tab("รายละเอียดงานพิมพ์");
if (t1)
  t1.text = [
    "::กระดาษ::",
    "• กระดาษอาร์ตการ์ด เลือกความหนาได้ 157 / 210 / 300 แกรม",
    "• ขนาดมาตรฐาน 65 × 30 cm (แนวนอน) พิมพ์ระบบ Digital Printing",
    "::ราคาบวกเพิ่ม::",
    "• เคลือบเงา / เคลือบด้าน บวกเพิ่ม 15 บาท/แผ่น (ต่อ 1 ด้าน)",
    "• เคลือบพิเศษ (กลิตเตอร์ / โฮโลแกรม) บวกเพิ่ม 60 บาท/แผ่น (ต่อ 1 ด้าน)",
    "• พิมพ์ 2 ด้าน บวกแผ่นละ 15 บาท · เคลือบด้านหลังเพิ่มได้ เงา / ด้าน +15 บาท · พิเศษ +60 บาท ต่อแผ่น",
    "• ไดคัทตามขนาด บวกเพิ่ม 15 บาท/แผ่น · ไดคัทตามทรง บวกเพิ่ม 30 บาท/แผ่น",
  ].join("\n");
const t2 = tab("ข้อควรทราบ");
if (t2)
  t2.text = [
    "• 1 แผ่น (65 × 30 cm) ต่อ 1 ลาย — ลายที่คละเกินจากนั้นบวกลายละ 5 บาท",
    "• ไดคัทตามขนาด เลือกได้ทั้งขนาดมาตรฐาน A4 (2 ชิ้น/แผ่น) · A5 (4 ชิ้น) · A6 (9 ชิ้น) · A7 (18 ชิ้น) หรือกำหนดขนาดเอง (ระบุ ก. × ส.)",
    "• ระบุขนาดแล้วระบบคำนวณให้ว่า 1 แผ่นตัดได้กี่ชิ้น และคละลายได้มากสุดกี่ลาย — คละ 1 ลายใช้อย่างน้อย 1 ชิ้น",
    "• จำนวนชิ้นต่อแผ่นเป็นตัวเลขจากการจัดวางจริง (เว้นระยะระหว่างชิ้น 5 มม.) — จำนวนจริงขึ้นกับรูปทรงลาย",
    "• เคลือบคิดต่อด้าน — งานพิมพ์ 1 ด้านเคลือบได้เฉพาะด้านที่สกรีน · พิมพ์ 2 ด้านเลือกเคลือบด้านหลังเพิ่มได้",
    '• ตารางราคาบนเว็บร้านเขียนช่วงจำนวนว่า "แผ่น A3" แต่หมวดนี้คิดเป็นแผ่นขนาด 65 × 30 cm ตาม Add On ของหัวข้อ BANNER',
    "• เคลือบพิเศษมีหลายลาย (กลิตเตอร์ / ทราย / โฮโลแกรมดาว-หิมะ-รุ้ง-จุด ฯลฯ) ราคาเท่ากัน เลือกลายได้ในหน้าสั่งซื้อ",
  ].join("\n");
const t3 = tab("วิธีสั่งงาน");
if (t3)
  t3.text = t3.text.replace(
    "• เลือกชนิดกระดาษ → เคลือบ → จำนวนด้านที่พิมพ์ → การตัด → ใส่จำนวนแผ่น",
    "• เลือกชนิดกระดาษ → เคลือบ → จำนวนด้านที่พิมพ์ (2 ด้านเลือกเคลือบหลังได้) → การตัด (ไดคัทแล้วเลือกขนาด A4-A7 หรือกำหนดเอง) → ใส่จำนวนแผ่น"
  );

d.highlights = [
  "กระดาษอาร์ตการ์ด 157 / 210 / 300 แกรม",
  "ขนาดแผ่น 65 × 30 cm พิมพ์เต็มแผ่น",
  "เคลือบเงา ด้าน หรือเคลือบพิเศษ (กลิตเตอร์ / โฮโลแกรม) — พิมพ์ 2 ด้านเคลือบหลังได้",
  "ไดคัทตามขนาด A4 / A5 / A6 / A7 หรือกำหนดขนาดเอง — รู้เลยว่า 1 แผ่นได้กี่ชิ้น",
];

const faq = (q) => (d.seo?.faqs ?? []).find((f) => f.q === q);
const fMix = faq("คละลายได้ไหม?");
if (fMix)
  fMix.a =
    "ได้ครับ 1 แผ่นต่อ 1 ลายไม่คิดเพิ่ม · ลายที่คละเกินจากนั้นบวกลายละ 5 บาท — คละได้มากสุดเท่าจำนวนชิ้นที่ตัดได้ต่อแผ่น (งานเต็มแผ่นไม่ไดคัท = 1 ลาย/แผ่น)";
const fSize = faq("แบนเนอร์ขนาดเท่าไหร่?");
if (fSize)
  fSize.a =
    "ขนาดมาตรฐาน 65 × 30 cm (แนวนอน) ต่อ 1 แผ่น — สั่งไดคัทเป็น A4 / A5 / A6 / A7 หรือกำหนดขนาดเองได้ ระบบจะบอกว่า 1 แผ่นตัดได้กี่ชิ้น";
if (d.seo?.faqs && !faq("1 แผ่นตัดได้กี่ชิ้น?"))
  d.seo.faqs.push({
    q: "1 แผ่นตัดได้กี่ชิ้น?",
    a: "แผ่น 65 × 30 cm ตัดได้ A4 = 2 ชิ้น · A5 = 4 ชิ้น · A6 = 9 ชิ้น · A7 = 18 ชิ้น — กำหนดขนาดเองก็ได้ ระบบคำนวณจากพื้นที่วางจริงให้ทันที เช่น 10 × 5 cm ได้ราว 30 ชิ้นต่อแผ่น (จำนวนจริงขึ้นกับรูปทรงลาย)",
  });

d.savedAt = new Date().toISOString();

const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) throw upErr;
console.log("✅ อัปเดต", ID, "แล้ว");
console.log("กลุ่มตัวเลือก:", d.options.map((o) => o.label).join(" · "));
console.log("mixRule:", JSON.stringify(d.mixRule));
