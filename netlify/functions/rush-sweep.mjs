// ⏰ Netlify scheduled function — ทุกเช้า 08:00 ไทย (01:00 UTC) ก่อนเริ่มงาน:
// ใบที่วันใช้งานใกล้เข้ามาจนกระชั้น → ติ๊กธง 🔥 งานเร่งให้เอง + ขึ้นป้ายบนบอร์ด WIP กราฟฟิก + แจ้งกลุ่มไลน์ร้าน
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/rush-sweep?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`rush-sweep: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "0 1 * * *" };
