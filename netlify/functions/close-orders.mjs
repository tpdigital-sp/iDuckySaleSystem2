// ⏰ Netlify scheduled function — ปิดงานออเดอร์ที่จัดส่งแล้วเกินกำหนด (ทุกวัน 04:00 ไทย = 21:00 UTC)
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/close-orders?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  const body = await res?.text().catch(() => "");
  return new Response(`close-orders: ${res?.status ?? "fail"} ${body.slice(0, 200)}`, { status: 200 });
};

export const config = { schedule: "0 21 * * *" };
