/**
 * 📞📍 ด่านตรวจ "เบอร์โทร + ที่อยู่จัดส่ง" ชุดเดียวใช้ทุกจอ — เจ้าของร้านสั่ง 18 ก.ย. 69
 * (ออเดอร์ขึ้นหลังบ้านเป็นชื่อ "Nunn" เบอร์ "0" ที่อยู่ว่าง → ส่งของไม่ได้)
 *
 * กติกา: ต้องกรอกทั้งคู่ · ห้ามใส่ขีด/บวก/ดอกจันแทนข้อมูล · ต้องเป็นรูปแบบที่อยู่จริงเท่านั้น
 * ใช้ที่: checkout (หน้าร้าน + API สร้างออเดอร์) · ลูกค้าแก้ที่อยู่ (หน้าออเดอร์ + API) · หน้าออเดอร์แอดมิน (เตือน)
 * ฝั่งหน้าจอเรียก phoneProblem/addressProblem โชว์ใต้ช่อง · ฝั่ง API เรียก contactProblems แล้วตอบ 400
 */

/** เบอร์ → เหลือแต่ตัวเลข (+66 / 66 นำหน้า → 0) · ใช้ทั้งตอนพิมพ์ (กันขีด/บวก/ดอกจัน) และตอนเก็บ */
export function cleanPhone(raw: string | undefined | null): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("66") && d.length >= 11) d = `0${d.slice(2)}`;
  return d;
}

/** เบอร์ที่กรอกมาผิดตรงไหน — null = ผ่าน */
export function phoneProblem(raw: string | undefined | null): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return "กรอกเบอร์โทร";
  if (/[-+*]/.test(s) && !/\d{9,10}/.test(s.replace(/[-\s]/g, ""))) return "เบอร์โทรห้ามใส่ - + * ให้พิมพ์ตัวเลขเท่านั้น";
  const d = cleanPhone(s);
  if (d.length < 9 || d.length > 10 || !d.startsWith("0")) return "เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0";
  // เลขซ้ำยาว/เลขเรียง = พิมพ์มั่วเพื่อผ่านช่องบังคับ
  if (/^(\d)\1+$/.test(d) || /^0?1234567890?$/.test(d) || /^0123456789?$/.test(d)) return "เบอร์โทรไม่ถูกต้อง กรอกเบอร์ที่ติดต่อได้จริง";
  return null;
}

/** ที่อยู่ที่กรอกมาผิดตรงไหน — null = ผ่าน (ต้องมีบ้านเลขที่ + ข้อความที่อยู่ + รหัสไปรษณีย์ 5 หลัก) */
export function addressProblem(raw: string | undefined | null): string | null {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "กรอกที่อยู่จัดส่ง";
  // ⚠️ ขีดในที่อยู่จริงมีเยอะมาก (ถ.รังสิต-นครนายก · อโศก-ดินแดง · ประชาชื่น - พงษ์เพชร · Chula-Samyan)
  // ห้ามเตือนขีดที่คั่นระหว่างคำ — เตือนเฉพาะที่ "ใส่สัญลักษณ์แทนที่อยู่" คือซ้ำติดกัน (---, ***)
  // หรือทั้งช่องมีแต่สัญลักษณ์/เครื่องหมายวรรคตอน (พนักงานแจ้ง 22 ก.ย. 69 "บางที่อยู่มี - เกี่ยวข้องด้วย")
  const contentOnly = s.replace(/[-+*_=~.,/\\()[\]{}'"|:;!?\s]/g, "");
  if (/[-+*]{2,}/.test(s) || !contentOnly) return "ที่อยู่ห้ามใส่ - + * แทนที่อยู่จริง ให้พิมพ์ที่อยู่จริง";
  const letters = (s.match(/[A-Za-z฀-๿]/g) ?? []).length;
  const digits = (s.match(/\d/g) ?? []).length;
  if (s.length < 15 || letters < 6 || digits < 1)
    return "ที่อยู่สั้นเกินไป กรอก บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์";
  // รหัสไปรษณีย์ไทย 5 หลัก (10xxx-96xxx) ต้องมี ไม่งั้นใบปะหน้า/ปณ. ส่งไม่ได้
  const zip = [...s.matchAll(/(?<!\d)(\d{5})(?!\d)/g)].map((m) => Number(m[1])).find((n) => n >= 10000 && n <= 96999);
  if (!zip) return "ที่อยู่ต้องมีรหัสไปรษณีย์ 5 หลัก";
  // ที่อยู่ที่เป็นแค่เบอร์โทร/ตัวเลขล้วน
  if (letters < digits / 2 && letters < 10) return "ที่อยู่ต้องมีชื่อถนน/ตำบล/อำเภอ/จังหวัด ไม่ใช่ตัวเลขอย่างเดียว";
  return null;
}

/** รวมทุกข้อที่ผิด (ใช้ตอบ API) — ว่าง = ผ่านทั้งคู่ */
export function contactProblems(v: { phone?: string | null; address?: string | null }): string[] {
  return [phoneProblem(v.phone), addressProblem(v.address)].filter((x): x is string => !!x);
}
