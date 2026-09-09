/**
 * ออเดอร์เก่า/ใบเสนอราคาเก็บตัวเลือกเป็นข้อความรวมคั่นด้วย " · " — กางกลับเป็นคู่ หัวข้อ/ค่า
 * ค่าบางตัวมี " · " อยู่ข้างใน (เช่น "เรทราคา: พรีเมี่ยม · สกรีน 2 ด้าน") → ท่อนที่ไม่มีหัวข้อ
 * ให้ต่อท้ายค่าของหัวข้อก่อนหน้า ไม่ตัดเป็นบรรทัดใหม่
 * (แยกออกจาก SpecLines.tsx เพื่อให้ lib/สคริปต์ฝั่งเซิร์ฟเวอร์ใช้ได้โดยไม่ต้องลากคอมโพเนนต์มา)
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
