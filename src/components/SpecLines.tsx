import type { ReactNode } from "react";

/**
 * รายละเอียดตัวเลือกของรายการ — "บรรทัดละหัวข้อ · หัวข้อหนาและเข้มกว่าค่าที่เลือก"
 * ใช้ร่วมกันทุกที่ที่โชว์ตัวเลือก (ตะกร้า/ออเดอร์ลูกค้า/ใบเสร็จ/ใบเสนอราคา/หลังบ้าน/ใบงาน)
 * เพื่อให้หน้าตาเหมือนกันทั้งระบบ ไม่ต้องแก้ทีละหน้าเวลาปรับสไตล์
 *
 * ขนาด/สีของ "ค่า" มาจาก className ของที่เรียกใช้ (แต่ละหน้าคุมเอง) — คอมโพเนนต์คุมแค่หัวข้อกับการขึ้นบรรทัด
 */

/** หัวข้อที่ไม่ต้องโชว์ (มีที่แสดงของตัวเองอยู่แล้ว หรือเป็นข้อมูลของทีมผลิต) */
export const SPEC_HIDE = ["ภาพลายที่แนบ", "รอเช็คสต๊อก", "ตำแหน่งลาย (ทีมผลิต)"];

/**
 * ออเดอร์เก่า/ใบเสนอราคาเก็บตัวเลือกเป็นข้อความรวมคั่นด้วย " · " — กางกลับเป็นคู่ หัวข้อ/ค่า
 * ค่าบางตัวมี " · " อยู่ข้างใน (เช่น "เรทราคา: พรีเมี่ยม · สกรีน 2 ด้าน") → ท่อนที่ไม่มีหัวข้อ
 * ให้ต่อท้ายค่าของหัวข้อก่อนหน้า ไม่ตัดเป็นบรรทัดใหม่
 */
export function parseSpecText(text: string): [string, string][] {
  const out: [string, string][] = [];
  // ขึ้นบรรทัดใหม่ = คนละหัวข้อเสมอ (ข้อความที่แอดมินพิมพ์เองในใบเสนอราคา/ออเดอร์เก่า)
  for (const line of text.split(/\n+/)) {
    const segs = line
      .split(/\s·\s/)
      .map((s) => s.trim())
      .filter(Boolean);
    let head = -1; // ตำแหน่งหัวข้อล่าสุดของบรรทัดนี้ — ท่อนที่ไม่มีหัวข้อไปต่อท้ายตัวนี้
    for (const seg of segs) {
      const m = seg.match(/^([^:]{1,60}?):\s*(.+)$/);
      // กัน "https://..." ถูกอ่านว่าเป็นหัวข้อ (มี : เหมือนกัน)
      const isLabel = m && !/^\s*https?$/i.test(m[1]);
      if (isLabel && m) {
        out.push([m[1].trim(), m[2].trim()]);
        head = out.length - 1;
      } else if (head >= 0) {
        out[head][1] += ` · ${seg}`;
      } else {
        out.push(["", seg]);
      }
    }
  }
  return out;
}

/** ตัดค่าที่มีหลายลายให้เป็นบรรทัดละลาย */
export function specValueLines(v: string): string[] {
  return v
    .split(" | ")
    .flatMap((part) => part.split(/\s·\s(?=ลายที่\s)/))
    .map((x) => x.trim())
    .filter(Boolean);
}

/** ใช้ตัวเลือกแบบมีหัวข้อก่อน (ออเดอร์ใหม่) — ไม่มีค่อยกางจากข้อความรวม (ออเดอร์เก่า) */
export function specEntries(
  sel?: Record<string, string>,
  text?: string,
  hide: string[] = SPEC_HIDE,
): [string, string][] {
  const entries = Object.entries(sel ?? {}).filter(([k, v]) => v && !hide.includes(k));
  if (entries.length) return entries;
  if (!text?.trim()) return [];
  return parseSpecText(text).filter(([k]) => !hide.includes(k));
}

/* ──────────────────────────────────────────────────────────────
 * 📐 "เพิ่มขนาด" ที่ลูกค้ากดเพิ่มทีละเซน/นิ้ว — โชว์เป็นขนาดจริงที่ต้องผลิตในบรรทัด "ขนาด"
 * (15 ซม. + เซนละ ×2 → "17 ซม. (15 + เพิ่ม 2)") ไม่งั้นทีมผลิต/ลูกค้าต้องบวกเองทุกครั้ง
 * ⚠️ แสดงผลอย่างเดียว — ค่าที่เก็บในออเดอร์ยังเป็นชื่อตัวเลือกจริง เพราะตารางราคา/แผงตีราคา
 * เทียบชื่อตัวเลือกตรง ๆ (ดู QuotePanel → activeRate/cellPrice) แก้ค่าเมื่อไหร่ราคาหาย
 * ────────────────────────────────────────────────────────────── */

/** หน่วยความยาวที่เทียบกันได้ (เซน = ซม. = cm) — null = ไม่ใช่หน่วยความยาว */
function lengthUnit(text: string): "cm" | "inch" | "mm" | null {
  // หน่วยอังกฤษติดตัวเลขได้ ("35x35cm") จึงกันแค่ "ตัวอักษรขนาบข้าง" ไม่ใช่ \b (35cm จะไม่เข้า \bcm\b)
  if (/นิ้ว|inch|(?<![a-z])in(?![a-z])/i.test(text)) return "inch"; // เช็คนิ้วก่อน — "นิ้วละ 15 บาท (2.54 cm)" มีทั้งสองหน่วย
  if (/มม\.?|มิล|(?<![a-z])mm(?![a-z])/i.test(text)) return "mm";
  if (/ซม\.?|ซ\.ม\.|เซน|(?<![a-z])cm(?![a-z])/i.test(text)) return "cm";
  return null;
}

/** หน่วยความยาวที่รับรู้ (ใช้ประกอบ regex ด้านล่าง) */
const UNIT_RE = String.raw`ซม\.?|ซ\.ม\.|cm|มม\.?|mm|นิ้ว|inch(?:es)?|in`;
/** ค่าที่เป็น "ตัวเลข + หน่วย" ล้วน ๆ เท่านั้น ("15 ซม." / "4cm") — "55×33 ซม." หรือ "6 – 8 ซม." ไม่เข้าข่าย */
const SIZE_VALUE_RE = new RegExp(String.raw`^([\d.]+)(\s*)(${UNIT_RE})$`, "i");
/** ตัวเลือกที่ระบุจำนวน — "เซนละ ×2" (กติกาเดียวกับ formatMultiPick) */
const ADD_QTY_RE = /^(.+?)\s+×\s*(\d+(?:\.\d+)?)$/;
/** ค่าจากช่องกรอก — "2 นิ้ว" หรือ "2" เฉย ๆ (ดู formatInputValue) */
const ADD_INPUT_RE = new RegExp(String.raw`^([\d.]+)\s*(${UNIT_RE})?$`, "i");
/** ชื่อกลุ่ม/ชื่อตัวเลือกที่แปลว่า "บวกเพิ่มจากขนาดมาตรฐาน" */
const ADD_SIZE_RE = /เพิ่มขนาด|เพิ่มความยาว|เพิ่มความกว้าง|ขนาดมากกว่า/;
/** ชื่อตัวเลือกแบบคิดต่อหน่วย — "นิ้วละ 15 บาท" / "เซนละ" / "บวกเพิ่มเซนละ" */
const PER_UNIT_RE = /(?:นิ้ว|เซน|ซม|มม|inch|cm|mm)\.?\s*ละ/i;
/** ขนาดฐานที่เขียนไว้ในชื่อกลุ่ม/ชื่อตัวเลือกเอง — "ขนาดมากกว่า 8 ซม" · "เริ่มที่ 15 cm" · "จาก 6 ซม." */
const FROM = String.raw`(?:มากกว่า|เริ่มที่|เริ่มต้นที่|จาก)`;
const BASE_RE = new RegExp(String.raw`${FROM}\s*([\d.]+)\s*(${UNIT_RE})`, "i");
/** ฐานที่เป็นสองด้าน — "จาก 13×13 นิ้ว" (โตทั้งสองด้านพร้อมกัน) */
const BASE_2D_RE = new RegExp(String.raw`${FROM}\s*([\d.]+)\s*[×x]\s*([\d.]+)\s*(${UNIT_RE})`, "i");

/** ปัดทศนิยม 2 ตำแหน่ง (กัน 7.5 + 0.3 = 7.799999) */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * แปลงหน่วยความยาว (1 นิ้ว = 2.54 ซม. = 25.4 มม.) — เจ้าของร้านสั่งให้บวกข้ามหน่วยได้เลย (5 ก.ย. 69)
 * กราฟฟิกจะได้ไม่ต้องคำนวณเอง (เสี่ยงพลาด) · ที่มาของเลขโชว์ในวงเล็บเสมอให้ตรวจทานได้
 */
const LEN_MM: Record<"cm" | "inch" | "mm", number> = { mm: 1, cm: 10, inch: 25.4 };
const convertLen = (n: number, from: "cm" | "inch" | "mm", to: "cm" | "inch" | "mm") =>
  round2((n * LEN_MM[from]) / LEN_MM[to]);

/** บรรทัดขนาดสองด้าน "40x85 ซม." — ร้านเขียนตามแบบ กว้าง×ยาว/สูง (ตัวแรก = ด้านกว้างเสมอ) */
const DIM2_RE = new RegExp(String.raw`^([\d.]+)\s*([×x])\s*([\d.]+)(\s*)(${UNIT_RE})$`, "i");
/** ขนาดสองด้านที่ฝังอยู่ในค่า — "Size XL (65x65cm)" (ชื่อรุ่นพ่วงขนาดจริงมาในวงเล็บ) */
const DIM2_IN_RE = new RegExp(String.raw`([\d.]+)\s*[×x]\s*([\d.]+)\s*(${UNIT_RE})`, "i");

/**
 * ชื่อด้านที่กลุ่ม/ตัวเลือกบอกไว้ — "เพิ่มขนาด · ด้านยาวสุด (นิ้ว)" → "ด้านยาวสุด" (ไม่ระบุ = "")
 * ชื่อกลุ่มยาว ๆ ที่ไม่ได้ตั้งใจเป็นชื่อด้าน ("FLEX กว้างเกินขนาดที่กำหนด") ให้ถอยไปอ่านจากชื่อตัวเลือกแทน
 */
function sideOf(label: string, name: string): string {
  const short = label.replace(/เพิ่มขนาด|เพิ่มความ/g, "").replace(/\([^)]*\)/g, "").replace(/[·|+\-–]/g, " ").replace(/\s+/g, " ").trim();
  if (short && short.length <= 16 && /ด้าน|กว้าง|ยาว|สูง/.test(short)) return short;
  const t = `${label} ${name}`;
  if (/ความกว้าง|ด้านกว้าง/.test(t)) return "ด้านกว้าง";
  if (/ความยาว|ด้านยาว/.test(t)) return "ด้านยาว";
  if (/ความสูง|ด้านสูง/.test(t)) return "ด้านสูง";
  return "";
}

/** ด้านที่ตัวเลือกเพิ่มขนาดชี้ชัด ๆ — ใช้เลือกว่าบวกตัวเลขไหนของ "40x85" (null = ไม่บอกด้าน) */
function dimSide(a: SizeAdd): "กว้าง" | "ยาว" | "สูง" | null {
  const t = `${a.label} ${a.name}`;
  if (/ความกว้าง|ด้านกว้าง/.test(t)) return "กว้าง";
  if (/ความยาว|ด้านยาว/.test(t)) return "ยาว";
  if (/ความสูง|ด้านสูง/.test(t)) return "สูง";
  return null;
}

/** ตัวเลือก 1 บรรทัดที่แปลว่า "บวกขนาดเพิ่ม N หน่วย" */
type SizeAdd = { i: number; label: string; name: string; step: number; unit: "cm" | "inch" | "mm"; unitText: string };

/** อ่านบรรทัดตัวเลือกว่าเป็น "เพิ่มขนาด" กี่หน่วยไหม — ไม่ใช่ = null */
function readSizeAdd(label: string, value: string, i: number): SizeAdd | null {
  const v = value.trim();
  const qty = ADD_QTY_RE.exec(v);
  const input = qty ? null : ADD_INPUT_RE.exec(v); // ช่องกรอกเก็บเป็นตัวเลขล้วน ไม่มี "×N"
  // เพิ่มแค่ 1 หน่วยถูกเก็บเป็นชื่อเปล่า ไม่มี "×1" (ดู formatMultiPick) — รับเฉพาะกลุ่มเพิ่มขนาดเอง
  // และชื่อแบบ "หน่วยละ…" เท่านั้น กันไปโดนตัวเลือกที่แค่เอ่ยถึงหน่วย ("เพิ่ม 2 ซม. (ไม่เกิน 11 ซม.)")
  const bare = !qty && !input && ADD_SIZE_RE.test(label) && PER_UNIT_RE.test(v);
  const name = qty ? qty[1] : bare ? v : "";
  if (!qty && !input && !bare) return null;
  if (!ADD_SIZE_RE.test(label) && !ADD_SIZE_RE.test(name)) return null;
  const step = Number(qty ? qty[2] : bare ? 1 : input![1]);
  const unitText = (input?.[2] ?? "").trim();
  const unit = lengthUnit(name) ?? lengthUnit(unitText) ?? lengthUnit(label);
  if (!unit || !(step > 0)) return null;
  return { i, label, name, step, unit, unitText: unitText || (unit === "inch" ? "นิ้ว" : unit === "mm" ? "มม." : "ซม.") };
}

/**
 * บวก "เพิ่มขนาด" ให้เห็นเป็นขนาดจริง — ทำเฉพาะตอนที่ไม่กำกวมเท่านั้น (ไม่เข้าเงื่อนไข = ปล่อยไว้เหมือนเดิม)
 * หน่วยไม่ตรงกับฐานก็แปลงให้ (นิ้ว→ซม.) แล้วบวกเลย พร้อมโชว์ที่มาในวงเล็บ — เจ้าของร้านสั่ง (5 ก.ย. 69)
 * กราฟฟิกจะได้ไม่ต้องคำนวณเอง · บวกตามลำดับ:
 *   1) บรรทัดขนาดสองด้าน + ตัวเลือกบอกด้าน  "40x85 ซม." + กว้าง 5 นิ้ว → "52.7x85 ซม. (กว้างเดิม 40 + เพิ่ม 5 นิ้ว = 12.7 ซม.)"
 *   2) บรรทัดขนาดเป็นตัวเลขเดี่ยว          "ขนาด: 15 ซม."           → "17 ซม. (15 + เพิ่ม 2)"
 *   3) บรรทัดขนาดระบุด้าน + กลุ่มบอกด้าน    "กว้าง 2.5 cm ยาว 10cm"  → บวกเฉพาะด้านยาว
 *   4) ฐานเขียนในชื่อกลุ่มเอง               "ขนาดมากกว่า 8 ซม"       → แทรกบรรทัด "ขนาด: 10 ซม. (8 + เพิ่ม 2)"
 *      (ฐานสองด้าน "จาก 13×13 นิ้ว" → "ขนาด: 15×15 นิ้ว (13×13 + เพิ่ม 2)" — โตทั้งสองด้าน ตามที่เจ้าของร้านยืนยัน 4 ก.ย. 69
 *       มีบรรทัดขนาดอยู่แล้วค่อยถอยไปต่อท้ายบรรทัดเพิ่มขนาดว่า "→ รวม …" กันหัวข้อ "ขนาด" ซ้ำ)
 *   5) บวกไม่ได้ (ไม่บอกด้าน/หาบรรทัดฐานไม่เจอ) → ต่อท้ายบรรทัดขนาดว่าเพิ่มไปกี่หน่วย
 * ที่เหลือปล่อยไว้ = ไม่รู้ฐานจริง ๆ (ช่วงขนาด "6 – 8 ซม." · ไม่มีขนาดฐานใน options · เพิ่มคนละชิ้นสองกลุ่ม)
 */
export function foldSizeExtra(entries: [string, string][]): [string, string][] {
  // กลุ่มติ๊กหลายอย่างเก็บค่ารวมคั่น " | " ("เพิ่มความกว้าง นิ้วละ ×2 | เพิ่มความยาว นิ้วละ ×3")
  // ต้องแตกอ่านทีละตัวเลือก — อ่านทั้งก้อน regex จะจับได้แค่ ×N ตัวท้ายแล้วบวกผิดด้าน (เจอกับผ้าเชียร์)
  const adds = entries.flatMap(
    ([k, v], i) => v.split(" | ").map((part) => readSizeAdd(k, part, i)).filter(Boolean) as SizeAdd[],
  );
  if (!adds.length) return entries;
  const put = (at: number, value: string) =>
    entries.map(([k, v], i) => (i === at ? ([k, value] as [string, string]) : ([k, v] as [string, string])));

  /** บรรทัดที่พูดถึง "ขนาด" และไม่ใช่บรรทัดเพิ่มขนาดเอง */
  const sizeLines = entries.flatMap(([k, v], i) =>
    // กลุ่ม "เพิ่มขนาด" ที่ไม่ได้กรอกตัวเลข (เช่น ติ๊กว่าต้องการเพิ่ม) ก็ไม่ใช่บรรทัดขนาดฐาน
    k.includes("ขนาด") && !ADD_SIZE_RE.test(k) && !adds.some((a) => a.i === i) ? [{ i, v: v.trim() }] : [],
  );

  // 1) ขนาดสองด้าน "40x85 ซม." + ทุกตัวเลือกบอกด้านชัดคนละด้าน → บวกเข้าด้านนั้นเลย (ตัวแรก = กว้าง)
  const dim2 = sizeLines.flatMap(({ i, v }) => {
    const s = DIM2_RE.exec(v);
    const u = s ? lengthUnit(s[5]) : null;
    return s && u ? [{ i, s, u }] : [];
  });
  const dimSides = adds.map((a) => dimSide(a));
  if (
    dim2.length === 1 &&
    dimSides.every(Boolean) &&
    new Set(dimSides.map((s) => (s === "กว้าง" ? 0 : 1))).size === dimSides.length
  ) {
    const { i, s, u } = dim2[0];
    const nums = [Number(s[1]), Number(s[3])];
    const notes: string[] = [];
    adds.forEach((a, k) => {
      const at = dimSides[k] === "กว้าง" ? 0 : 1;
      const step = convertLen(a.step, a.unit, u);
      notes.push(
        `${dimSides[k]}เดิม ${nums[at]} + เพิ่ม ${a.step}${a.unit === u ? "" : ` ${a.unitText} = ${step} ${s[5]}`}`,
      );
      nums[at] = round2(nums[at] + step);
    });
    return put(i, `${nums[0]}${s[2]}${nums[1]}${s[4]}${s[5]} (${notes.join(" · ")})`);
  }

  if (adds.length === 1) {
    const add = adds[0];

    // 2) ขนาดที่เป็นตัวเลขเดี่ยว → บวกตรง ๆ (หน่วยไม่ตรงก็แปลงก่อนบวก)
    const plain = sizeLines.flatMap(({ i, v }) => {
      const s = SIZE_VALUE_RE.exec(v);
      const u = s ? lengthUnit(s[3]) : null;
      return s && u ? [{ i, s, u }] : [];
    });
    if (plain.length === 1) {
      const { i, s, u } = plain[0];
      const base = Number(s[1]);
      const step = convertLen(add.step, add.unit, u);
      const math = add.unit === u ? `เพิ่ม ${add.step}` : `เพิ่ม ${add.step} ${add.unitText} = ${step} ${s[3]}`;
      return put(i, `${round2(base + step)}${s[2]}${s[3]} (${base} + ${math})`);
    }

    // 2.5) ขนาดสองด้านฝังอยู่ในค่า ("Size XL (65x65cm)") → ถอดออกมาบวกให้ แล้วโชว์ขนาดจริงต่อท้าย
    //      ฐานสองด้านเท่ากัน + ตัวเลือกไม่บอกด้าน = โตทั้งสองด้าน (แบบเดียวกับฐาน "จาก 13×13 นิ้ว"
    //      ที่เจ้าของร้านยืนยัน 4 ก.ย. 69) · ไม่เท่ากันต้องมีด้าน/"ยาวสุด" ชี้ ไม่งั้นปล่อยไปข้อ 5
    const embedded = sizeLines.flatMap(({ i, v }) => {
      const s = DIM2_IN_RE.exec(v);
      const u = s ? lengthUnit(s[3]) : null;
      return s && u ? [{ i, v, s, u }] : [];
    });
    if (embedded.length === 1) {
      const { i, v, s, u } = embedded[0];
      const dims = [Number(s[1]), Number(s[2])];
      const from = `${add.label} ${add.name}`;
      const at = /ยาวสุด/.test(from)
        ? (dims[1] > dims[0] ? 1 : 0)
        : dimSide(add) === "กว้าง" ? 0 : dimSide(add) ? 1 : -1;
      if (at >= 0 || dims[0] === dims[1]) {
        const step = convertLen(add.step, add.unit, u);
        const math = add.unit === u ? `เพิ่ม ${add.step}` : `เพิ่ม ${add.step} ${add.unitText} = ${step} ${s[3]}`;
        const total = dims.map((n, k) => (at < 0 || k === at ? round2(n + step) : n));
        const note = at >= 0
          ? `${sideOf(add.label, add.name) || "ด้านที่เพิ่ม"}เดิม ${dims[at]} + ${math}`
          : `${dims[0]}×${dims[1]} + ${math}`;
        // ตัดก้อนขนาดเดิม (รวมวงเล็บที่ครอบพอดี) ออก เหลือชื่อรุ่นนำหน้าขนาดจริง
        let a = s.index, b = s.index + s[0].length;
        if (v[a - 1] === "(" && v[b] === ")") { a--; b++; }
        const prefix = `${v.slice(0, a)}${v.slice(b)}`.replace(/\s+/g, " ").trim();
        const sized = `${total[0]}×${total[1]} ${s[3]} (${note})`;
        return put(i, prefix ? `${prefix} → ${sized}` : sized);
      }
    }

    // 3) ขนาดที่ระบุด้านไว้ + กลุ่มบอกว่าเพิ่มด้านไหน → บวกเฉพาะด้านนั้น
    const side = dimSide(add);
    if (side) {
      const sideRe = new RegExp(String.raw`(${side}\s*)([\d.]+)(\s*)(${UNIT_RE})`, "i");
      const sided = sizeLines.flatMap(({ i, v }) => {
        const s = sideRe.exec(v);
        const u = s ? lengthUnit(s[4]) : null;
        return s && u ? [{ i, v, s, u }] : [];
      });
      if (sided.length === 1) {
        const { i, v, s, u } = sided[0];
        const base = Number(s[2]);
        const step = convertLen(add.step, add.unit, u);
        const math = add.unit === u ? `เพิ่ม ${add.step}` : `เพิ่ม ${add.step} ${add.unitText} = ${step} ${s[4]}`;
        return put(i, `${v.replace(sideRe, `$1${round2(base + step)}$3$4`)} (${side}เดิม ${base} + ${math})`);
      }
    }

    // 4) ฐานเขียนอยู่ในชื่อกลุ่ม/ชื่อตัวเลือกเอง → แทรกบรรทัด "ขนาด" แยกให้เห็นขนาดจริง
    //    บรรทัดขนาดที่ค่าเป็นการ์ด "เพิ่มขนาด" เอง (WALL TIDY เลือก "📐 เพิ่มขนาด (นิ้วละ ฿30)")
    //    = ไม่มีตัวเลขให้ลูกค้าเห็นเลย → เขียนขนาดจริงทับบรรทัดนั้นแทน
    //    มีบรรทัดขนาดตัวเลขอยู่แล้วค่อยถอยไปต่อท้ายบรรทัดเพิ่มขนาดแบบเดิม กันหัวข้อ "ขนาด" ซ้ำ
    const cardLine = sizeLines.find(({ v }) => ADD_SIZE_RE.test(v));
    // แบบต่อท้ายต้องคงวงเล็บที่มาของเลขไว้ — "จาก 6 ซม. ×2 → รวม 8 ซม." เฉย ๆ อ่านแล้วชวนงงว่า 6×2 ทำไมได้ 8
    // (×2 คือจำนวนหน่วยที่เพิ่ม ไม่ใช่คูณ) ใส่ "(6 + เพิ่ม 2)" ให้ตรวจทานได้ — เจ้าของร้านทัก 5 ก.ย. 69
    const placeSize = (value: string) =>
      cardLine
        ? put(cardLine.i, value)
        : sizeLines.length
          ? put(add.i, `${entries[add.i][1]} → รวม ${value}`)
          : [...entries.slice(0, add.i), ["ขนาด", value] as [string, string], ...entries.slice(add.i)];
    const from = `${add.name} ${add.label}`;
    const b2 = BASE_2D_RE.exec(from);
    const u2 = b2 ? lengthUnit(b2[3]) : null;
    if (b2 && u2) {
      const step = convertLen(add.step, add.unit, u2);
      const dims = [Number(b2[1]), Number(b2[2])];
      const math = add.unit === u2 ? `เพิ่ม ${add.step}` : `เพิ่ม ${add.step} ${add.unitText} = ${step} ${b2[3]}`;
      // กลุ่มบอกด้าน ("ด้านยาวสุด" = ตัวเลขที่มากกว่า · กว้าง = ตัวแรก · ยาว/สูง = ตัวหลัง) → โตด้านเดียว
      const at = /ยาวสุด/.test(from)
        ? (dims[1] > dims[0] ? 1 : 0)
        : dimSide(add) === "กว้าง" ? 0 : dimSide(add) ? 1 : -1;
      if (at >= 0) {
        const side = sideOf(add.label, add.name) || "ด้านที่เพิ่ม";
        const total = dims.map((n, i) => (i === at ? round2(n + step) : n));
        return placeSize(`${total[0]}×${total[1]} ${b2[3]} (${side}เดิม ${dims[at]} + ${math})`);
      }
      return placeSize(`${round2(dims[0] + step)}×${round2(dims[1] + step)} ${b2[3]} (${b2[1]}×${b2[2]} + ${math})`);
    }
    const b1 = BASE_RE.exec(from);
    const u1 = b1 ? lengthUnit(b1[2]) : null;
    if (b1 && u1) {
      const step = convertLen(add.step, add.unit, u1);
      const math = add.unit === u1 ? `เพิ่ม ${add.step}` : `เพิ่ม ${add.step} ${add.unitText} = ${step} ${b1[2]}`;
      return placeSize(`${round2(Number(b1[1]) + step)} ${b1[2]} (${b1[1]} + ${math})`);
    }
  }

  // 4.5) หลายตัวเลือกในกลุ่มเดียวกันที่มีฐานในชื่อกลุ่ม — คนละชิ้นแต่ฐานเดียวกัน
  //      ("เริ่มที่ 15 cm เพิ่มขนาด": แผ่นหน้า ×2 + แผ่นประกบ ×3) → แทรกบรรทัดขนาดรายชิ้น
  if (adds.length > 1 && adds.every((a) => a.i === adds[0].i)) {
    const b1 = BASE_RE.exec(adds[0].label);
    const u1 = b1 && !BASE_2D_RE.test(adds[0].label) ? lengthUnit(b1[2]) : null;
    if (b1 && u1) {
      const parts = adds.map((a) => {
        const step = convertLen(a.step, a.unit, u1);
        const math = a.unit === u1 ? `เพิ่ม ${a.step}` : `เพิ่ม ${a.step} ${a.unitText} = ${step} ${b1[2]}`;
        const piece = a.name.replace(new RegExp(String.raw`${PER_UNIT_RE.source}.*$`, "i"), "").trim();
        return `${piece ? `${piece} ` : ""}${round2(Number(b1[1]) + step)} ${b1[2]} (${b1[1]} + ${math})`;
      });
      const at = adds[0].i;
      return sizeLines.length
        ? put(at, `${entries[at][1]} → รวม ${parts.join(" · ")}`)
        : [...entries.slice(0, at), ["ขนาด", parts.join(" · ")] as [string, string], ...entries.slice(at)];
    }
  }

  // 5) หน่วยคนละอย่างแต่บวกให้ไม่ได้ (เช่น "40x85" ที่ตัวเลือกไม่บอกด้าน) → อย่างน้อยต่อท้ายว่าเพิ่มไปกี่หน่วย
  //    (หน่วยเดียวกันที่บวกไม่ได้ = เคสที่เจ้าของร้านสั่งปล่อยไว้ เช่น ขนาดเป็นช่วง "6 – 8 ซม." — ไม่แตะ)
  if (sizeLines.length === 1 && adds.every((a) => lengthUnit(sizeLines[0].v) !== null && lengthUnit(sizeLines[0].v) !== a.unit)) {
    const notes = adds
      .map((a) => {
        const side = sideOf(a.label, a.name);
        return `+ เพิ่ม ${a.step} ${a.unitText}${side ? ` (${side})` : ""}`;
      })
      .join(" ");
    return put(sizeLines[0].i, `${sizeLines[0].v} ${notes}`);
  }
  return entries;
}

const stripUrls = (v: string) =>
  v.replace(/https?:\/\/\S+/g, "").replace(/\s·\s·\s/g, " · ").replace(/[·\s]+$/, "").trim();

export function SpecLines({
  sel,
  text,
  className = "",
  labelClassName = "text-stone-700",
  hide,
  stripLinks = false,
  extras,
  after,
}: {
  sel?: Record<string, string>;
  text?: string;
  /** สไตล์ของ "ค่า" ทั้งบล็อก (ขนาด/สี) — กำหนดจากหน้าที่เรียกใช้ */
  className?: string;
  /** สีหัวข้อ (ตัวหนาให้อยู่แล้ว) — หลังบ้านใช้โทน slate หน้าร้านใช้ stone */
  labelClassName?: string;
  hide?: string[];
  /** ตัด URL ออกจากค่า (หน้าลูกค้า/ใบงานไม่ต้องเห็นลิงก์ยาว ๆ) */
  stripLinks?: boolean;
  /**
   * ค่าเพิ่มต่อชิ้นของแต่ละกลุ่ม (label → บาท) — บรรทัดที่มีบวกเงินจะโชว์ "+฿N/ชิ้น" ท้ายค่า
   * เช่น { "ตะขอ": 8 } → "ตะขอ: F ตะขอสปริง… +฿8/ชิ้น" (ติดลบ = ส่วนลด แสดง −฿N)
   * ⚠️ ใส่ได้เฉพาะเงินที่ "บวกเพิ่มจากราคาฐานจริง ๆ" — ส่วนต่างที่ฝังอยู่ในตารางเรทแล้วห้ามใส่ ลูกค้าจะบวกซ้ำ
   */
  extras?: Record<string, number>;
  /** บรรทัดเสริมท้ายรายละเอียด เช่น "🎨 แนบลายแล้ว N รูป" */
  after?: ReactNode;
}) {
  const entries = foldSizeExtra(
    specEntries(sel, text, hide)
      .map(([k, v]) => [k, stripLinks ? stripUrls(v) : v] as [string, string])
      .filter(([, v]) => v),
  );
  if (!entries.length && !after) return null;
  const feeTag = (k: string) => {
    const fee = extras?.[k];
    if (!fee) return null;
    return (
      <span className="ml-1 whitespace-nowrap font-semibold text-sky-600">
        {fee < 0 ? "−" : "+"}฿{Math.abs(fee).toLocaleString("th-TH")}
        <span className="font-normal opacity-70">/ชิ้น</span>
      </span>
    );
  };
  return (
    <div className={`space-y-0.5 ${className}`}>
      {entries.map(([k, v], i) => {
        const parts = specValueLines(v);
        return (
          <p key={`${k}-${i}`} className="break-words leading-snug">
            {k && <span className={`font-semibold ${labelClassName}`}>{k}:</span>}
            {k && " "}
            {parts.length > 1 ? (
              <span className="mt-0.5 block space-y-0.5">
                {parts.map((x, n) => (
                  <span key={n} className="block pl-3">
                    {x}
                    {n === parts.length - 1 && feeTag(k)}
                  </span>
                ))}
              </span>
            ) : (
              <>
                {parts[0] ?? v}
                {feeTag(k)}
              </>
            )}
          </p>
        );
      })}
      {after}
    </div>
  );
}
