// ⏰ Netlify scheduled function — 08:00 และ 14:00 ไทย (01:00 / 07:00 UTC):
// ไล่อ่านเอกสาร FlowAccount ของใบที่ยังไม่จบ ว่าถูกแก้ในแอปหลังเปิดออเดอร์หรือยัง
// (ยอดรวม/หัก ณ ที่จ่ายไม่ตรงกับที่ระบบจำไว้) → ติดธงบนใบ + แจ้งกลุ่มไลน์ร้านให้ไปกดซิงก์
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/flowaccount-check?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`flowaccount-check: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "0 1,7 * * *" };
