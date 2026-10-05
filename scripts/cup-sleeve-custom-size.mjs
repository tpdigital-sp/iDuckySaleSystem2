/**
 * ☕📐 CUP SLEEVE — เพิ่ม "กำหนดขนาดเอง (งานคัสตอมตามไฟล์)" + คำนวณให้เลยว่าได้กี่ชิ้นต่อเซ็ต (1 เซ็ต = 1 แผ่น A3)
 *
 * พนักงานแจ้ง 5 ต.ค. 69: "เพิ่มตัวเลือกระบุขนาดเองได้ (งานคัสตอมตามไฟล์) + คำนวนให้เลยว่าได้กี่ชิ้นต่อเซต (A3)
 * และแจ้งในหน้าคำสั่งซื้อ ตะกร้า และหน้าของลูกค้าด้วย"
 *
 * ใช้กลไกเดิมของงานแบ่งแผ่นทั้งหมด (ไม่แตะโค้ด):
 *   - กลุ่ม "ขนาดปลอกแก้ว": มาตรฐาน 27.7 × 7.6 ซม. (piecesPerUnit 6) | 📐 กำหนดขนาดเอง
 *   - คู่ช่องกรอก กว้าง/สูง + sheetYield → หน้าสินค้าโชว์ "ได้ประมาณ N ชิ้น ต่อ 1 แผ่น A3" สด
 *   - unitSheets { เซ็ต: 1 } → unitYieldOf/orderUnitYield รู้ว่า 1 เซ็ต = 1 แผ่น A3 → ตะกร้า/ออเดอร์ (แช่ OrderItem.unitYield)
 *     /หน้าออเดอร์ลูกค้าโชว์ "N ชิ้น/เซ็ต · ได้ทั้งหมด X ชิ้น" ให้เอง
 *   - capDesigns ที่กลุ่มขนาด+ช่องสูง → เพดานคละลายตามชิ้นที่ได้จริง (เดิม perUnit 6 ติดที่ตัวเลือกกระดาษ ย้ายมาที่นี่
 *     ไม่งั้นขนาดเล็กที่ได้ > 6 ชิ้นจะโดนกด 6 ตลอด — perUnitCapacity เอาค่าน้อยสุด)
 *
 * 📏 สเปกแผ่น 48.26 × 33.02 gap 0.5 (ชีท Dicut เต็ม) — ตัวเดียวที่ตอบตรงกับเลขที่ร้านประกาศไว้ในหน้าสินค้าครบ 3 ขนาด:
 *   27.7×7.6 = 6 · 35.2×7.8 = 4 · 42×9.3 = 3 (สเปก Print-Fit 43.76 × 28.89 ตอบ 5/3/2 = ต่ำกว่าที่ร้านขายจริง)
 *
 * ราคาไม่เปลี่ยน: คิดต่อเซ็ต (แผ่น A3) ตามเรทเดิม · กลุ่มใหม่ต่อท้าย options (ไม่เลื่อน index ที่คลังสต๊อกอ้าง)
 * read-modify-write · รันซ้ำได้ · --dry = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "cup-sleeve";
const SIZE = "ขนาดปลอกแก้ว";
const STD = "27.7 × 7.6 ซม. (มาตรฐาน · 6 ชิ้น/เซ็ต)";
const CUSTOM = "📐 กำหนดขนาดเอง (งานคัสตอมตามไฟล์)";
const W = "ขนาดกำหนดเอง (กว้าง)";
const H = "ขนาดกำหนดเอง (สูง)";
const SECTION = "3. ขนาด";
const PAPER = "ชนิดกระดาษ";
const SHEET = { pairLabel: W, sheetW: 48.26, sheetH: 33.02, gap: 0.5, sheetName: "แผ่น A3", unitSheets: { "เซ็ต": 1 } };

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const DRY = process.argv.includes("--dry");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const opts = p.options || [];

// 1) เพดาน 6 ชิ้นย้ายจากตัวเลือกกระดาษ → ตัวเลือกขนาดมาตรฐาน
const paper = opts.find((o) => o.label === PAPER);
if (!paper) die("ไม่พบกลุ่ม " + PAPER);
for (const c of paper.choices) delete c.perUnit;

// 2) กลุ่มขนาด + คู่ช่องกรอก (แทนที่ตัวเดิมถ้ามี · ไม่มีก็ต่อท้าย)
const upsert = (opt) => {
  const at = opts.findIndex((o) => o.label === opt.label);
  if (at >= 0) opts[at] = { ...opts[at], ...opt };
  else opts.push(opt);
};
const show = { label: SIZE, choices: [CUSTOM] };
upsert({
  label: SIZE,
  display: "cards",
  section: SECTION,
  capDesigns: true,
  choices: [
    { name: STD, piecesPerUnit: 6, popular: true, desc: "ทรงมาตรฐานของร้าน มีไฟล์เทมเพลตไดคัทให้โหลด — 1 เซ็ต (แผ่น A3) ได้ 6 ชิ้น" },
    {
      name: CUSTOM,
      desc: "ไดคัทตามทรงในไฟล์ของคุณ — กรอกขนาดตอนกางแบน ระบบคำนวณให้ว่า 1 เซ็ต (แผ่น A3) ได้กี่ชิ้น",
      selectedNote:
        "ส่งไฟล์ลายตามขนาดจริง (กางแบน รวมลิ้นล็อก) · ราคาต่อเซ็ตเท่าเดิม 1 เซ็ต = 1 แผ่น A3 · จำนวนชิ้นเป็นตัวเลขโดยประมาณ กราฟฟิกยืนยันจำนวนจริงตอนส่งแบบให้ตรวจ",
    },
  ],
});
upsert({
  label: W,
  display: "input",
  standardInput: true,
  section: SECTION,
  showWhen: show,
  choices: [],
  input: { kind: "number", unit: "ซม.", min: 3, max: 48, placeholder: "เช่น 27.7", required: true, hint: "วัดตอนกางแบน ด้านที่ยาวที่สุด (ไม่รวมตัดตก) — ขนาดมาตรฐานคือ 27.7 × 7.6 ซม." },
});
upsert({
  label: H,
  display: "input",
  standardInput: true,
  section: SECTION,
  showWhen: show,
  capDesigns: true,
  choices: [],
  input: { kind: "number", unit: "ซม.", min: 3, max: 48, placeholder: "เช่น 7.6", required: true },
  sheetYield: SHEET,
});
p.options = opts;

// 3) ข้อความหน้าสินค้า — "ขนาดเดียว" ไม่จริงแล้ว
const swaps = [
  ["• จำหน่ายเป็นเซ็ต — 1 เซ็ต 6 ชิ้น · 1 แบบ | 1 ขนาด : 1 เซ็ต", "• จำหน่ายเป็นเซ็ต — 1 เซ็ต = 1 แผ่น A3 (ขนาดมาตรฐานได้ 6 ชิ้น) · 1 แบบ | 1 ขนาด : 1 เซ็ต"],
  ["• ขนาดเดียว 27.7 × 7.6 ซม. (วัดตอนกางแบน ก่อนสวม)", "• ขนาดมาตรฐาน 27.7 × 7.6 ซม. (วัดตอนกางแบน ก่อนสวม) · 6 ชิ้น/เซ็ต\n• 📐 กำหนดขนาดเองได้ (งานคัสตอมตามไฟล์) — กรอกขนาดแล้วระบบคำนวณให้ว่า 1 เซ็ต (แผ่น A3) ได้กี่ชิ้น ราคาต่อเซ็ตเท่าเดิม"],
  ["• 1 เซ็ต 6 ชิ้น · 1 แบบ | 1 ขนาด : 1 เซ็ต", "• 1 เซ็ต = 1 แผ่น A3 (ขนาดมาตรฐาน 6 ชิ้น) · 1 แบบ | 1 ขนาด : 1 เซ็ต"],
  ["• ขนาดงานมีแบบเดียว 27.7 × 7.6 ซม. (กางแบน)", "• ขนาดมาตรฐาน 27.7 × 7.6 ซม. (กางแบน) หรือกำหนดขนาดเองตามไฟล์ — จำนวนชิ้นต่อเซ็ตของขนาดกำหนดเองเป็นตัวเลขโดยประมาณ กราฟฟิกยืนยันตอนส่งแบบ"],
  ["• งานเป็นทรงมาตรฐานของร้าน ไม่ได้ตัดตามขนาดแก้วเฉพาะรุ่น", "• ทรงมาตรฐานของร้านไม่ได้ตัดตามขนาดแก้วเฉพาะรุ่น — ต้องการทรง/ขนาดเฉพาะ เลือก \"กำหนดขนาดเอง\""],
];
for (const t of p.tabs || []) for (const [a, b] of swaps) if (t.text?.includes(a)) t.text = t.text.replace(a, b);
p.highlights = (p.highlights || []).map((h) =>
  h.startsWith("ขนาด 27.7 × 7.6 ซม.") && !h.includes("กำหนดขนาดเอง") ? h + " · กำหนดขนาดเองตามไฟล์ได้" : h
);

p.savedAt = new Date().toISOString();

// ── ตรวจก่อนเขียน ──
const size = opts.find((o) => o.label === SIZE);
const h = opts.find((o) => o.label === H);
if (!size || !h?.sheetYield || !opts.some((o) => o.label === W)) die("โครงกลุ่มไม่ครบ");
if (paper.choices.some((c) => c.perUnit)) die("perUnit ยังค้างที่กระดาษ");
if (opts.filter((o) => [SIZE, W, H].includes(o.label)).length !== 3) die("กลุ่มชื่อซ้ำ");

console.log(DRY ? "— dry —" : "— เขียน —");
console.log(opts.map((o, i) => `${i}. [${o.section}] ${o.label}`).join("\n"));
for (const t of p.tabs || []) console.log("\n## " + t.title + "\n" + (t.text || "").slice(0, 600));
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(p));
if (DRY) process.exit(0);

const { data: wrote, error: werr } = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (werr) die(werr.message);
if (!wrote?.length) die("ไม่โดนแถวไหนเลย");

const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const b = back?.data;
const bh = b?.options?.find((o) => o.label === H);
if (b?.savedAt !== p.savedAt) die("savedAt ไม่ตรง (โดนเขียนทับ?) " + b?.savedAt);
if (!(bh?.sheetYield?.sheetW === 48.26 && bh.sheetYield.unitSheets?.["เซ็ต"] === 1 && bh.sheetYield.pairLabel === W)) die("sheetYield อ่านกลับไม่ตรง");
if (b.options.find((o) => o.label === SIZE)?.choices?.[0]?.piecesPerUnit !== 6) die("piecesPerUnit มาตรฐานไม่ลง");
if (b.options.find((o) => o.label === PAPER)?.choices?.some((c) => c.perUnit)) die("perUnit กระดาษยังค้าง");
console.log("\n✓ อ่านกลับตรงทุกข้อ");
