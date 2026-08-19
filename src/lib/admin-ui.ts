/**
 * ระบบดีไซน์หลังบ้าน (โทนสะอาด สบายตา ใช้งานง่าย)
 * — พื้นเทากลาง (slate) · การ์ดขาวขอบนุ่ม · แอมเบอร์เป็นสีแบรนด์ใช้เท่าที่จำเป็น
 * ใช้ className ร่วมกันทุกหน้า admin เพื่อความสม่ำเสมอ
 */

// ── พื้นผิว / การ์ด ──
export const card = "rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
export const cardPad = `${card} p-5`;

// ── ตัวอักษร ──
// ⚠️ Prompt โหลดแค่น้ำหนัก 400–800 (ดู layout.tsx) — font-black (900) เบราว์เซอร์จะปลอมให้ ห้ามใช้
// กติกา: เน้นด้วย "ขนาด + สี" ไม่ใช่ความหนา · ตัวหนาสุดที่ใช้คือ 700 และใช้เฉพาะหัวหน้า
export const h1 = "text-xl font-bold tracking-tight text-slate-900 sm:text-[1.6rem]";
export const h2 = "text-sm font-semibold text-slate-800";
export const subtle = "text-sm text-slate-500";
export const muted = "text-slate-500";
export const faint = "text-slate-400";
/** ป้ายหัวคอลัมน์/หัวส่วน — ตัวเล็กแต่ไม่หนาจัด อักษรไทยที่ 10-11px หนา 700 อ่านยาก */
export const label = "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400";
/** ตัวเลขหลัก (ยอดคงเหลือ/สถิติ) — ใหญ่แต่ไม่หนา + tabular ให้หลักตรงกันทุกแถว */
export const metric = "text-[1.75rem] font-semibold leading-none tabular-nums text-slate-900";
export const metricSm = "text-sm font-semibold tabular-nums text-slate-700";
/** รหัส/ไอดี — โมโนสเปซ แยกออกจากชื่อที่คนอ่าน */
export const code = "font-mono text-[11px] tracking-tight text-slate-400";

// ── สีบอกสถานะ (หนึ่งแถวใช้ได้สีเดียวเท่านั้น) ──
// ⚠️ amber ถูก remap เป็นฟ้าแบรนด์ใน globals.css แล้ว — สีเตือนต้องใช้ orange ไม่ใช่ amber
export const TONE = {
  ok: { text: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200", bar: "bg-emerald-500" },
  warn: { text: "text-orange-600", bg: "bg-orange-50", ring: "ring-orange-200", bar: "bg-orange-400" },
  danger: { text: "text-rose-600", bg: "bg-rose-50", ring: "ring-rose-200", bar: "bg-rose-500" },
  review: { text: "text-violet-600", bg: "bg-violet-50", ring: "ring-violet-200", bar: "bg-violet-400" },
  neutral: { text: "text-slate-600", bg: "bg-slate-100", ring: "ring-slate-200", bar: "bg-slate-300" },
} as const;
export type Tone = keyof typeof TONE;

// ── ช่องกรอก ──
export const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100";
export const fieldLabel = "mb-1 block text-xs font-semibold text-slate-600";

// ── ปุ่ม (ระบบเดียวกันทั้งหมด) ──
const btnBase = "inline-flex items-center justify-center gap-1.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = `${btnBase} rounded-lg bg-amber-500 px-4 py-2 text-sm text-white shadow-sm hover:bg-amber-600`;
export const btnNeutral = `${btnBase} rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50`;
export const btnSuccess = `${btnBase} rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white shadow-sm hover:bg-emerald-700`;
// ขนาดเล็ก (แถวรายการ)
export const btnSm = `${btnBase} rounded-lg px-3 py-1.5 text-xs`;
export const btnSmNeutral = `${btnSm} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
export const btnSmGhost = `${btnSm} text-slate-600 hover:bg-slate-100`;
export const btnSmDanger = `${btnSm} text-rose-600 hover:bg-rose-50`;

// ── pill (ตัวกรอง) ──
export const pill = "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition";
export const pillActive = `${pill} bg-slate-900 text-white`;
export const pillIdle = `${pill} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`;

// ── segmented control (ตัวกรองที่เลือกได้ทีละอันในกลุ่มเดียว) ──
// ใช้แทน pill เรียงยาว ๆ เวลามีตัวกรองหลายกลุ่มบนแถบเดียว — รางเทาบอกขอบเขตกลุ่ม
// ผู้ใช้เห็นทันทีว่าอันไหนอยู่กลุ่มเดียวกัน และแต่ละกลุ่มเลือกอยู่อันไหน
export const segWrap = "inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5";
const segItem = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition";
export const segItemActive = `${segItem} bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.10)]`;
export const segItemIdle = `${segItem} text-slate-500 hover:text-slate-800`;
/** ตัวเลขกำกับในปุ่ม segmented — เทาจาง ไม่แย่งสายตาจากชื่อ */
export const segCount = "rounded-full bg-slate-900/[0.06] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums";
/** ชื่อกำกับกลุ่มตัวกรอง (ซ้ายมือของราง) */
export const filterGroupLabel = "text-[11px] font-semibold text-slate-400";

// ── badge สถานะ/ป้าย (โทนนุ่ม) ──
export const badge = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold";

/* ──────────────────────────────────────────────────────────────
   🎨 โทนแบรนด์ (ฟ้า–เหลืองเป็ด) — ชุดเสริมสำหรับหน้าหลังบ้านที่ต้องการสีสัน
   ให้เข้ากับหน้าแรกร้าน (landing.css: sky #E2F3FE · blue #57B6E8 ·
   blue-deep #2C81C4 · navy #173A6B · yolk #FFD447)
   ⚠️ ramp "amber-*" ของ Tailwind ถูกรีแมปเป็นฟ้า-teal ใน globals.css แล้ว
   ส่วน "yellow-*" ยังเป็นเหลืองจริง → ใช้ yellow เป็นสีเน้น (accent)
   ใช้เท่าที่ช่วยแยกโซน อย่าให้กลบเนื้อหา — พื้นหลัก ๆ ยังเป็นขาว/slate
   ────────────────────────────────────────────────────────────── */

/** การ์ดโทนแบรนด์ — ขอบฟ้าอ่อน เงาอมฟ้า มุมมนกว่าการ์ดปกติ */
export const brandCard =
  "rounded-[22px] border border-amber-100 bg-white shadow-[0_6px_18px_rgba(44,129,196,0.08)]";
/** แถบหัวเรื่องของหน้า (ไล่สีฟ้าอ่อน) */
export const brandHero =
  "rounded-[22px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-amber-50/60 p-5 shadow-[0_6px_18px_rgba(44,129,196,0.07)]";
/** แถบหัวข้อย่อย/หัวกลุ่มในลิสต์ */
export const brandStrip = "rounded-xl bg-amber-50/70 px-3 py-2 ring-1 ring-amber-100";
/** เมนูด้านข้าง (หมวดหมู่) — สถานะปกติ/ถูกเลือก */
export const navItem =
  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition";
export const navItemIdle = `${navItem} text-slate-600 hover:bg-amber-50`;
export const navItemActive = `${navItem} bg-amber-500 text-white shadow-[0_4px_12px_rgba(44,129,196,0.25)]`;
/** ปุ่มเน้น (เหลืองเป็ด) — ใช้กับ action หลักที่อยากให้สะดุดตาบนพื้นฟ้า */
export const btnDucky =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-ducky)] px-4 py-2 text-sm font-bold text-amber-950 shadow-sm transition hover:bg-[var(--color-ducky-dark)] disabled:cursor-not-allowed disabled:opacity-50";
/** ปุ่มเน้นขนาดเล็ก (เหลืองเป็ด) — action หลักในแถบเครื่องมือ/หัวกลุ่ม */
export const btnSmDucky = `${btnSm} bg-[var(--color-ducky)] font-bold text-amber-950 shadow-sm hover:bg-[var(--color-ducky-dark)]`;
/** ป้ายตัวเลข/สถานะโทนแบรนด์ */
export const chipBrand = `${badge} bg-amber-50 text-amber-800 ring-1 ring-amber-200`;
export const chipDucky = `${badge} bg-[var(--color-ducky)]/25 text-amber-900 ring-1 ring-[var(--color-ducky)]`;
export const chipMuted = `${badge} bg-slate-100 text-slate-500`;

/**
 * สีประจำหมวด — วนจากจานสีหน้าแรกร้าน (ฟ้า/เหลืองเป็ด/มินต์/คอรัล/ลิแลค/ฟ้าเข้ม)
 * เลือกจากชื่อหมวดแบบคงที่ (hash) → หมวดเดิมได้สีเดิมทุกครั้ง ไม่ต้องเก็บสีในฐานข้อมูล
 * ใช้เป็นจุดนำสายตาเวลาหมวดเยอะ (แถบข้างการ์ด/จุดหน้าเมนู)
 */
const CATEGORY_TONES = ["#57B6E8", "#FFD447", "#A9E5D2", "#FF9EB0", "#C7C4F5", "#2C81C4"] as const;
export function categoryTone(name: string): string {
  if (!name) return "#CBD5E1"; // ยังไม่จัดหมวด = เทา
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_TONES[h % CATEGORY_TONES.length];
}
// ── ลิ้นชักด้านขวา (รายละเอียด/ประวัติ) — ใช้แทนการกางเนื้อหาในลิสต์ ที่ทำให้เลย์เอาต์กระโดด ──
export const drawerScrim = "fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-[2px]";
export const drawerPanel =
  "fixed inset-y-0 right-0 z-[121] flex w-full max-w-[26rem] flex-col border-l border-slate-200 bg-white shadow-2xl";

/** เวลาแบบสั้น "23 ก.ค. 14:05" — ใช้กำกับว่าใครทำอะไรเมื่อไหร่ */
export function shortTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
