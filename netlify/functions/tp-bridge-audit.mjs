// ⏰ Netlify scheduled function — ทุก 3 ชั่วโมง ตรวจว่ามีออเดอร์ "ชำระแล้ว" ใบไหนไม่ขึ้นแท็บ 🛒 iDucky Store
// ของหน้า msVerify (เรคอร์ดสะพานหลุดตอนยิง) → เติมให้ย้อนหลัง + แจ้งไลน์ร้าน
// days=14 เพราะใบที่จ่ายทีหลังวันที่สร้าง (ใบเสนอราคา/งวดหลังมัดจำ) ต้องอยู่ในกรอบด้วย — กรองด้วย created_at ของออเดอร์
// ดู src/app/api/cron/tp-bridge-audit/route.ts
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/tp-bridge-audit?key=${encodeURIComponent(key)}&days=14`;
  const res = await fetch(url).catch(() => null);
  return new Response(`tp-bridge-audit: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "25 */3 * * *" };
