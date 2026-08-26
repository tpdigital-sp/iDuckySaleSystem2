/**
 * การ์ดสเปรย์แอลกอฮอล์ (new-mt2s1we8-1325) — เรท 20 ml (สติ๊กเกอร์ Digital)
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69:
 *  1) เพิ่มกลุ่ม "เนื้อสติ๊กเกอร์" ชุดเดียวกับสินค้าสติ๊กเกอร์ PP (sticker-pp)
 *  2) เนื้อใสมีตัวเลือกย่อย ไม่รองขาว / รองขาว +20 บาท
 *  3) 1 แผ่น A3 ได้ 15 ชิ้น → ค่ารองขาวคิด "ต่อแผ่น A3 ปัดขึ้นเต็มแผ่น" (sheetFee/perSheet)
 *     ไม่ใช่ต่อชิ้น — เหมือน sticker-pp ที่ราคาต่อแผ่น A3 ต่างกัน 20 บาท
 *  4) คละลาย: ลายละ 5 ชิ้น · เกินโควตาลายละ 5 บาท (minPerDesign/extraDesignFee ของเรท)
 *
 * รันซ้ำได้ (อ่านของจริงจาก DB มาแก้แล้วเขียนกลับ) — node scripts/spray-card-sticker-material.mjs [--dry]
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "new-mt2s1we8-1325";
const RATE_20 = "20 ml · สติ๊กเกอร์แปะบนการ์ด (Digital)";
const MAT = "เนื้อสติ๊กเกอร์";
const WHITE = "รองพื้นขาวใต้ลาย";
const CLEAR = "PP ใส";
const PER_SHEET = 15; // 1 แผ่น A3 ได้ 15 ชิ้น (ผู้ใช้ยืนยัน)
const WHITE_FEE = 20; // บาท / แผ่น A3
const DRY = process.argv.includes("--dry");

// ยืมภาพเนื้อสติ๊กเกอร์จาก sticker-pp (ชุดเดียวกัน ไม่ต้องอัปซ้ำ)
const PP = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/sticker-pp/";

const matGroup = {
  label: MAT,
  display: "cards",
  note: `พิมพ์ Digital ลงเนื้อสติ๊กเกอร์แล้วแปะบนการ์ด — ชุดเนื้อเดียวกับสติ๊กเกอร์ PP · งานพิมพ์ 1 แผ่น A3 ได้ ${PER_SHEET} ชิ้น`,
  showWhen: { label: "เรทราคา", choices: [RATE_20] },
  choices: [
    {
      name: "PP ขาวมัน",
      desc: "เนื้อขาวผิวมันเงา สีสดคมชัด — แบบมาตรฐานที่ลูกค้าสั่งบ่อยที่สุด",
      perSheet: PER_SHEET,
      imageSrc: PP + "pp-gloss.jpg",
    },
    {
      name: CLEAR,
      desc: "เนื้อใสมองทะลุเห็นตัวการ์ด/น้ำข้างใน — เลือกได้ว่าจะรองพื้นขาวใต้ลายไหม",
      perSheet: PER_SHEET,
      imageSrc: PP + "pp-clear-nowhite.jpg",
    },
    {
      name: "PP ขาวด้าน",
      desc: "เนื้อขาวผิวด้าน ไม่สะท้อนแสง ให้ลุคเรียบหรู",
      perSheet: PER_SHEET,
      imageSrc: PP + "pp-matte.jpg",
    },
    {
      name: "PP ขาวมุก",
      desc: "เนื้อขาวประกายมุกวิ้ง ๆ เปลี่ยนเฉดตามมุมมอง ดูพรีเมียม",
      perSheet: PER_SHEET,
      imageSrc: PP + "pp-pearl.jpg",
    },
  ],
};

const whiteGroup = {
  label: WHITE,
  display: "cards",
  note: `ค่ารองขาวคิดต่อแผ่น A3 (1 แผ่น A3 = ${PER_SHEET} ชิ้น) ปัดขึ้นเต็มแผ่น — ไม่ได้คิดต่อชิ้น`,
  showWhen: { label: MAT, choices: [CLEAR] },
  showWhenAlso: { label: "เรทราคา", choices: [RATE_20] },
  sheetFee: { from: MAT, unit: "แผ่น A3" },
  choices: [
    {
      name: "ไม่รองขาว",
      desc: "ลายโปร่งแสง มองทะลุเห็นการ์ดและน้ำข้างใน ไม่มีค่าเพิ่ม",
      imageSrc: PP + "pp-clear-nowhite.jpg",
    },
    {
      name: "รองขาว",
      desc: `พิมพ์พื้นขาวใต้ลาย สีทึบสดบนขอบใส — +${WHITE_FEE} บาท ต่อแผ่น A3 (${PER_SHEET} ชิ้น) ไม่ใช่ต่อชิ้น`,
      extra: WHITE_FEE,
      imageSrc: PP + "pp-clear-white.jpg",
    },
  ],
};

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const d = row.data;

// ── 1) กลุ่มตัวเลือก ── วางต่อจาก "สีการ์ด" (ก่อนกลุ่มเคลือบ) · มีอยู่แล้วก็ทับตัวเดิมตรงที่เดิม
const opts = (d.options ?? []).filter((o) => o.label !== MAT && o.label !== WHITE);
const at = opts.findIndex((o) => o.label === "สีการ์ด");
opts.splice(at < 0 ? 0 : at + 1, 0, matGroup, whiteGroup);
d.options = opts;

// ── 2) กติกาคละลายของเรท 20 ml — ลายละ 5 ชิ้น · เกินโควตาลายละ 5 บาท
for (const r of d.priceRates ?? []) {
  if (r.label !== RATE_20) continue;
  r.minPerDesign = 5;
  r.extraDesignFee = 5;
}

// ── 3) ข้อความ: แท็บรายละเอียด + FAQ (แก้บรรทัดเดิมถ้ามี ไม่ให้ซ้อน)
const MAT_LINE = `• เลือกเนื้อสติ๊กเกอร์ได้ 4 แบบ: PP ขาวมัน / PP ใส / PP ขาวด้าน / PP ขาวมุก — เนื้อใสเลือกรองพื้นขาวได้ (+${WHITE_FEE} บาท ต่อแผ่น A3 · 1 แผ่นได้ ${PER_SHEET} ชิ้น)`;
for (const t of d.tabs ?? []) {
  if (!t?.text?.includes("::20 ml")) continue;
  t.text = t.text.replace(/\n• เลือกเนื้อสติ๊กเกอร์ได้[^\n]*/g, "");
  t.text = t.text.replace(
    /(• เลือกตัวการ์ดได้ 2 สี[^\n]*)/,
    `$1\n${MAT_LINE}`
  );
}
const FAQ_Q = "เนื้อสติ๊กเกอร์ของแบบ 20 ml เลือกได้กี่แบบ?";
const faqs = (d.seo?.faqs ?? []).filter((f) => f.q !== FAQ_Q);
if (d.seo) {
  faqs.push({
    q: FAQ_Q,
    a: `มี 4 เนื้อ: PP ขาวมัน · PP ใส · PP ขาวด้าน · PP ขาวมุก (ชุดเดียวกับสติ๊กเกอร์ PP) — ถ้าเลือกเนื้อใส เลือกได้อีกว่าจะไม่รองขาว (ลายโปร่งแสง) หรือรองขาวให้สีทึบ ซึ่งคิดเพิ่ม ${WHITE_FEE} บาทต่อแผ่น A3 โดย 1 แผ่น A3 พิมพ์ได้ ${PER_SHEET} ชิ้น`,
  });
  d.seo.faqs = faqs;
}

d.savedAt = new Date().toISOString();

// ── ตรวจก่อนเขียน ──
const src = d.options.find((o) => o.label === MAT);
if (!src?.choices.every((c) => c.perSheet === PER_SHEET)) throw new Error("perSheet ไม่ครบทุกเนื้อ — sheetFee จะคิดผิด");
const wg = d.options.find((o) => o.label === WHITE);
if (wg.sheetFee.from !== MAT) throw new Error("sheetFee.from ต้องชี้กลุ่มที่มี perSheet");
if (!src.choices.some((c) => c.name === CLEAR)) throw new Error("ไม่เจอตัวเลือกเนื้อใส");

console.log("กลุ่มตัวเลือกหลังแก้:");
for (const o of d.options) console.log("  -", o.label, o.choices?.length ?? 0, "ตัวเลือก", o.sheetFee ? "(คิดต่อแผ่น)" : "");
const r20 = d.priceRates.find((r) => r.label === RATE_20);
console.log(`เรท 20 ml: minPerDesign=${r20.minPerDesign} extraDesignFee=${r20.extraDesignFee}`);
for (const q of [5, 15, 16, 30, 31]) {
  console.log(`  สั่ง ${q} ชิ้น + รองขาว = ⌈${q}/${PER_SHEET}⌉ × ฿${WHITE_FEE} = ฿${Math.max(1, Math.ceil(q / PER_SHEET)) * WHITE_FEE}`);
}

const tab = (d.tabs ?? []).find((t) => t?.text?.includes("::20 ml"));
console.log("\nแท็บรายละเอียด (ท่อน 20 ml):");
console.log(tab.text.split("\n\n")[0]);

if (DRY) {
  console.log("\n(dry run — ไม่ได้เขียนลง DB)");
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) throw e2;
console.log("\n✅ เขียนลง DB แล้ว");
