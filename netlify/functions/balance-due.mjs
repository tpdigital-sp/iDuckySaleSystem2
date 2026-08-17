// ⏰ Netlify scheduled function — เรียกทุกเช้า 10:00 ไทย (03:00 UTC) ให้ระบบทวงยอดคงเหลือ + สรุปยอดค้างเข้า LINE ร้าน
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/balance-due?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`balance-due: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "0 3 * * *" };
