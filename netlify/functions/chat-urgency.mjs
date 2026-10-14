// ⏰ Netlify scheduled function — ทุก 5 นาที: ห้องแชท LINE ที่ขยับใน 15 นาทีล่าสุด ให้ AI ติดป้ายความเร่งด่วน (🔴/🟡/🟢)
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/chat-urgency?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`chat-urgency: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "*/5 * * * *" };
