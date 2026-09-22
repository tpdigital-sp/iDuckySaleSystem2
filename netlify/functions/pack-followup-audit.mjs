// ⏰ Netlify scheduled function — ทุกชั่วโมง กวาดการ์ดที่ค้างในหน้า "ติดตามของ iDucky" (TP-Leader)
// ทั้งที่ออเดอร์ปักว่าของมาครบ/ส่งของไปแล้ว → ปิดให้เอง
// ดู src/app/api/cron/pack-followup-audit/route.ts
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/pack-followup-audit?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`pack-followup-audit: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "40 * * * *" };
