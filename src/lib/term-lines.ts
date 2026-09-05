/**
 * แยก "ข้อควรทราบ / เงื่อนไขงาน" (Product.terms) เป็นข้อ ๆ —
 * บรรทัดที่ขึ้นต้นด้วย * / ** / *** / • = ข้อใหม่
 * บรรทัดถัดไปที่ไม่ได้ขึ้นต้นด้วย * ถือเป็นบรรทัดต่อของข้อเดิม (คงการขึ้นบรรทัดไว้)
 * ใช้ร่วมกันทั้งกล่องแดงหน้าสินค้าและกล่องย้ำในตะกร้า — แก้กติกาแยกข้อที่นี่ที่เดียว
 */
export function termLines(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    // อักขระล่องหน (zero-width space ฯลฯ) หลุดมากับข้อความที่ก๊อปจากไลน์/เว็บ — trim() ไม่ตัดให้
    const t = line.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    if (!t) continue;
    if (/^[*•]/.test(t)) out.push(t.replace(/^[*•\s]+/, ""));
    else if (out.length) out[out.length - 1] += "\n" + t;
    else out.push(t);
  }
  return out.filter(Boolean);
}
