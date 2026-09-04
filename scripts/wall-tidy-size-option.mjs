#!/usr/bin/env node
/**
 * WALL TIDY กระเป๋าแขวนผนัง (wall-tidy) — กลุ่มตัวเลือก "ขนาด" แบบการ์ด 2 ใบ + ช่องกรอกเพิ่มขนาด
 *
 *   node scripts/wall-tidy-size-option.mjs            (วาดภาพลง .cache/wall-tidy/upload ดูก่อน)
 *   node scripts/wall-tidy-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปคร้าน (WALL TIDY SUB): ผ้าแคนวาส 14 ออนซ์ · 7 ช่องใส่ของ · สายเกี่ยว 2 เส้น
 * เพิ่มขนาด **นิ้วละ 30 บาท (คิดตามด้านที่ยาวที่สุด)** · ขนาดอาจเคลื่อน 2-5 ซม.
 *
 * ทำ 2 อย่าง (แพทเทิร์นเดียวกับ scripts/acrylic-coaster-size-group.mjs):
 *   1. กลุ่ม "ขนาด" การ์ด 2 ใบ พร้อมภาพวาด 900×900
 *        • "55×33 ซม."                  ขนาดมาตรฐาน รวมในราคา (การ์ดระบุผ้าแคนวาส 14 ออนซ์)
 *        • "📐 เพิ่มขนาด (+฿30/นิ้ว)"    ขยายจากมาตรฐาน คิดตามด้านยาวสุด
 *   2. ช่องกรอก "เพิ่มขนาด · ด้านยาวสุด (นิ้ว)" (โผล่เมื่อเลือกการ์ดเพิ่มขนาด)
 *      คิดเงินด้วย inputFee { perUnit: 30 } — กรอก 4 → +฿120/ชุด
 *
 * ⚠️ ตีความเอง 2 จุด รอร้านยืนยัน:
 *   - ช่องกรอกรับ "จำนวนนิ้วที่เพิ่ม" (ไม่ใช่ความยาวรวม) เพราะใบสเปคเขียนว่า "เพิ่มขนาด นิ้วละ 30"
 *   - เพดานรับไว้ 12 นิ้ว (ใบสเปคไม่ระบุ) — เกินจากนี้ให้ทักแอดมินตีราคา ตามที่ร้านสั่งว่า
 *     "ขนาดคัสตอม สอบถามกับแอดมิน"
 *
 * VER v3 (3 ก.ย. 69) — v1 วาดสายเกี่ยวเป็นตัวแขวนผนัง (ผิด) · v2 ยังไม่ได้ระบุเนื้อผ้าบนการ์ด
 * โครงแผงใช้ร่วมกับการ์ด OPTION — ดู scripts/wall-tidy-panel.mjs
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด"/ช่องกรอกอยู่แล้ว = ตัดทิ้งแล้ววางใหม่ ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { W, H, TH, INK, SUB, OK, frame, title, foot, pill, callout, dim, panel } from "./wall-tidy-panel.mjs";

const PRODUCT_ID = "wall-tidy";
// v4 — เพิ่มการ์ดที่ 3 "ขนาดคัสตอม (สอบถามแอดมิน)" + เกลาคำทั้งกลุ่ม (เนื้อรูปเปลี่ยน = ต้องขึ้น VER)
const VER = "v4";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
// ⚠️ ชื่อการ์ดมาตรฐานห้ามเปลี่ยน — สินค้าเผยแพร่อยู่ ตะกร้าลูกค้าคีย์ด้วยชื่อนี้
const STD_CHOICE = "55×33 ซม.";
const PLUS_CHOICE = "📐 เพิ่มขนาด (นิ้วละ ฿30)";
const ASK_CHOICE = "💬 ขนาดคัสตอม (สอบถามแอดมิน)";
const INPUT_LABEL = "เพิ่มขนาด · ด้านยาวสุด (นิ้ว)";
const RATE = 30; // บาทต่อนิ้วที่เพิ่มจากมาตรฐาน
const MAX = 12;  // เกินนี้ให้แอดมินตีราคา (การ์ดคัสตอม)
const NEXT_GROUP = "OPTION"; // จุดแทรก: หน้ากลุ่มนี้

const STD_DESC = "ผ้าแคนวาส 14 ออนซ์ · สูง 55 × กว้าง 33 ซม. · 7 ช่องใส่ของ กับสายเกี่ยว 2 เส้น รวมในราคาแล้ว";
const PLUS_DESC = `ทรงเดิม 7 ช่องเท่าเดิม แต่ยาวขึ้นตามที่ต้องการ — กรอกจำนวนนิ้วที่อยากเพิ่มในช่องด้านล่าง ระบบคิดราคาให้ทันที นิ้วละ ฿${RATE} (รับได้ถึง ${MAX} นิ้ว)`;
const ASK_DESC = `อยากเปลี่ยนทรง เพิ่ม-ลดจำนวนช่อง หรือใหญ่กว่า ${MAX} นิ้ว — กดสั่งไว้ก่อนได้เลย แอดมินจะทักกลับไปตีราคาให้`;

/** ป้ายแคปซูล 2 อันเรียงกลางบรรทัดเดียว — ใช้บอกสเปกผ้ากับระบบพิมพ์บนการ์ดขนาด */
const pillRow = (y, texts) => {
  const ws = texts.map((t) => t.length * 14.5 + 56);
  const gap = 24;
  let x = (W - (ws.reduce((a, b) => a + b, 0) + gap * (texts.length - 1))) / 2;
  return texts
    .map((t, i) => { const c = x + ws[i] / 2; x += ws[i] + gap; return pill(c, y, t); })
    .join("");
};

/** การ์ด 1 — ขนาดมาตรฐาน: แผงเต็มใบ + ลูกศรวัด 2 แกน + ป้ายเนื้อผ้า/ระบบพิมพ์ */
function stdArt() {
  const h = 448;
  const g = panel(486, 172, Math.round((h * 33) / 55), h);
  return frame(`
    ${title("ขนาดกระเป๋าแขวนผนัง 55 × 33 ซม.", "แนวตั้ง · 7 ช่องใส่ของ — ขนาดมาตรฐานของร้าน")}
    ${g.svg}
    ${dim(g.x0 - 42, g.top, g.x0 - 42, g.bottom, "55 ซม.")}
    ${dim(g.x0, g.bottom + 34, g.x1, g.bottom + 34, "33 ซม.", "above")}
    ${callout(g.x1 - 24, g.top + g.sleeveH / 2, 654, 168, "ไม้ดาม + เชือกแขวน", "ok")}
    ${pillRow(686, ["ผ้าแคนวาส 14 ออนซ์", "พิมพ์ซับลิเมชั่นเต็มใบ"])}
    ${foot([
      "เนื้อผ้าหนา 14 ออนซ์ อยู่ทรง ไม่ย้วย · หัว-ท้ายเย็บปลอกสอดไม้ดาม แขวนได้เลย",
      "สายเกี่ยวปลายตะขอ 2 เส้น รวมในราคา · ขนาดอาจมีความเคลื่อน 2-5 ซม.",
    ])}`);
}

/** การ์ด 2 — เพิ่มขนาด: แผงมาตรฐาน + กรอบประที่ใหญ่ขึ้น + ลูกศรกางออก + ป้ายเรทต่อนิ้ว */
function customArt() {
  const h = 366;
  const w = Math.round((h * 33) / 55);
  const g = panel(430, 196, w, h, { straps: 2 });
  // กรอบประ = ขนาดที่ขยายแล้ว (โตตามสัดส่วนเดิม) — ยึดขอบบนไว้ที่เดิม ให้เห็นว่ายาวลงล่าง
  const grow = 1.22;
  const bw = Math.round(w * grow);
  const bh = Math.round(h * grow);
  const bx = g.cx - bw / 2;
  const by = g.top - 10;
  const arrow = (x, y, dx, dy) => `
    <line x1="${x}" y1="${y}" x2="${x + dx}" y2="${y + dy}" stroke="${OK}" stroke-width="5" stroke-linecap="round"/>
    <path d="M ${x + dx} ${y + dy} l ${-dx * 0.32 - dy * 0.18} ${-dy * 0.32 + dx * 0.18} M ${x + dx} ${y + dy} l ${-dx * 0.32 + dy * 0.18} ${-dy * 0.32 - dx * 0.18}"
      stroke="${OK}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  const a = 30;
  return frame(`
    ${title("เพิ่มขนาดได้ตามต้องการ", `ใหญ่กว่ามาตรฐาน คิดเพิ่ม นิ้วละ ฿${RATE} — วัดจากด้านที่ยาวที่สุด`)}
    ${g.svg}
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="14" fill="none" stroke="${OK}" stroke-width="4" stroke-dasharray="14 11"/>
    ${arrow(bx + 8, by + 8, -a, -a)}
    ${arrow(bx + bw - 8, by + 8, a, -a)}
    ${arrow(bx + 8, by + bh - 8, -a, a)}
    ${arrow(bx + bw - 8, by + bh - 8, a, a)}
    <!-- แกนที่ใช้คิดเงิน: ด้านยาวสุด (ความสูง) -->
    ${dim(bx - 62, by, bx - 62, by + bh, "ด้านยาวสุด")}
    <text x="${W / 2}" y="${by + bh + 76}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${INK}">ยาวขึ้น 1 นิ้ว = เพิ่ม ฿${RATE} ต่อชุด</text>
    ${pill(W / 2, by + bh + 98, "กรอกจำนวนนิ้วในช่องด้านล่าง")}
    ${foot([
      `ตัวอย่าง: เพิ่ม 4 นิ้ว = เพิ่ม ฿${4 * RATE} ต่อชุด (ระบบคิดให้เองตอนเลือก) · รับได้ถึง ${MAX} นิ้ว`,
      "อยากได้ทรงพิเศษ เปลี่ยนจำนวนช่อง หรือเกินจากนี้ — เลือกการ์ด “ขนาดคัสตอม”",
    ])}`);
}

/** การ์ด 3 — ขนาดคัสตอม: แผงมาตรฐาน + กรอบคำพูดบอกว่าคุยอะไรกับแอดมินได้บ้าง */
function askArt() {
  const h = 372;
  const g = panel(250, 210, Math.round((h * 33) / 55), h, { straps: 2 });
  const bx = 436, by = 252, bw = 416, bh = 232;
  const line = (i, t) => `
    <circle cx="${bx + 42}" cy="${by + 58 + i * 58}" r="6" fill="${OK}"/>
    <text x="${bx + 62}" y="${by + 66 + i * 58}" font-family="${TH}" font-size="23" fill="${INK}">${t}</text>`;
  return frame(`
    ${title("ขนาดคัสตอม — คุยกับแอดมิน", "เปลี่ยนทรง เปลี่ยนจำนวนช่อง หรือขนาดพิเศษ ตีราคาให้เป็นงาน ๆ")}
    ${g.svg}
    <!-- กรอบคำพูด: หางชี้กลับไปที่ตัวงาน -->
    <path d="M${bx} ${by + bh * 0.4} l -30 18 l 30 18 Z" fill="#ecfeff" stroke="${OK}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="26" fill="#ecfeff" stroke="${OK}" stroke-width="3"/>
    <line x1="${bx}" y1="${by + bh * 0.4 + 2}" x2="${bx}" y2="${by + bh * 0.4 + 34}" stroke="#ecfeff" stroke-width="5"/>
    ${line(0, "เปลี่ยนทรง / สัดส่วนใบ")}
    ${line(1, "เพิ่ม-ลด หรือย้ายช่องใส่ของ")}
    ${line(2, `ยาวขึ้นเกิน ${MAX} นิ้ว`)}
    ${pill(W / 2, g.bottom + 44, "กดสั่งไว้ก่อนได้เลย — แอดมินตีราคาให้")}
    ${foot([
      "ราคาจะขึ้นเป็น “รอแอดมินตีราคา” จนกว่าทางร้านจะใส่ราคาให้",
      "แนบภาพตัวอย่างหรือขนาดที่อยากได้ในช่องหมายเหตุถึงร้าน จะตีราคาได้ไวขึ้น",
    ])}`);
}

const FILES = [
  { file: `size-55x33-${VER}.jpg`, svg: stdArt(), choice: STD_CHOICE },
  { file: `size-plus-inch-${VER}.jpg`, svg: customArt(), choice: PLUS_CHOICE },
  { file: `size-ask-admin-${VER}.jpg`, svg: askArt(), choice: ASK_CHOICE },
];
const bufs = {};
for (const f of FILES) {
  const buf = await sharp(Buffer.from(f.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  bufs[f.file] = buf;
  writeFileSync(`${OUT}/${f.file}`, buf);
  console.log(`🖼  ${OUT}/${f.file}  ${Math.round(buf.length / 1024)} KB — ${f.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const urls = {};
for (const f of FILES) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, bufs[f.file], { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  urls[f.choice] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", urls[f.choice]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: `ทุกขนาดใช้ผ้าแคนวาส 14 ออนซ์ พิมพ์ซับลิเมชั่นเต็มใบ — อยากได้ยาวขึ้นจากมาตรฐาน คิดเพิ่มนิ้วละ ฿${RATE} วัดจากด้านที่ยาวที่สุด · อยากเปลี่ยนทรงหรือจำนวนช่อง เลือก "ขนาดคัสตอม" แล้วคุยกับแอดมินได้เลย`,
  choices: [
    { name: STD_CHOICE, popular: true, desc: STD_DESC, imageSrc: urls[STD_CHOICE] },
    { name: PLUS_CHOICE, desc: PLUS_DESC, imageSrc: urls[PLUS_CHOICE] },
    // 💬 เลือกแล้วราคาเป็น "รอแอดมินตีราคา" แต่ยังกดสั่งไว้ได้ (ProductOptionChoice.askPrice)
    { name: ASK_CHOICE, askPrice: true, desc: ASK_DESC, imageSrc: urls[ASK_CHOICE] },
  ],
};

const sizeInput = {
  label: INPUT_LABEL,
  // ⚠️ ต้องมี choices: [] เสมอแม้เป็นช่องกรอก — โค้ดหลายที่เรียก opt.choices.map/[0] ตรง ๆ (หน้าสินค้าจะ 500)
  choices: [],
  display: "input",
  standardInput: true,
  showWhen: { label: SIZE_GROUP, choices: [PLUS_CHOICE] },
  input: {
    kind: "number",
    unit: "นิ้ว",
    min: 1,
    max: MAX,
    required: false,
    placeholder: "2",
    hint: `กรอกว่าอยากให้ยาวขึ้นจากมาตรฐาน 55 ซม. กี่นิ้ว — นิ้วละ ฿${RATE} ต่อชุด · อยากได้เกิน ${MAX} นิ้ว ให้เลือกการ์ด "ขนาดคัสตอม" แทน`,
  },
  inputFee: { perUnit: RATE },
};

// รันซ้ำได้: ตัดของเดิมทิ้งก่อนแล้ววางใหม่ที่หน้ากลุ่ม OPTION
const cleaned = options.filter((o) => o.label !== SIZE_GROUP && o.label !== INPUT_LABEL);
const at = cleaned.findIndex((o) => o.label === NEXT_GROUP);
if (at < 0) { console.error(`ไม่เจอกลุ่ม "${NEXT_GROUP}" — หยุดก่อน อย่าเดาตำแหน่ง`); process.exit(1); }
cleaned.splice(at, 0, sizeGroup, sizeInput);

// กลุ่ม OPTION (เพิ่มกระเป๋า/เพิ่มสาย) = ของงานสั่งทำ — โชว์เฉพาะการ์ดคัสตอมทั้งสองใบ (ร้านสั่ง 3 ก.ย. 69)
// เลือกขนาดมาตรฐานอยู่ = ซ่อนทั้งกลุ่ม · optionActive กันให้แล้วทั้งราคาและตะกร้า ค่าที่เคยติ๊กค้างไม่ถูกคิดเงิน
cleaned[cleaned.findIndex((o) => o.label === NEXT_GROUP)].showWhen = { label: SIZE_GROUP, choices: [PLUS_CHOICE, ASK_CHOICE] };

data.options = cleaned;
// การ์ด "ขนาดคัสตอม" เป็น askPrice → การ์ดหน้ารายการต้องขึ้น "เริ่มต้น ฿X"
// ปกติ /api/admin/products เขียนธงนี้ให้ตอนกดบันทึก สคริปต์ต้องเซ็ตเอง ([[iducky-script-write-product]])
data.quoteOption = true;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options;
const gSize = got.find((o) => o.label === SIZE_GROUP);
const gInput = got.find((o) => o.label === INPUT_LABEL);
const gOpt = got.find((o) => o.label === NEXT_GROUP);
const fails = [
  [gOpt?.showWhen?.label === SIZE_GROUP && [PLUS_CHOICE, ASK_CHOICE].every((c) => gOpt?.showWhen?.choices?.includes(c)),
    "กลุ่ม OPTION ไม่ได้ผูก showWhen กับการ์ดคัสตอมทั้งสองใบ"],
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [got.filter((o) => o.label === INPUT_LABEL).length === 1, "ช่องกรอกซ้ำ/หาย (คิดเงินซ้ำ)"],
  [gSize?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [gSize?.choices?.length === 3, "การ์ดในกลุ่มขนาดไม่ครบ 3 ใบ"],
  [gSize?.choices?.[0]?.name === STD_CHOICE && gSize?.choices?.[0]?.imageSrc === urls[STD_CHOICE], "การ์ดมาตรฐานไม่ตรง"],
  [gSize?.choices?.[0]?.desc === STD_DESC, "คำอธิบายการ์ดมาตรฐานไม่ตรง (ต้องระบุผ้า 14 ออนซ์)"],
  [gSize?.choices?.[1]?.name === PLUS_CHOICE && gSize?.choices?.[1]?.imageSrc === urls[PLUS_CHOICE], "การ์ดเพิ่มขนาดไม่ตรง"],
  [gSize?.choices?.[2]?.name === ASK_CHOICE && gSize?.choices?.[2]?.imageSrc === urls[ASK_CHOICE], "การ์ดขนาดคัสตอมไม่ตรง"],
  [gSize?.choices?.[2]?.askPrice === true, "การ์ดขนาดคัสตอมไม่ได้ตั้ง askPrice (ไม่รอแอดมินตีราคา)"],
  [back.data.quoteOption === true, "ไม่ได้ตั้งธง quoteOption (การ์ดหน้ารายการจะโชว์ราคาผิด)"],
  [gInput?.inputFee?.perUnit === RATE, "เรทต่อนิ้วไม่ถูก"],
  [gInput?.showWhen?.label === SIZE_GROUP && gInput?.showWhen?.choices?.[0] === PLUS_CHOICE && gInput?.showWhen?.choices?.length === 1,
    "showWhen ช่องกรอกไม่ถูก (ต้องโผล่เฉพาะการ์ดเพิ่มนิ้ว ไม่ใช่การ์ดคัสตอม)"],
  [gInput?.input?.max === MAX && gInput?.input?.required === false, "เพดาน/required ช่องกรอกไม่ถูก"],
  [Array.isArray(gInput?.choices), "ช่องกรอกขาด choices: [] (หน้าสินค้าจะ 500)"],
  [got.findIndex((o) => o.label === SIZE_GROUP) < got.findIndex((o) => o.label === NEXT_GROUP), "กลุ่มขนาดไม่ได้อยู่หน้ากลุ่ม OPTION"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log("\nตัวอย่างค่าเพิ่มขนาด (ต่อชุด):");
for (const v of [1, 2, 4, 8, MAX]) console.log(`  เพิ่ม ${String(v).padStart(2)} นิ้ว  →  +฿${v * RATE}`);
console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" (2 การ์ด+ภาพ) + ช่องกรอก "${INPUT_LABEL}" อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
