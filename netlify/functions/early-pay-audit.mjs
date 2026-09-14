// ⏰ Netlify scheduled function — ตรวจทุกเช้า 10:30 ไทย (03:30 UTC) ว่ามีใบไหน "ควรได้ส่วนลดโอนไวแต่ไม่ได้"
// เจอแล้วยิงเข้าไลน์ร้าน (ดู src/app/api/cron/early-pay-audit/route.ts)
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/early-pay-audit?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`early-pay-audit: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "30 3 * * *" };
