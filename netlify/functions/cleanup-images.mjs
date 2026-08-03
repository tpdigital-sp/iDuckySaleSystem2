// ⏰ Netlify scheduled function — ล้างรูปออเดอร์เก่าตามนโยบายในหน้าตั้งค่า (ทุกวัน 03:30 ไทย = 20:30 UTC)
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/cleanup-images?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  const body = await res?.text().catch(() => "");
  return new Response(`cleanup-images: ${res?.status ?? "fail"} ${body.slice(0, 200)}`, { status: 200 });
};

export const config = { schedule: "30 20 * * *" };
