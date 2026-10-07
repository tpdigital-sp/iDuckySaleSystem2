// ⏰ Netlify scheduled function — ทุก 5 นาที:
// คำขอสั่งของจากร้านที่ TP เปลี่ยนเป็น "ของเข้าแล้ว" → ติ๊ก "ของเข้าแล้ว" ให้ออเดอร์ร้าน + แจ้งลูกค้า (ดู src/lib/server/tp-order-arrived.ts)
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/tp-order-sync?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`tp-order-sync: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "*/5 * * * *" };
