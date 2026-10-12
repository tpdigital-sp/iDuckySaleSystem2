/**
 * 📱 PromptPay QR (Thai QR Payment / EMVCo) — สร้างข้อความ payload ให้ลูกค้าสแกนจ่ายพร้อมยอด
 *
 * ร้านตั้งหมายเลขพร้อมเพย์ที่ /admin/settings?tab=pay (ShopPayment.promptpay) — เดิมหน้าแจ้งโอนโชว์แค่เลข + ปุ่มคัดลอก
 * ลูกค้าต้องพิมพ์ยอดเองในแอปธนาคาร (12 ต.ค. 69) → สร้าง QR ที่ใส่ยอดให้แล้ว
 *
 * รองรับ: เบอร์มือถือ 10 หลัก (ขึ้นต้น 0) · เลขบัตร ปชช./เลขนิติบุคคล 13 หลัก · e-Wallet 15 หลัก
 * โครงสร้าง (ID · ความยาว 2 หลัก · ค่า):
 *   00 "01" · 01 "12" (มียอด = dynamic) / "11" (ไม่มียอด) · 29 บัญชีพร้อมเพย์ (00 AID A000000677010111 + 01/02/03 เลข)
 *   58 "TH" · 53 "764" (บาท) · 54 ยอด · 63 CRC16-CCITT (0x1021 เริ่ม 0xFFFF) ตัวพิมพ์ใหญ่
 */

const tlv = (id: string, value: string) => `${id}${value.length.toString().padStart(2, "0")}${value}`;

/** CRC16-CCITT-FALSE — คิดรวม "6304" ท้ายข้อความด้วยตามมาตรฐาน */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** หมายเลขพร้อมเพย์ที่ตั้งไว้ → ช่องย่อยใน tag 29 · null = รูปแบบไม่รองรับ (ไม่สร้าง QR ดีกว่าสร้างผิด) */
function proxyTag(raw: string): string | null {
  const id = raw.replace(/\D/g, "");
  if (/^0\d{9}$/.test(id)) return tlv("01", `0066${id.slice(1)}`); // เบอร์มือถือ → 0066XXXXXXXXX (13 หลัก)
  if (/^\d{13}$/.test(id)) return tlv("02", id); // เลขบัตรประชาชน / เลขผู้เสียภาษีนิติบุคคล
  if (/^\d{15}$/.test(id)) return tlv("03", id); // e-Wallet
  return null;
}

/**
 * ข้อความสำหรับใส่ใน QR · amount ≤ 0 หรือไม่ระบุ = QR ไม่มียอด (ลูกค้ากรอกเอง)
 * คืน null ถ้าหมายเลขพร้อมเพย์ไม่ถูกรูปแบบ
 */
export function promptPayPayload(promptpay: string, amount?: number): string | null {
  const proxy = proxyTag(promptpay);
  if (!proxy) return null;
  const hasAmount = typeof amount === "number" && Number.isFinite(amount) && amount > 0;
  const body =
    tlv("00", "01") +
    tlv("01", hasAmount ? "12" : "11") +
    tlv("29", tlv("00", "A000000677010111") + proxy) +
    tlv("58", "TH") +
    tlv("53", "764") +
    (hasAmount ? tlv("54", (Math.round(amount! * 100) / 100).toFixed(2)) : "") +
    "6304";
  return body + crc16(body);
}
