// ⏰ Netlify scheduled function — เรียกทุกเช้า 09:00 ไทย (02:00 UTC) ให้ระบบเช็คสต๊อก+แจ้ง LINE
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/stock-alert?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`stock-alert: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "0 2 * * *" };
