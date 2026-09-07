// ⏰ Netlify scheduled — คำนวณระดับสมาชิกใหม่ทุกวัน 03:00 ไทย (20:00 UTC) จัดการแต้มหมดอายุ
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/tier-recompute?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`tier-recompute: ${res?.status ?? "fail"}`, { status: 200 });
};
export const config = { schedule: "0 20 * * *" };
