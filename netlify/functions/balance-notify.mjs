// ⏰ Netlify scheduled function — ทุก 5 นาที (25 ก.ย. 69 เดิม 10 · คิวสั้นลงเหลือ 5 นาที รอบต้องถี่ตาม ไม่งั้นจริง ๆ ยังช้าถึง 15): ออเดอร์ที่ยอดค้างขยับแล้วแอดมินไม่ได้กด 📣 แจ้งยอด → ระบบแจ้งให้เอง
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/balance-notify?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`balance-notify: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "*/5 * * * *" };
