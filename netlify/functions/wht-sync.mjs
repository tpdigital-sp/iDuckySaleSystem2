// ⏰ Netlify scheduled function — ทุก 5 นาที: ดึงใบกำกับภาษี (เดือนนี้+เดือนก่อน) จาก FlowAccount เข้าหน้า /admin/wht ใบหัก FlowAcc (6 ต.ค. 69)
export default async () => {
  const key = process.env.CRON_SECRET;
  if (!key) return new Response("no CRON_SECRET", { status: 200 });
  const url = `${process.env.URL || "https://iduckystore.com"}/api/cron/wht-sync?key=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  return new Response(`wht-sync: ${res?.status ?? "fail"}`, { status: 200 });
};

export const config = { schedule: "*/5 * * * *" };
