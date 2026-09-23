// ⏰ Netlify scheduled function — เรียกทุกเช้า 09:40 ไทย (02:40 UTC) ให้สินค้าที่เพิ่งเพิ่มมีที่อยู่ในคลังสต๊อก
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/stock-cover?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`stock-cover: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "40 2 * * *" };
