#!/usr/bin/env node
/**
 * สร้างคลังชื่อสินค้า (SKU) ตั้งต้น จากชื่อที่พนักงานเคยพิมพ์จริง
 *
 *   node scripts/stock-catalog.mjs            # ดูผลอย่างเดียว ไม่เขียนอะไร
 *   node scripts/stock-catalog.mjs --write    # เขียน stockItems ลง Firestore จริง
 *
 * แนวคิด: ของส่วนใหญ่เป็น "ตระกูล" ที่แตกตัวแปร (กล่อง A-G, เคส 11-17 × ms/พรีเมียม)
 * เลยประกาศเป็น matrix แล้วให้ระบบกางเอง — ไม่ต้องพิมพ์ทีละตัว
 * ทุกชื่อดิบที่จับคู่ได้จะถูกเก็บเป็น alias ให้ SKU นั้น → ระบบเดาชื่อได้ตั้งแต่วันแรก
 *
 * ยอดคงเหลือตั้งต้น = 0 เสมอ (ตั้งใจ) — ต้องเดินนับจริงแล้วลง "ปรับยอดนับจริง"
 * ห้ามคำนวณย้อนหลังจากใบสั่งเก่า เพราะไม่มี ledger ของการใช้ ยอดจะเพี้ยนตั้งแต่วันแรก
 */
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const WRITE = process.argv.includes("--write");
const AUTO = process.argv.includes("--auto");   // สร้าง SKU ใหม่เองจากชื่อที่ยังไม่รู้จัก
const ENV_PATH = "/Users/iduckshop/Desktop/iDuckySaleSystem2/.env.local";

// ───────────────────────── ตัดชื่อให้เหลือแกน ─────────────────────────
const UNIT_WORDS = "ชิ้น|ตัว|ม้วน|แผ่น|กล่อง|แพ็ค|ใบ|อัน|ชุด|โหล|รีม|ลัง|กก\\.?|เมตร|ม\\.|ห่อ|ถุง|ขวด|ก้อน";

/** ตัดจำนวน/โน้ต/ลิงก์ทิ้ง เหลือแต่ชื่อของ */
export function coreName(raw) {
  let s = String(raw || "").split("\n")[0];
  s = s.replace(/https?:\/\/\S+/g, " ");
  s = s.replace(/\((เร่งสั่ง|โอนแล้ว|ด่วน)\)/gi, " ");
  s = s.replace(/\(หัก[^)]*\)/g, " ");
  s = s.replace(/^\s*[-•·]\s*/, "");
  s = s.replace(/^\s*(สั่งของ|สั่งซื้อ|สั่ง)\s*/, "");        // "สั่งผ้าหนึบ" → "ผ้าหนึบ"
  s = s.replace(/\s*ตอนนี้[\s\S]*$/, " ");                    // "…8ออน ตอนนี้กำลังจะเปิด…"
  // "เหลือ 44 ชิ้น" / "msเหลือ 44" — ไม่บังคับว่าต้องมีเว้นวรรคนำ เพราะคนพิมพ์ติดกันบ่อย
  s = s.replace(/(เหลือ|คงเหลือ|สั่งอีก|สั่งเพิ่ม|ขอสั่ง|จำนวน)\s*(ประมาณ\s*)?[\d,][\s\S]*$/, " ");
  s = s.replace(/\s(มี|หมด|สั่ง)\s*[\d,]*[\s\S]*$/, " ");
  // จำนวน+หน่วยท้ายชื่อ — รับ "1,500 ชิ้น" ที่มีลูกน้ำคั่นหลักพัน
  // ไม่ใช้ \b เพราะอักษรไทยไม่นับเป็น word char ขอบเขตคำเลยไม่เกิด ("15ตัวครับ" จะตัดไม่ออก)
  s = s.replace(new RegExp(`\\s*[\\d,]+(\\.\\d+)?\\s*(${UNIT_WORDS})[\\s\\S]*$`), " ");
  s = s.replace(/\s*\bหมด\b[\s\S]*$/, " ");
  return s.replace(/\s+/g, " ").trim();
}

const stripTone = (s) => s.replace(/[็่้๊๋์]/g, "");

/** ทำให้เทียบกันได้ — ตัดเว้นวรรค/วรรณยุกต์ และรวมวิธีเขียนที่คนพิมพ์ต่างกัน */
const norm = (s) =>
  stripTone(
    coreName(s)
      .toLowerCase()
      .replace(/เเ/g, "แ")                       // เ+เ ที่คนพิมพ์แทน แ ("เเม็กเซฟ" = "แม็กเซฟ")
      .replace(/(\d)\s*[x×*]\s*(\d)/g, "$1*$2")  // 9x7.5 / 9 × 7.5 → 9*7.5
      .replace(/\s+/g, "")
  );

/**
 * regex ที่เทียบกับผลของ norm() ได้ — ตัดวรรณยุกต์ในตัว pattern ให้อัตโนมัติ
 * (กันบั๊กแบบเขียน /ไม่มีขอบ/ แล้วไม่ match "ไมมีขอบ" ที่ norm คายออกมา)
 */
const rx = (src, flags = "") => new RegExp(stripTone(src), flags);

/** ขนาด "3.5 × 5 + 2" → "3.5*5+2" */
function canonSize(s) {
  const m = s.match(/(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)\s*(?:\+\s*(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  return `${m[1]}*${m[2]}${m[3] ? `+${m[3]}` : ""}`;
}

// ───────────────────────── ตัวช่วยประกาศตระกูล ─────────────────────────
const cross = (...lists) =>
  lists.reduce((acc, l) => acc.flatMap((a) => l.map((b) => [...a, b])), [[]]);

/**
 * ตระกูลแบบรายการ — rows = [code, ชื่อทางการ, pattern ที่ใช้จับ]
 * ⚠️ เรียงจากเฉพาะเจาะจงไปกว้าง เพราะจับได้ตัวแรกแล้วหยุด
 */
const listFam = (id, label, unit, category, rows) => ({
  id, label, unit, category,
  skus: rows.map(([code, name]) => ({ key: code, code, name })),
  match: (s) => {
    const c = norm(s);
    for (const [code, , re] of rows) if (rx(re).test(c)) return code;
    return null;
  },
});

/** ตระกูลแบบขนาด — เจอ prefix แล้วอ่านตัวเลขขนาดจากชื่อ */
const sizeFam = (id, label, unit, category, prefix, codePrefix, sizes, nameOf) => ({
  id, label, unit, category,
  skus: sizes.map((sz) => ({
    key: sz,
    code: `${codePrefix}-${sz.replace(/[*+.]/g, "")}`,
    name: nameOf(sz),
  })),
  match: (s) => (rx(prefix).test(norm(s)) ? canonSize(norm(s)) : null),
});

// ───────────────────────── ประกาศตระกูล ─────────────────────────
// แต่ละตระกูล: กาง SKU จาก matrix + บอกวิธีจับชื่อดิบเข้า SKU
// ลำดับในอาเรย์สำคัญ — ตระกูลที่เฉพาะเจาะจงกว่าต้องมาก่อน (ซองแก้วใส ก่อน ซองใส)
const FAMILIES = [
  {
    id: "box",
    label: "กล่อง",
    unit: "ใบ",
    category: "บรรจุภัณฑ์",
    skus: ["0", "A", "B", "C", "D", "E", "F", "G", "2A", "2F"].map((v) => ({
      key: v,
      code: `BOX-${v}`,
      name: `กล่อง ${v}`,
    })),
    match: (s) => {
      const m = coreName(s).match(/^กล่อง\s*([0-9]{0,1}\s*[A-Za-z]|[0-9])$/);
      return m ? m[1].replace(/\s/g, "").toUpperCase() : null;
    },
  },
  {
    id: "case",
    label: "เคสมือถือ",
    unit: "ชิ้น",
    category: "เคส",
    // รุ่น × ตัวถัง × เกรด — สมมติ p = Pro, pm = Pro Max (รอผู้ใช้ยืนยัน)
    skus: [
      ...cross(["11", "12", "13", "14", "15", "16", "17"], ["", "mini", "+", "p", "pm"], ["ms", "พรีเมียม"]),
      ...cross(["s24", "s25"], ["", "+", "ultra"], ["ms", "พรีเมียม"]),
    ].map(([model, body, grade]) => {
      const label = { "": "", mini: " mini", "+": " Plus", p: " Pro", pm: " Pro Max", ultra: " Ultra" }[body];
      const brand = model.startsWith("s") ? `Samsung ${model.toUpperCase()}` : `iPhone ${model}`;
      const bodyCode = { "": "STD", mini: "MINI", "+": "PLUS", p: "P", pm: "PM", ultra: "ULTRA" }[body];
      return {
        key: `${model}${body}|${grade}`,
        code: `CASE-${model.toUpperCase()}${bodyCode}-${grade === "ms" ? "MS" : "PRM"}`,
        name: `เคส ${brand}${label} · ${grade === "ms" ? "MagSafe" : "พรีเมียม"}`,
      };
    }),
    match: (s) => {
      // norm() ตัดเว้นวรรคแล้ว → "14p ms" = "14pms", "16+ พรีเมียม" = "16+พรีเมียม"
      const m = norm(s).match(
        rx("^(1[1-7]|s2[45])(promax|ultra|mini|plus|pro|pm|\\+|p)?(ms|magsafe|พรีเมียม|premium)")
      );
      if (!m) return null;
      const b = m[2] || "";
      const body = { promax: "pm", pm: "pm", pro: "p", p: "p", plus: "+", "+": "+", mini: "mini", ultra: "ultra", "": "" }[b] ?? "";
      return `${m[1]}${body}|${/ms|magsafe/.test(m[3]) ? "ms" : "พรีเมียม"}`;
    },
  },
  {
    id: "sleeve",
    label: "ซองใสฝากาว",
    unit: "ใบ",
    category: "บรรจุภัณฑ์",
    // ขนาดมาจากของจริงที่เคยสั่ง — เพิ่มทีหลังได้จากหน้า "ยังไม่รู้จัก"
    skus: [
      "2.5*3.5", "3*4", "3*4+2", "3*5+2", "3*7+2", "3.5*3.5+2", "3.5*5+2", "3.5*6+2",
      "4*4+2", "4*5+2", "4*6+2", "4*12", "4*12+2", "4*14", "4*16", "4.5*6", "4.5*6+2",
      "4.5*14+2", "5*7+2", "5*16", "6*8+2", "6.5*8+2", "6.5*9+12", "7*7", "7.5*9",
      "7.5*10+2", "9*12+2", "10*12+2", "10*14+2", "12*18+2",
    ].map((sz) => ({ key: sz, code: `SLV-${sz.replace(/[*+.]/g, "")}`, name: `ซองใสฝากาว ${sz}` })),
    match: (s) => {
      const c = coreName(s);
      if (!/^ซองใส|^ซองฝา/.test(c)) return null;   // ซองใส / ซองใสฝากาว / ซองใสฝากวา (พิมพ์ผิด)
      return canonSize(c);
    },
  },
  {
    id: "grip",
    label: "Griptok",
    unit: "ชิ้น",
    category: "อุปกรณ์เสริม",
    skus: [
      { key: "ดำ", code: "GT-BLK", name: "Griptok ดำ" },
      { key: "ขาว", code: "GT-WHT", name: "Griptok ขาว" },
      { key: "ใส", code: "GT-CLR", name: "Griptok ใส" },
      { key: "uv-กลม-ขาว", code: "GT-UV-RND-W", name: "Griptok UV ทรงกลม ฐานขาว" },
      { key: "ms-กลม", code: "GT-MS-RND", name: "Griptok MagSafe ทรงกลม" },
      { key: "หัวใจ-ดำ-ขอบ", code: "GT-HRT-BLK-E", name: "Griptok หัวใจ ดำ มีขอบ" },
      { key: "หัวใจ-ขาว-ขอบ", code: "GT-HRT-WHT-E", name: "Griptok หัวใจ ขาว มีขอบ" },
      { key: "หัวใจ-ดำ-ไม่มีขอบ", code: "GT-HRT-BLK-N", name: "Griptok หัวใจ ดำ ไม่มีขอบ" },
    ],
    match: (s) => {
      const c = norm(s);
      if (!/^(gt|griptok)/.test(c)) return null;
      if (/หัวใจ/.test(c)) {
        const color = /ขาว/.test(c) ? "ขาว" : "ดำ";
        // ⚠️ norm() ตัดวรรณยุกต์ทิ้ง "ไม่มีขอบ" จึงกลายเป็น "ไมมีขอบ" — pattern ต้องยอมให้ไม้เอกหายไป
        return `หัวใจ-${color}-${/ไม่?มีขอบ/.test(c) ? "ไม่มีขอบ" : "ขอบ"}`;
      }
      if (/uv/.test(c)) return "uv-กลม-ขาว";
      if (/magsafe|ms/.test(c)) return "ms-กลม";
      if (/ใส/.test(c)) return "ใส";
      if (/ขาว/.test(c)) return "ขาว";
      if (/ดำ/.test(c)) return "ดำ";
      return null;
    },
  },
  {
    id: "hook",
    label: "ตะขอ",
    unit: "ชิ้น",
    category: "อะไหล่",
    // ตระกูลนี้ไม่เต็ม matrix (ไม่ใช่ทุกรุ่นมีทุกสี) — กางจากคู่ที่เคยสั่งจริง
    skus: [
      ["F", "เงิน"], ["F", "รุ้ง"], ["E", "เงิน"], ["D", "เงิน"], ["V", "เงิน"], ["V", "ทอง"],
      ["K", "เงิน"], ["L", "เงิน"], ["R", "ทอง"], ["G17", "ชมพู"], ["T9", "น้ำเงิน"],
      ["AB12", "ฟ้า"], ["AB16", "ชมพูอ่อน"], ["C26", "ชมพูบานเย็น"],
    ].map(([model, color]) => ({
      key: `${model}|${color}`,
      code: `HK-${model}-${color}`,
      name: `ตะขอ ${model} สี${color}`,
    })),
    match: (s) => {
      const c = coreName(s);
      const m = c.match(/^ตะขอ\s*([A-Za-z]+\d*|\d+[A-Za-z]*)\s*(?:สี)?\s*([ก-๙]+)?/);
      if (!m) return null;
      const color = (m[2] || "").replace(/^สี/, "");
      return color ? `${m[1].toUpperCase()}|${color}` : null;
    },
  },

  // ── ซอง 3 แบบ ต้องแยกกัน เพราะเป็นวัสดุคนละอย่าง ──
  sizeFam("sleeve_glass", "ซองแก้วใสฝากาว", "ใบ", "บรรจุภัณฑ์", "^ซองแก้ว", "SLVG",
    ["3*4+2", "4*12+2", "7.5*10+2"], (sz) => `ซองแก้วใสฝากาว ${sz}`),
  sizeFam("sleeve_wb", "ซองหน้าใสหลังขาว", "ใบ", "บรรจุภัณฑ์", "^ซองหน้าใส", "SLVW",
    ["6*10", "7*10", "7.5*12", "8.5*11", "8.5*16", "10*12", "12*23", "13*21"],
    (sz) => `ซองหน้าใสหลังขาว ${sz}`),

  {
    id: "bag_num",
    label: "ถุงรวม",
    unit: "ใบ",
    category: "บรรจุภัณฑ์",
    skus: [["1", "15*20"], ["2", "18*20"], ["3", "20*30"], ["4", "30*40"], ["6", "25*35"], ["8", "40*50"]]
      .map(([no, sz]) => ({ key: no, code: `BAG-${no}`, name: `ถุงรวม เบอร์ ${no} (${sz})` })),
    // ⚠️ ต้องใช้ rx() ไม่ใช่ literal — norm() ตัด ์ ทิ้ง "เบอร์8" จึงเป็น "เบอร8"
    match: (s) => (rx("^ถุงรวม").test(norm(s)) ? (norm(s).match(rx("เบอร์(\\d+)")) || [])[1] ?? null : null),
  },

  {
    id: "mirror",
    label: "กระจก",
    unit: "ชิ้น",
    category: "สินค้าสำเร็จ",
    // กระจกพับไม่แยกสี (ข้อมูลจริงไม่เคยระบุ) · กระจกถือแยกสี
    skus: [
      ...cross(["พับ"], ["กลม", "หัวใจ", "สี่เหลี่ยม"], [""]),
      ...cross(["ถือ"], ["กลม", "หัวใจ", "สี่เหลี่ยม"], ["ขาว", "ดำ", "ชมพู", "ขาวมุก"]),
    ].map(([type, shape, color]) => ({
      key: `${type}|${shape}|${color}`,
      code: `MIR-${type === "พับ" ? "F" : "H"}-${{ กลม: "RND", หัวใจ: "HRT", สี่เหลี่ยม: "SQR" }[shape]}${color ? `-${color}` : ""}`,
      name: `กระจก${type} ทรง${shape}${color ? ` สี${color}` : ""}`,
    })),
    match: (s) => {
      const c = norm(s);
      if (!rx("^กระจก(พับ|ถือ)").test(c)) return null;
      const type = rx("^กระจกพับ").test(c) ? "พับ" : "ถือ";
      const shape = rx("หัวใจ").test(c) ? "หัวใจ" : rx("สี่?เหลี(ย|่ย)ม").test(c) ? "สี่เหลี่ยม" : rx("กลม").test(c) ? "กลม" : null;
      if (!shape) return null;
      if (type === "พับ") return `พับ|${shape}|`;
      // "ขาวมุก" ต้องเช็คก่อน "ขาว" ไม่งั้นถูกกลืน
      const color = rx("ขาวมุก").test(c) ? "ขาวมุก" : rx("ชมพู").test(c) ? "ชมพู" : rx("ดำ").test(c) ? "ดำ" : rx("ขาว").test(c) ? "ขาว" : null;
      return color ? `ถือ|${shape}|${color}` : null;
    },
  },

  // ⚠️ ต้องมาก่อน "กระดาษ" — ไม่งั้น "สติ๊กเกอร์UV Holorainbow" ถูกกระดาษ Holo คว้าไปก่อน
  // ทุก pattern ยึดหัวว่าต้องขึ้นต้นด้วยสติกเกอร์/สตก มิฉะนั้น "ใส-ขุ่น" จะไปคว้าเคส AirPods กับถุงซิปมาด้วย
  listFam("sticker", "สติกเกอร์", "ม้วน", "สติกเกอร์", [
    ["STK-UV-GOLDMATTE", "สติกเกอร์ UV ทองด้าน", "^(สติกเกอร์?|สตก).*uv ?ทองด้าน"],
    ["STK-UV-CLRWHT", "สติกเกอร์ UV ใส-ขาว", "^(สติกเกอร์?|สตก).*uv ?ใส-?ขาว"],
    ["STK-UV-CLRMILKY", "สติกเกอร์ UV ใส-ขุ่น", "^(สติกเกอร์?|สตก).*uv ?ใส-?ขุ่น"],
    ["STK-UV-WGLOSS", "สติกเกอร์ UV ขาวเงา", "^(สติกเกอร์?|สตก).*ขาวเงา"],
    ["STK-UV-WMATTE", "สติกเกอร์ UV ขาวด้าน", "^(สติกเกอร์?|สตก).*uv ?ขาวด้าน"],
    ["STK-PP-WMATTE", "สติกเกอร์ PP ขาวด้าน", "^(สติกเกอร์?|สตก).*pp ?ขาวด้าน|^(สติกเกอร์?|สตก)ขาวด้าน"],
    ["STK-CLR-MILKY", "สติกเกอร์ ใส-ขุ่น", "^(สติกเกอร์?|สตก).*ใส-?ขุ่น"],
    ["STK-UV", "สติกเกอร์ UV (ไม่ระบุผิว)", "^(สติกเกอร์?|สตก) ?uv"],
  ]),

  listFam("paper", "กระดาษ", "แผ่น", "กระดาษ", [
    ["PPR-SUB", "กระดาษปริ้นงานซับ", "^(กระดาษ)?(ปริ|ปริ้|ปริ๊|ปรินท?)น?(ซั|ซับ|ซัพ|งานซับ|งานซัพ)"],
    ["PPR-ART250", "กระดาษอาร์ตการ์ด 250g (รองหลัง)", "อาร์?ตการ์?ด"],
    ["PPR-HOLO", "กระดาษ Holo Rainbow", "holo"],
    ["PPR-STARDREAM", "กระดาษ Stardream มุกขาว", "star ?dream"],
    ["PPR-EXTRAWHITE", "กระดาษ Extra White", "extra ?whi?[lt]e"],
    ["PPR-EGGSHELL", "กระดาษ Eggshell", "eggshell"],
    ["PPR-MOORIM300", "กระดาษ Moorim 300g", "moorim ?300"],
    ["PPR-MOORIM400", "กระดาษ Moorim 400g", "moorim ?400"],
    ["PPR-CANVAS", "กระดาษ Canvas", "^กระดาษcanvas|^canvas"],
    ["PPR-GOLDMATTE", "กระดาษทองด้าน", "^กระดาษทองด้าน"],
    ["PPR-BACK", "กระดาษรองหลัง", "^กระดาษรองหลัง"],
    ["PPR-A4", "กระดาษ A4", "^กระดาษa4"],
    ["PPR-300G", "กระดาษ 300g", "^(กระดาษ)?300g"],
    ["PPR-350G", "กระดาษ 350g", "^(กระดาษ)?350g"],
    ["PPR-400G", "กระดาษ 400g", "^(กระดาษ)?400g"],
  ]),

  listFam("lam", "ฟิล์มเคลือบ", "ม้วน", "วัสดุเคลือบ", [
    ["LAM-HOLORAIN", "ฟิล์มเคลือบ โฮโลรุ้ง", "เคลือบ.*โฮโล|โฮโลรุ้ง"],
    ["LAM-GLITTER", "ฟิล์มเคลือบ กลิตเตอร์", "เคลือบ.*กลิ?ตเตอร์"],
    ["LAM-STARDUST", "ฟิล์มเคลือบ สตาร์ดัส", "เคลือบ.*(สตาร์ดัส|ดัส)"],
    ["LAM-STAR", "ฟิล์มเคลือบ ดาว", "เคลือบ.*ดาว"],
    ["LAM-SAND", "ฟิล์มเคลือบ ทราย", "เคลือบ.*ทราย"],
    ["LAM-HOT-MATTE", "ฟิล์มเคลือบร้อน ด้าน", "เคล(ือ|ื)อบร้อน.*ด้าน|ฟิล์มเคร?ือบร้อนด้าน"],
    ["LAM-HOT-GLOSS", "ฟิล์มเคลือบร้อน เงา", "เคล(ือ|ื)อบร้อน.*เงา|ฟิล์มเคร?ือบร้อนเงา"],
    ["LAM-HOT-RAIN", "ฟิล์มเคลือบร้อน รุ้ง", "เคล(ือ|ื)อบร้อน.*รุ้ง|ฟิล์มเคร?ือบร้อนรุ้ง"],
    ["LAM-RAIN", "ฟิล์มเคลือบ รุ้ง", "เคลือบรุ้ง|ตัวเคลือบรุ้ง"],
    ["LAM-MATTE", "ฟิล์มเคลือบ ด้าน", "เคลือบด้าน|ตัวเคลือบด้าน"],
    ["LAM-COLD", "ฟิล์มเคลือบเย็น", "เคลือบเย็น"],
  ]),

  listFam("glass", "แก้ว", "ใบ", "สินค้าสำเร็จ", [
    ["GLS-MUG-GLOSS", "แก้วมัค ขาวเงา", "^แก้วมัค.*เงา"],
    ["GLS-WHT-MATTE", "แก้ว ขาวขุ่น", "^แก้ว.*(ขาวขุ่น|ขุ่น)"],
    ["GLS-WHT-GLOSS", "แก้ว ขาวเงา", "^แก้ว.*ขาวเงา"],
    ["GLS-CLR", "แก้ว ใส", "^แก้วใส"],
    ["GLS-16OZ", "แก้ว 16 ออนซ์", "^แก้ว ?16"],
    ["GLS-20OZ", "แก้ว 20 ออนซ์", "^แก้ว ?20"],
  ]),

  // ⚠️ ต้องมาก่อน "ผ้า" — กระเป๋าผ้าดิบคือสินค้าสำเร็จ ไม่ใช่ผ้าดิบเป็นม้วน
  {
    id: "totebag",
    label: "กระเป๋าผ้าดิบ",
    unit: "ใบ",
    category: "สินค้าสำเร็จ",
    skus: ["27*22*8", "35*40", "35*40*10", "40*30*10", "45*35*15", "46*37*12"].map((sz) => ({
      key: sz,
      code: `TOTE-${sz.replace(/\*/g, "")}`,
      name: `กระเป๋าผ้าดิบ ${sz}`,
    })),
    match: (s) => {
      const c = norm(s);
      if (!rx("กระเป๋า").test(c) || !rx("ผ้าดิบ").test(c)) return null;
      const m = c.match(/(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)(?:\*(\d+(?:\.\d+)?))?/);
      return m ? `${m[1]}*${m[2]}${m[3] ? `*${m[3]}` : ""}` : null;
    },
  },

  listFam("fabric", "ผ้า", "ม้วน", "ผ้า", [
    ["FAB-CANVAS8", "ผ้าแคนวาส 8 ออนซ์", "แคนวาส ?8"],
    ["FAB-CANVAS14", "ผ้าแคนวาส 14 ออนซ์", "แคนวาส ?14"],
    ["FAB-NANO", "ผ้าขนสั้นนาโน", "ขนสั้นนาโน"],
    ["FAB-DOUBLENANO", "ผ้า Double Nano", "double ?nano"],
    ["FAB-HAMIT", "ผ้าฮามิต", "ฮา(มิ|ร์มิ)ต"],
    ["FAB-MICROPEACH", "ผ้าไมโครพีช", "ไมโครพีช"],
    ["FAB-UMBRELLA", "ผ้าร่ม UV", "^ผ้าร่ม"],
    ["FAB-SATIN", "ผ้าดัชเชสซาติน", "ดัชเชส"],
    // ยึดหัวบรรทัด — ไม่งั้น "กระเป๋า ผ้าดิบ 35*40*10" ขนาดที่ยังไม่ประกาศจะร่วงมาเข้าตรงนี้
    ["FAB-RAW", "ผ้าดิบ", "^ผ้าดิบ"],
    ["FAB-NUEP", "ผ้าหนึบ", "^ผ้าหนึบ"],
  ]),

  sizeFam("blanket", "ผ้าห่ม", "ผืน", "ผ้า", "^ผ้าห่ม", "BLK",
    ["76*100", "100*150", "150*200"], (sz) => `ผ้าห่ม ${sz}`),

  {
    id: "puzzle",
    label: "จิ๊กซอว์",
    unit: "ชิ้น",
    category: "สินค้าสำเร็จ",
    skus: [
      { key: "9*7.5", code: "PZL-975", name: "Puzzle 9x7.5" },
      { key: "13.5*11.5", code: "PZL-135115", name: "Puzzle 13.5x11.5" },
      { key: "15*20", code: "PZL-1520", name: "กรอบรูป Jigsaw 15x20" },
      { key: "a5", code: "PZL-A5", name: "แผ่นจิ๊กซอว์ A5" },
    ],
    match: (s) => {
      const c = norm(s);
      if (!rx("puzzle|jigsaw|จิ๊กซอ").test(c)) return null;
      if (rx("a5").test(c)) return "a5";
      return canonSize(c);
    },
  },

  listFam("holder", "การ์ดโฮลเดอร์", "ชิ้น", "สินค้าสำเร็จ", [
    // ชื่อนี้สะกดกันคนละแบบหมด: กาด/การ์ด/การด · โฮลเดอ/โฮลเดอร์
    ["HLD-MS", "MagSafe การ์ดโฮลเดอร์", "แม็?กเซฟ.*(กาด|การ์?ด)?โฮลเดอ"],
    ["HLD-PVC-WHT", "การ์ดโฮลเดอร์ PVC ขาว", "(กาด|การ์?ด)pvc ?ขาว"],
    ["HLD-WHT", "การ์ดโฮลเดอร์ ขาว", "(กาด|การ์?ด)?โฮลเดอ.*ขาว"],
    ["HLD-CLR", "การ์ดโฮลเดอร์ ใส", "(กาด|การ์?ด)?โฮลเดอ.*ใส"],
    ["HLD-FRAME", "เฟรมการ์ด", "^(เฟรม(กาด|การ์?ด)|frame ?card)"],
  ]),

  listFam("magsafe", "MagSafe อุปกรณ์", "ชิ้น", "อุปกรณ์เสริม", [
    ["MSF-WALLET-STAND", "MagSafe Wallet ขาตั้ง", "แม็?กเซฟ ?(วอลเลท|วอเลท|wallet).*ขาตั้ง"],
    ["MSF-WALLET", "MagSafe Wallet", "แม็?กเซฟ ?(วอลเลท|วอเลท)|magsafe ?wallet"],
    ["MSF-STAND", "MagSafe ขาตั้ง", "แม็?กเซฟ ?ขาตั้ง"],
  ]),

  sizeFam("mousepad", "แผ่นรองเมาส์", "ชิ้น", "สินค้าสำเร็จ", "^แผ่นรองเมาส์", "MPD",
    ["18*21", "25*30", "30*80", "40*90"], (sz) => `แผ่นรองเมาส์ ${sz}`),

  listFam("stone", "แผ่นหินหอม", "ชิ้น", "สินค้าสำเร็จ", [
    ["STN-RND-SCENT", "แผ่นหินน้ำหอม ทรงกลม", "หิน.*(น้ำหอม|หอม).*กลม|หิน.*กลม.*หอม"],
    ["STN-FLR-SCENT", "แผ่นหินน้ำหอม ทรงดอกไม้", "หิน.*(น้ำหอม|หอม).*ดอกไม้|หินหอมทรงดอกไม้"],
    ["STN-RND-COASTER", "แผ่นหินรองแก้ว ทรงกลม", "หินรอง.*กลม"],
    ["STN-RND", "แผ่นหิน ทรงกลม", "^แผ่นหินทรงกลม"],
  ]),

  listFam("misc", "ของใช้ทั่วไป", "ชิ้น", "ของใช้ทั่วไป", [
    ["MSC-SPONGE-4M", "ฟองน้ำซับใน ขาว 4 มิล", "ฟองน้ำ.*4 ?มิล"],
    ["MSC-SPONGE", "ฟองน้ำ", "^ฟองน้ำ"],
    ["MSC-BUBBLE", "บับเบิ้ล", "^(บับเบิ้?ล|bubble)"],
    ["MSC-TAPE-CLR", "เทปใส", "^เทปใส"],
    ["MSC-TAPE-2S", "เทปกาวสองหน้า", "เทป?กาวสองหน้า|กาวสองหน้า"],
    ["MSC-TAPE-YEL", "เทปเหลืองแปะสาย", "เทปเหลือง"],
    ["MSC-GLUE-FAST", "กาวร้อน", "^กาวร้อน"],
    ["MSC-DTF-POWDER", "ผงกาว DTF", "ผงกาว"],
    ["MSC-DTF-FILM", "ฟิล์มปริ้น DTF", "ฟิล์มปริ้?น ?dtf"],
    ["MSC-INK", "หมึก", "^หมึก$"],
    ["MSC-PASSPORT", "ปกพาสปอร์ต", "^(passport|พาสปอ)"],
    ["MSC-PHONESTAND-3", "Phone Stand 3 Step", "phone ?stand ?3"],
    ["MSC-PHONESTAND-360", "Phone Stand 360 องศา", "phone ?stand ?360"],
    ["MSC-CAL-DESK", "ปฏิทินตั้งโต๊ะ แนวนอน", "ป(ฏิ|ฐิ)ทินตั้งโต๊ะ"],
    ["MSC-CAL-LAND", "ปฏิทิน แนวนอน", "ป(ฏิ|ฐิ)ทิน.*แนวนอน"],
    ["MSC-FILE-S", "แฟ้มจิ๋ว เล็ก 4x4.5x2", "\\(เล็ก\\)?แฟ้มจิ๋ว"],
    ["MSC-FILE-L", "แฟ้มจิ๋ว ใหญ่ 4.8x6.2x2", "\\(ใหญ่\\)?แฟ้มจิ๋ว"],
    ["MSC-CLOCK", "นาฬิกาดิจิตอล", "นาฬิกาดิจิตอล"],
    ["MSC-COASTER-SIL", "แผ่นรองแก้วซิลิโคน", "แผ่นรองแ?ก้วซิลิโคน"],
  ]),
];

// ───────────────────────── รัน ─────────────────────────
const env = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const app = initializeApp({
  credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))),
});
const fx = getFirestore(app, "tp-fixflow");
const rc = getFirestore(app, "tpdigitalreciept");

const [orders, receipts] = await Promise.all([
  rc.collection("order").get(),
  fx.collection("goods_receipts").get(),
]);
const rawLines = [
  ...orders.docs.map((d) => d.data().rawText),
  ...receipts.docs.map((d) => d.data().itemName),
]
  .map((r) => coreName(r))
  .filter((s) => s.length > 1);

// กาง SKU ทั้งหมด + ผูก alias จากชื่อดิบ
const catalog = new Map(); // code -> { code, name, unit, category, family, aliases:Set, hits }
for (const fam of FAMILIES) {
  for (const s of fam.skus) {
    catalog.set(s.code, {
      ...s,
      unit: fam.unit,
      category: fam.category,
      family: fam.label,
      aliases: new Set(),
      hits: 0,
    });
  }
}
const byFamKey = new Map(FAMILIES.map((f) => [f.id, new Map(f.skus.map((s) => [s.key, s.code]))]));

const unmatched = new Map();
for (const line of rawLines) {
  let hit = null;
  for (const fam of FAMILIES) {
    const key = fam.match(line);
    if (!key) continue;
    const code = byFamKey.get(fam.id).get(key);
    if (code) { hit = code; break; }
  }
  if (hit) {
    const it = catalog.get(hit);
    it.hits++;
    if (norm(line) !== norm(it.name)) it.aliases.add(line);
  } else {
    unmatched.set(line, (unmatched.get(line) || 0) + 1);
  }
}

// ───────────────────────── รายงาน ─────────────────────────
const used = [...catalog.values()].filter((i) => i.hits > 0);
const unused = [...catalog.values()].filter((i) => i.hits === 0);
const matchedLines = used.reduce((s, i) => s + i.hits, 0);

console.log(`\n📊 บรรทัดดิบ ${rawLines.length} · จับเข้า SKU ได้ ${matchedLines} (${Math.round((matchedLines / rawLines.length) * 100)}%)`);
console.log(`📦 SKU ที่กางได้ ${catalog.size} ตัว — มีของสั่งจริง ${used.length} · ยังไม่เคยสั่ง ${unused.length}\n`);

for (const fam of FAMILIES) {
  const items = [...catalog.values()].filter((i) => i.family === fam.label && i.hits > 0);
  if (!items.length) continue;
  console.log(`━━ ${fam.label} (${items.length} SKU ที่ใช้จริง) ━━`);
  for (const it of items.sort((a, b) => b.hits - a.hits).slice(0, 6)) {
    const al = [...it.aliases].slice(0, 3).join(" / ");
    console.log(`  ${it.code.padEnd(16)} ${it.name.padEnd(34)} ${String(it.hits).padStart(2)}× ${al ? `alias: ${al}` : ""}`);
  }
  if (items.length > 6) console.log(`  … อีก ${items.length - 6} ตัว`);
  console.log();
}

// ───────────────────────── สร้าง SKU อัตโนมัติจากชื่อที่ยังไม่รู้จัก ─────────────────────────
/**
 * กติกา: สร้างใหม่ได้เอง แต่ "ยุบรวมกับของเดิม" ต้องให้คนกด
 * เพราะสร้างเกิน = มี SKU ซ้ำ (ยุบทีหลังได้) แต่ยุบผิด = ของสองอย่างใช้ยอดเดียวกันแบบเงียบ ๆ
 */
const NOTE_WORDS =
  /ลูกค้า|โอน|เร่ง|รอส่ง|งานใช้|งานเข้า|ไม่มี|ไม่พอ|ด่วน|ครับ|ค่ะ|จอง|สต๊อกเพิ่ม|พึ่งเปิด|เปิดม้วน|เหลืออยู่|สั่ง\d/;

/** ความคล้ายแบบ Dice บน bigram — ใช้เตือน "อาจซ้ำ" ไม่ใช่ใช้ยุบ */
const bigrams = (s) => {
  const g = new Set();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
};
const dice = (a, b) => {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return (2 * n) / (A.size + B.size);
};

function buildAutoSkus(unmatchedMap) {
  // ยุบชื่อดิบที่ต่างกันแค่เว้นวรรค/วรรณยุกต์เข้าด้วยกันก่อน
  const groups = new Map(); // normKey -> { best, count, variants:Set }
  for (const [name, count] of unmatchedMap) {
    const k = norm(name);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, { best: name, count: 0, variants: new Set() });
    const g = groups.get(k);
    g.count += count;
    g.variants.add(name);
    if (name.length < g.best.length) g.best = name; // ชื่อสั้นสุด = สะอาดสุด
  }

  const existing = [...catalog.values()].map((i) => ({ code: i.code, name: i.name, key: norm(i.name) }));
  const made = [];
  let seq = 0;
  for (const [key, g] of [...groups.entries()].sort((a, b) => b[1].count - a[1].count)) {
    // ─ ด่านกรอง: อะไรที่ "ไม่ใช่ชื่อของ" ห้ามกลายเป็น SKU ─
    if (g.count < 2) continue;                       // เจอครั้งเดียว = ยังไม่ใช่ของประจำ รอเจอซ้ำก่อน
    if (g.best.length > 40) continue;                // ยาวขนาดนี้คือประโยค ไม่ใช่ชื่อ
    if (NOTE_WORDS.test(g.best)) continue;           // มีคำโน้ตปน
    if (!/[ก-๙a-z]/i.test(g.best)) continue;         // ต้องมีตัวอักษร ไม่ใช่ตัวเลขล้วน

    // ─ เตือนว่าอาจซ้ำกับของเดิม แต่ "ไม่ยุบให้" ─
    let near = null;
    for (const e of existing) {
      const sc = dice(key, e.key);
      if (sc > 0.62 && (!near || sc > near.score)) near = { code: e.code, name: e.name, score: sc };
    }

    made.push({
      code: `AUTO-${String(++seq).padStart(3, "0")}`,
      name: g.best,
      unit: "ชิ้น",
      category: "รอจัดหมวด",
      family: "สร้างอัตโนมัติ",
      aliases: new Set([...g.variants].filter((v) => norm(v) !== norm(g.best))),
      hits: g.count,
      autoCreated: true,
      maybeDuplicateOf: near,
    });
  }
  return made;
}

const autoSkus = AUTO ? buildAutoSkus(unmatched) : [];
for (const a of autoSkus) catalog.set(a.code, a);

/**
 * alias ที่ควรให้คนตรวจก่อนเชื่อ — จับจาก "ตัวเลขไม่ตรงกับชื่อ SKU"
 * เพราะเคสพังที่เจอจริงล้วนเป็นแบบนี้: Moorim 400g เข้า SKU 300g, ถุงซิป 40x50 เข้าสติกเกอร์
 */
const digitsOf = (s) => new Set((s.match(/\d+(?:\.\d+)?/g) || []));
const suspicious = [];
for (const it of catalog.values()) {
  if (it.autoCreated) continue;   // ตัวที่สร้างเอง ชื่อ = ชื่อดิบอยู่แล้ว ไม่ต้องเทียบ
  const nameDigits = digitsOf(it.name);
  for (const a of it.aliases) {
    const extra = [...digitsOf(a)].filter((d) => !nameDigits.has(d) && Number(d) > 2);
    if (extra.length) suspicious.push({ code: it.code, name: it.name, alias: a, extra });
  }
}
if (suspicious.length) {
  console.log(`━━ ⚠️ alias ที่ควรตรวจด้วยตา ${suspicious.length} รายการ (ตัวเลขไม่ตรงกับชื่อ SKU) ━━`);
  for (const s of suspicious.slice(0, 12)) {
    console.log(`  ${s.code.padEnd(16)} ← ${s.alias.slice(0, 90)}`);
  }
  if (suspicious.length > 12) console.log(`  … อีก ${suspicious.length - 12} รายการ`);
  console.log();
}

if (AUTO) {
  const autoLines = autoSkus.reduce((s, a) => s + a.hits, 0);
  const dupes = autoSkus.filter((a) => a.maybeDuplicateOf);
  console.log(`━━ 🤖 สร้างเอง ${autoSkus.length} SKU (ครอบคลุมอีก ${autoLines} บรรทัด) ━━`);
  for (const a of autoSkus.slice(0, 15)) {
    const al = [...a.aliases].slice(0, 2).join(" / ");
    console.log(`  ${a.code}  ${a.name.padEnd(34)} ${String(a.hits).padStart(2)}× ${al ? `alias: ${al}` : ""}`);
  }
  if (autoSkus.length > 15) console.log(`  … อีก ${autoSkus.length - 15} ตัว`);
  if (dupes.length) {
    console.log(`\n  ⚠️ ${dupes.length} ตัวคล้ายของเดิม — ระบบ "ไม่ยุบให้" ต้องคนกดเอง:`);
    for (const d of dupes.slice(0, 8)) {
      console.log(`     ${d.name.slice(0, 30).padEnd(30)} ≈ ${d.maybeDuplicateOf.name} (${Math.round(d.maybeDuplicateOf.score * 100)}%)`);
    }
  }
  console.log();
  for (const a of autoSkus) for (const v of [a.name, ...a.aliases]) unmatched.delete(v);
}

const tail = [...unmatched.entries()].sort((a, b) => b[1] - a[1]);
const tailN = Number((process.argv.find((a) => a.startsWith("--tail=")) || "").split("=")[1]) || 15;
console.log(`━━ ยังไม่รู้จัก ${tail.length} ชื่อ (${rawLines.length - matchedLines} บรรทัด) — ${tailN} อันดับแรก ━━`);
for (const [n, c] of tail.slice(0, tailN)) console.log(`  ${String(c).padStart(2)}× ${n.slice(0, 66)}`);

// ───────────────────────── เขียนจริง ─────────────────────────
if (!WRITE) {
  console.log(`\n💡 ยังไม่เขียนอะไรลงฐานข้อมูล — ใส่ --write ถ้าจะเขียนจริง`);
  process.exit(0);
}

const now = new Date().toISOString();
const WRITE_ALL = process.argv.includes("--all");
let n = 0;
// ปกติเขียนเฉพาะ SKU ที่เคยสั่งจริง — ไม่งั้นหน้า /admin/stock รกด้วยตัวที่ไม่เคยใช้
for (const it of catalog.values()) {
  if (!WRITE_ALL && it.hits === 0) continue;
  const ref = fx.collection("stockItems").doc(it.code.toLowerCase());
  const snap = await ref.get();
  if (snap.exists) {
    // มีอยู่แล้ว → เติม alias อย่างเดียว ไม่แตะยอด/ชื่อที่คนแก้ไว้
    if (it.aliases.size) {
      await ref.update({ aliases: FieldValue.arrayUnion(...it.aliases), updatedAt: now });
      n++;
    }
    continue;
  }
  await ref.set({
    id: it.code.toLowerCase(),
    code: it.code,
    name: it.name,
    unit: it.unit,
    category: it.category,
    family: it.family,
    aliases: [...it.aliases],
    balance: 0,              // ตั้งใจให้เป็น 0 — ต้องเดินนับจริง
    productIds: [],
    active: true,
    // ตัวที่ระบบสร้างเอง ต้องมีธงให้หน้าแอดมินกรองมาตรวจได้ — ห้ามปนกับตัวที่คนตั้งเอง
    ...(it.autoCreated
      ? {
          autoCreated: true,
          needsReview: true,
          ...(it.maybeDuplicateOf ? { maybeDuplicateOf: it.maybeDuplicateOf.code } : {}),
        }
      : {}),
    createdAt: now,
    updatedAt: now,
  });
  n++;
}
console.log(`\n✅ เขียน stockItems แล้ว ${n} รายการ (ยอดคงเหลือ 0 ทั้งหมด — ต้องเดินนับจริง)`);
process.exit(0);
