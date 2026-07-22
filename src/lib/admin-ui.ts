/**
 * ระบบดีไซน์หลังบ้าน (โทนสะอาด สบายตา ใช้งานง่าย)
 * — พื้นเทากลาง (slate) · การ์ดขาวขอบนุ่ม · แอมเบอร์เป็นสีแบรนด์ใช้เท่าที่จำเป็น
 * ใช้ className ร่วมกันทุกหน้า admin เพื่อความสม่ำเสมอ
 */

// ── พื้นผิว / การ์ด ──
export const card = "rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
export const cardPad = `${card} p-5`;

// ── ตัวอักษร ──
export const h1 = "text-xl font-bold tracking-tight text-slate-900 sm:text-[1.6rem]";
export const h2 = "text-sm font-semibold text-slate-800";
export const subtle = "text-sm text-slate-500";
export const muted = "text-slate-500";
export const faint = "text-slate-400";

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

// ── badge สถานะ/ป้าย (โทนนุ่ม) ──
export const badge = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold";
