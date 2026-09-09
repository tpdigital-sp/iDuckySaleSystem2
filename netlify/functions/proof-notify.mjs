// ⏰ Netlify scheduled function — ทุก 10 นาที: แบบงานที่กราฟฟิกอัปแล้วไม่ได้กด 📣 แจ้งลูกค้าเกิน 30 นาที → ระบบแจ้งให้เอง
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/proof-notify?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`proof-notify: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "*/10 * * * *" };
