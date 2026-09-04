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
/** ขนาดฐานที่เขียนไว้ในชื่อกลุ่ม/ชื่อตัวเลือกเอง — "ขนาดมากกว่า 8 ซม" · "เริ่มที่ 15 cm" · "จาก 6 ซม." */
const FROM = String.raw`(?:มากกว่า|เริ่มที่|เริ่มต้นที่|จาก)`;
const BASE_RE = new RegExp(String.raw`${FROM}\s*([\d.]+)\s*(${UNIT_RE})`, "i");
/** ฐานที่เป็นสองด้าน — "จาก 13×13 นิ้ว" (โตทั้งสองด้านพร้อมกัน) */
const BASE_2D_RE = new RegExp(String.raw`${FROM}\s*([\d.]+)\s*[×x]\s*([\d.]+)\s*(${UNIT_RE})`, "i");

/** ปัดทศนิยม 2 ตำแหน่ง (กัน 7.5 + 0.3 = 7.799999) */
const round2 = (n: number) => Math.round(n * 100) / 100;

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

/** ตัวเลือก 1 บรรทัดที่แปลว่า "บวกขนาดเพิ่ม N หน่วย" */
type SizeAdd = { i: number; label: string; name: string; step: number; unit: "cm" | "inch" | "mm"; unitText: string };

/** อ่านบรรทัดตัวเลือกว่าเป็น "เพิ่มขนาด" กี่หน่วยไหม — ไม่ใช่ = null */
function readSizeAdd(label: string, value: string, i: number): SizeAdd | null {
  const v = value.trim();
  const qty = ADD_QTY_RE.exec(v);
  const input = qty ? null : ADD_INPUT_RE.exec(v); // ช่องกรอกเก็บเป็นตัวเลขล้วน ไม่มี "×N"
  const name = qty ? qty[1] : "";
  if (!qty && !input) return null;
  if (!ADD_SIZE_RE.test(label) && !ADD_SIZE_RE.test(name)) return null;
  const step = Number(qty ? qty[2] : input![1]);
  const unitText = (input?.[2] ?? "").trim();
  const unit = lengthUnit(name) ?? lengthUnit(unitText) ?? lengthUnit(label);
  if (!unit || !(step > 0)) return null;
  return { i, label, name, step, unit, unitText: unitText || (unit === "inch" ? "นิ้ว" : unit === "mm" ? "มม." : "ซม.") };
}

/**
 * บวก "เพิ่มขนาด" ให้เห็นเป็นขนาดจริง — ทำเฉพาะตอนที่ไม่กำกวมเท่านั้น (ไม่เข้าเงื่อนไข = ปล่อยไว้เหมือนเดิม)
 * หน่วยต้องตรงกับขนาดฐานเสมอ แล้วบวกตามลำดับ:
 *   1) บรรทัดขนาดเป็นตัวเลขเดี่ยว         "ขนาด: 15 ซม."           → "17 ซม. (15 + เพิ่ม 2)"
 *   2) บรรทัดขนาดระบุด้าน + กลุ่มบอกด้าน   "กว้าง 2.5 cm ยาว 10cm"  → บวกเฉพาะด้านยาว
 *   3) ฐานเขียนในชื่อกลุ่มเอง              "ขนาดมากกว่า 8 ซม"       → ต่อท้ายว่า "→ รวม 10 ซม."
 *      (ฐานสองด้าน "จาก 13×13 นิ้ว" → "→ รวม 15×15 นิ้ว" — โตทั้งสองด้าน ตามที่เจ้าของร้านยืนยัน 4 ก.ย. 69)
 *   4) หน่วยคนละอย่างกับบรรทัดขนาด (ขนาดเป็น ซม. แต่เพิ่มเป็นนิ้ว) → **ไม่แปลงหน่วย** ต่อท้ายว่าเพิ่มไปกี่นิ้ว
 * ที่เหลือปล่อยไว้ = ไม่รู้ฐานจริง ๆ (ช่วงขนาด "6 – 8 ซม." · ไม่มีขนาดฐานใน options · เพิ่มคนละชิ้นสองกลุ่ม)
 */
export function foldSizeExtra(entries: [string, string][]): [string, string][] {
  const adds = entries.map(([k, v], i) => readSizeAdd(k, v, i)).filter(Boolean) as SizeAdd[];
  if (!adds.length) return entries;
  const put = (at: number, value: string) =>
    entries.map(([k, v], i) => (i === at ? ([k, value] as [string, string]) : ([k, v] as [string, string])));

  /** บรรทัดที่พูดถึง "ขนาด" และไม่ใช่บรรทัดเพิ่มขนาดเอง */
  const sizeLines = entries.flatMap(([k, v], i) =>
    // กลุ่ม "เพิ่มขนาด" ที่ไม่ได้กรอกตัวเลข (เช่น ติ๊กว่าต้องการเพิ่ม) ก็ไม่ใช่บรรทัดขนาดฐาน
    k.includes("ขนาด") && !ADD_SIZE_RE.test(k) && !adds.some((a) => a.i === i) ? [{ i, v: v.trim() }] : [],
  );

  if (adds.length === 1) {
    const add = adds[0];

    // 1) ขนาดที่เป็นตัวเลขเดี่ยว หน่วยตรงกัน → บวกตรง ๆ
    const plain = sizeLines.flatMap(({ i, v }) => {
      const s = SIZE_VALUE_RE.exec(v);
      return s && lengthUnit(s[3]) === add.unit ? [{ i, s }] : [];
    });
    if (plain.length === 1) {
      const { i, s } = plain[0];
      const base = Number(s[1]);
      return put(i, `${round2(base + add.step)}${s[2]}${s[3]} (${base} + เพิ่ม ${add.step})`);
    }

    // 2) ขนาดที่ระบุด้านไว้ + กลุ่มบอกว่าเพิ่มด้านไหน → บวกเฉพาะด้านนั้น
    const tag = `${add.label} ${add.name}`;
    const side = /ความยาว|ด้านยาว/.test(tag) ? "ยาว" : /ความกว้าง|ด้านกว้าง/.test(tag) ? "กว้าง" : null;
    if (side) {
      const sideRe = new RegExp(String.raw`(${side}\s*)([\d.]+)(\s*)(${UNIT_RE})`, "i");
      const sided = sizeLines.flatMap(({ i, v }) => {
        const s = sideRe.exec(v);
        return s && lengthUnit(s[4]) === add.unit ? [{ i, v, s }] : [];
      });
      if (sided.length === 1) {
        const { i, v, s } = sided[0];
        const base = Number(s[2]);
        return put(i, `${v.replace(sideRe, `$1${round2(base + add.step)}$3$4`)} (${side}เดิม ${base} + เพิ่ม ${add.step})`);
      }
    }

    // 3) ฐานเขียนอยู่ในชื่อกลุ่ม/ชื่อตัวเลือกเอง → ต่อท้ายบรรทัดเพิ่มขนาดว่ารวมแล้วเท่าไร
    const from = `${add.name} ${add.label}`;
    const b2 = BASE_2D_RE.exec(from);
    if (b2 && lengthUnit(b2[3]) === add.unit) {
      const [w, h] = [Number(b2[1]), Number(b2[2])];
      return put(add.i, `${entries[add.i][1]} → รวม ${round2(w + add.step)}×${round2(h + add.step)} ${b2[3]}`);
    }
    const b1 = BASE_RE.exec(from);
    if (b1 && lengthUnit(b1[2]) === add.unit) {
      return put(add.i, `${entries[add.i][1]} → รวม ${round2(Number(b1[1]) + add.step)} ${b1[2]}`);
    }
  }

  // 4) หน่วยคนละอย่างกับบรรทัดขนาด — แปลงหน่วยเองไม่ได้ (1 นิ้ว = 2.54 ซม. แล้วขนาดจริงจะเพี้ยน)
  //    จึงต่อท้ายบรรทัดขนาดว่าเพิ่มไปกี่หน่วย ตามที่เจ้าของร้านสั่ง (4 ก.ย. 69) — รับหลายด้านพร้อมกันได้
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
