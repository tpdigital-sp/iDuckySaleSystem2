/**
 * thai-eng-keyboard.ts
 * ตรวจจับและแก้คำที่พิมพ์ผิดภาษา (ไทย ↔ อังกฤษ) เนื่องจากลืมสลับภาษาแป้นพิมพ์
 *
 * รองรับผังแป้นพิมพ์ไทยมาตรฐาน "เกษมณี" (Kedmanee) บนแป้นพิมพ์ US QWERTY
 * ไม่มี dependency ใด ๆ ใช้ได้ทั้งฝั่ง server และ client
 *
 * ตัวอย่าง:
 *   convertEnToTh("l;ylfu")   -> "สวัสดี"   (ตั้งใจพิมพ์ไทย แต่แป้นเป็นอังกฤษ)
 *   convertThToEn("สวัสดี")   -> "l;ylfu"
 *   detectWrongLanguage("l;ylfu")  -> { suspicious: true, suggestion: "สวัสดี", ... }
 */

/* ------------------------------------------------------------------ *
 * 1) ตารางแม็พ: ปุ่มบนแป้น US QWERTY  ->  อักขระไทย (ผังเกษมณี)
 * ------------------------------------------------------------------ */

// แถวปกติ (ไม่กด Shift)
const EN_TO_TH_BASE: Record<string, string> = {
  "1": "ๅ", "2": "/", "3": "-", "4": "ภ", "5": "ถ",
  "6": "ุ", "7": "ึ", "8": "ค", "9": "ต", "0": "จ",
  "-": "ข", "=": "ช",
  q: "ๆ", w: "ไ", e: "ำ", r: "พ", t: "ะ",
  y: "ั", u: "ี", i: "ร", o: "น", p: "ย",
  "[": "บ", "]": "ล", "\\": "ฃ",
  a: "ฟ", s: "ห", d: "ก", f: "ด", g: "เ",
  h: "้", j: "่", k: "า", l: "ส", ";": "ว",
  "'": "ง",
  z: "ผ", x: "ป", c: "แ", v: "อ", b: "ิ",
  n: "ื", m: "ท", ",": "ม", ".": "ใ", "/": "ฝ",
  "`": "_",
};

// แถวกด Shift
const EN_TO_TH_SHIFT: Record<string, string> = {
  "!": "+", "@": "๑", "#": "๒", "$": "๓", "%": "๔",
  "^": "ู", "&": "฿", "*": "๕", "(": "๖", ")": "๗",
  _: "๘", "+": "๙",
  Q: "๐", W: '"', E: "ฎ", R: "ฑ", T: "ธ",
  Y: "ํ", U: "๊", I: "ณ", O: "ฯ", P: "ญ",
  "{": "ฐ", "}": ",", "|": "ฅ",
  A: "ฤ", S: "ฆ", D: "ฏ", F: "โ", G: "ฌ",
  H: "็", J: "๋", K: "ษ", L: "ศ", ":": "ซ",
  '"': ".",
  Z: "(", X: ")", C: "ฉ", V: "ฮ", B: "ฺ",
  N: "์", M: "?", "<": "ฒ", ">": "ฬ", "?": "ฦ",
  "~": "%",
};

// รวมทั้งสองแถว: อังกฤษ -> ไทย
const EN_TO_TH: Record<string, string> = { ...EN_TO_TH_BASE, ...EN_TO_TH_SHIFT };

// สร้างตารางย้อนกลับ: ไทย -> อังกฤษ (เฉพาะค่าที่เป็นอักขระไทย)
const TH_TO_EN: Record<string, string> = {};
for (const [en, th] of Object.entries(EN_TO_TH)) {
  // แม็พเฉพาะกรณีที่ผลลัพธ์เป็นอักขระไทยจริง เพื่อไม่ให้เครื่องหมายวรรคตอนชนกัน
  if (/[฀-๿]/.test(th) && !(th in TH_TO_EN)) {
    TH_TO_EN[th] = en;
  }
}

/* ------------------------------------------------------------------ *
 * 2) ฟังก์ชันแปลงข้อความ
 * ------------------------------------------------------------------ */

/** แปลงข้อความอังกฤษ (ที่พิมพ์ตอนลืมสลับเป็นไทย) กลับเป็นข้อความไทย */
export function convertEnToTh(text: string): string {
  let out = "";
  for (const ch of text) {
    out += ch in EN_TO_TH ? EN_TO_TH[ch] : ch;
  }
  return out;
}

/** แปลงข้อความไทย (ที่พิมพ์ตอนลืมสลับเป็นอังกฤษ) กลับเป็นข้อความอังกฤษ */
export function convertThToEn(text: string): string {
  let out = "";
  for (const ch of text) {
    out += ch in TH_TO_EN ? TH_TO_EN[ch] : ch;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 3) ชุดคำไทยที่พบบ่อย (ใช้เพิ่มความแม่นยำในการตรวจจับ)
 *    เพิ่มคำเฉพาะร้านของคุณได้ด้วย addThaiWords()
 * ------------------------------------------------------------------ */

const THAI_WORDS = new Set<string>([
  // ทักทาย / ทั่วไป
  "สวัสดี", "ขอบคุณ", "ครับ", "ค่ะ",
  "ใช่", "ไม่", "ให้", "และ", "หรือ", "กับ",
  "ที่", "นี้", "นั้น", "มี", "เป็น", "จะ", "ได้",
  "ดี", "มาก", "น้อย", "มา", "ไป", "อยู่", "คน",
  // การค้า / ร้านค้า
  "สินค้า", "สั่งซื้อ", "ออเดอร์", "ลูกค้า",
  "ราคา", "บาท", "จำนวน", "ชิ้น", "อัน", "ตัว",
  "ส่ง", "จัดส่ง", "ค่าส่ง", "โอน", "โอนเงิน",
  "ชำระ", "เงิน", "บาท", "ฟรี", "ลด", "โปร", "โปรโมชัน",
  "สต็อก", "สินค้า", "ดีไซน์", "งาน", "พิมพ์", "กระดาษ",
  "เสื้อ", "กางเกง", "แก้ว", "สติกเกอร์", "ป้าย",
  "ลูกค้า", "ของ", "แบบ", "สี", "ขนาด", "จำนวน",
  "ทัก", "สอบถาม", "ขอบคุณ", "ยินดี", "ต้องการ",
  "ชื่อ", "ที่อยู่", "เบอร์", "โทร", "เบอร์โทร", "อีเมล",
]);

// เก็บชุดคำแบบ "ไม่มีสระ/วรรณยุกต์" ไว้เทียบโครงพยัญชนะด้วย (เผื่อสะกดผิดเล็กน้อย)
let THAI_WORD_LIST: string[] = Array.from(THAI_WORDS);

/** เพิ่มคำไทยเฉพาะของร้าน/ระบบคุณ เพื่อให้ตรวจจับแม่นขึ้น */
export function addThaiWords(words: string[]): void {
  for (const w of words) {
    const t = w.trim();
    if (t) THAI_WORDS.add(t);
  }
  THAI_WORD_LIST = Array.from(THAI_WORDS);
}

/* ------------------------------------------------------------------ *
 * 4) ตัวช่วยวิเคราะห์ว่า "ดูเป็นภาษาไทยจริง" หรือไม่
 * ------------------------------------------------------------------ */

const THAI_CONSONANTS = "ก-ฮ"; // ก-ฮ
const THAI_VOWELS_TONES = "ะ-๎"; // สระ + วรรณยุกต์ (บน/ล่าง/หน้า/หลัง)
const RE_THAI = /[฀-๿]/;
const RE_LATIN = /[A-Za-z]/;
const RE_THAI_CONS = new RegExp(`[${THAI_CONSONANTS}]`);
const RE_THAI_VOWEL = new RegExp(`[${THAI_VOWELS_TONES}]`);

/**
 * ให้คะแนนความ "เป็นภาษาไทยที่อ่านออก" ของสตริง 0..1
 * แนวคิด: ภาษาไทยที่พิมพ์ถูกมักมีสระ/วรรณยุกต์ปนกับพยัญชนะ
 * ถ้าเป็นพยัญชนะเรียงล้วนโดยแทบไม่มีสระ -> น่าจะเป็นการพิมพ์มั่ว (ผิดภาษา)
 */
function thaiReadabilityScore(text: string): number {
  const thaiChars = text.match(new RegExp(`[฀-๿]`, "g")) || [];
  if (thaiChars.length === 0) return 0;

  let score = 0;
  let hits = 0;

  // (ก) มีคำที่อยู่ใน dictionary ไหม
  for (const w of THAI_WORD_LIST) {
    if (w.length >= 2 && text.includes(w)) {
      score += 0.6;
      hits++;
      if (hits >= 2) break;
    }
  }

  // (ข) สัดส่วนสระ/วรรณยุกต์ต่อพยัญชนะ (ภาษาไทยปกติ ~0.4-0.9)
  const cons = (text.match(new RegExp(`[${THAI_CONSONANTS}]`, "g")) || []).length;
  const vowels = (text.match(new RegExp(`[${THAI_VOWELS_TONES}]`, "g")) || []).length;
  if (cons > 0) {
    const ratio = vowels / cons;
    // ให้คะแนนสูงสุดเมื่อ ratio อยู่ในช่วง 0.3-1.2
    if (ratio >= 0.2 && ratio <= 1.5) score += 0.4;
    else if (ratio > 0) score += 0.15;
  }

  // (ค) ลงโทษถ้าเป็นวรรณยุกต์/สระลอยขึ้นต้น (ผิดหลักการสะกดไทย)
  if (RE_THAI_VOWEL.test(text[0] || "")) score -= 0.25;

  return Math.max(0, Math.min(1, score));
}

/* ------------------------------------------------------------------ *
 * 5) ฟังก์ชันตรวจจับหลัก
 * ------------------------------------------------------------------ */

export type Direction = "en->th" | "th->en";

export interface DetectionResult {
  /** ควรเตือนผู้ใช้หรือไม่ */
  suspicious: boolean;
  /** ข้อความที่แก้แล้ว (ถ้ามี) */
  suggestion: string | null;
  /** ทิศทางการแก้ */
  direction: Direction | null;
  /** ความมั่นใจ 0..1 */
  confidence: number;
  /** ข้อความต้นฉบับ */
  original: string;
}

const NO_HIT: Omit<DetectionResult, "original"> = {
  suspicious: false,
  suggestion: null,
  direction: null,
  confidence: 0,
};

/**
 * ตรวจจับว่าข้อความน่าจะพิมพ์ผิดภาษาหรือไม่ และเสนอคำที่ถูกต้อง
 *
 * ทำงาน 2 ทิศ:
 *  - en->th : ผู้ใช้ตั้งใจพิมพ์ไทย แต่แป้นเป็นอังกฤษ (ได้ตัวอังกฤษมั่ว ๆ)
 *  - th->en : ผู้ใช้ตั้งใจพิมพ์อังกฤษ แต่แป้นเป็นไทย (ได้ตัวไทยมั่ว ๆ)
 */
export function detectWrongLanguage(
  text: string,
  opts: { minLength?: number } = {}
): DetectionResult {
  const minLength = opts.minLength ?? 2;
  const trimmed = text.trim();
  if (trimmed.replace(/\s/g, "").length < minLength) {
    return { ...NO_HIT, original: text };
  }

  const hasThai = RE_THAI.test(trimmed);
  const hasLatin = RE_LATIN.test(trimmed);

  // -------- ทิศ en->th : ข้อความเป็นอังกฤษล้วน (ไม่มีไทย) --------
  if (hasLatin && !hasThai) {
    const converted = convertEnToTh(trimmed);
    const convScore = thaiReadabilityScore(converted);

    // ต้องมีตัวอักษรไทยเกิดขึ้นจริงจากการแปลง และอ่านออกพอควร
    const producedThai = (converted.match(/[฀-๿]/g) || []).length;
    const producedRatio = producedThai / converted.replace(/\s/g, "").length;

    if (convScore >= 0.5 && producedRatio >= 0.6) {
      return {
        suspicious: true,
        suggestion: convertEnToTh(text),
        direction: "en->th",
        confidence: convScore,
        original: text,
      };
    }
    return { ...NO_HIT, original: text };
  }

  // -------- ทิศ th->en : ข้อความเป็นไทยล้วน --------
  if (hasThai && !hasLatin) {
    const nativeScore = thaiReadabilityScore(trimmed);
    // ถ้าไทยอ่านออกดีอยู่แล้ว = ปกติ ไม่ต้องเตือน
    if (nativeScore >= 0.5) {
      return { ...NO_HIT, original: text };
    }

    // ลองแปลงเป็นอังกฤษ แล้วดูว่าดูเป็นคำอังกฤษ (มีสระอังกฤษ, โครงพอเป็นคำ)
    const converted = convertThToEn(trimmed);
    const looksEnglish = englishReadabilityScore(converted);

    if (nativeScore < 0.35 && looksEnglish >= 0.5) {
      return {
        suspicious: true,
        suggestion: convertThToEn(text),
        direction: "th->en",
        confidence: looksEnglish,
        original: text,
      };
    }
    return { ...NO_HIT, original: text };
  }

  // มีทั้งไทยและอังกฤษปน -> ไม่ฟันธง
  return { ...NO_HIT, original: text };
}

const EN_VOWELS = "aeiou";
/** ให้คะแนนความเป็นคำอังกฤษแบบง่าย (มีสระ, ไม่ใช่พยัญชนะเรียงล้วน) 0..1 */
function englishReadabilityScore(text: string): number {
  const letters = (text.match(/[a-z]/gi) || []).map((c) => c.toLowerCase());
  if (letters.length < 2) return 0;
  const vowels = letters.filter((c) => EN_VOWELS.includes(c)).length;
  const ratio = vowels / letters.length;
  // คำอังกฤษปกติมีสระ ~30-60%
  let score = 0;
  if (ratio >= 0.2 && ratio <= 0.65) score += 0.6;
  else if (ratio > 0) score += 0.2;
  // มีสระอย่างน้อยหนึ่งตัว
  if (vowels >= 1) score += 0.2;
  // ไม่มีพยัญชนะติดกันเกิน 4 ตัว (เช่น "bcdfg")
  if (!/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(text)) score += 0.2;
  return Math.min(1, score);
}

/* ------------------------------------------------------------------ *
 * 6) ตัวช่วยระดับสูง
 * ------------------------------------------------------------------ */

/**
 * ตรวจทีละคำในข้อความยาว ๆ แล้วคืนข้อความที่แก้เฉพาะคำที่มั่นใจ
 * เหมาะกับการ "แก้ทั้งประโยคอัตโนมัติ"
 */
export function fixWrongLanguage(
  text: string,
  opts: { minConfidence?: number } = {}
): string {
  const minConfidence = opts.minConfidence ?? 0.55;
  return text
    .split(/(\s+)/) // เก็บช่องว่างไว้
    .map((token) => {
      if (/^\s*$/.test(token)) return token;
      const res = detectWrongLanguage(token);
      if (res.suspicious && res.suggestion && res.confidence >= minConfidence) {
        return res.suggestion;
      }
      return token;
    })
    .join("");
}

// export ตารางไว้เผื่อใช้ต่อ (เช่น ทำ virtual keyboard)
export { EN_TO_TH, TH_TO_EN };
