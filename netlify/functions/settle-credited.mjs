// ⏰ Netlify scheduled function — ทุก 15 นาที: ใบที่เงินตรวจแล้วครบยอดบิลแต่สถานะยังค้าง "รอตรวจสอบ/รอชำระเงิน"
// (ยอดครบทีหลังจากการแก้ยอด ไม่ใช่ตอนตรวจสลิปสด) → ระบบปิดใบเป็นชำระแล้วให้เอง · ดู src/app/api/cron/settle-credited/route.ts
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/settle-credited?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`settle-credited: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "7,22,37,52 * * * *" };
