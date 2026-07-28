-- ตารางประเมินความพึงพอใจ (นิรนาม) — รันใน Supabase SQL Editor 1 ครั้ง
-- หลักการนิรนาม: ไม่เก็บ orderId / ชื่อ / customerId / เวลาแบบละเอียด
--   เก็บแค่ คะแนน + แท็ก + คอมเมนต์ + "เดือน" (yyyy-mm) → โยงกลับหาลูกค้าไม่ได้
--   ฝั่งออเดอร์ติ๊กแค่ rated=true (กันประเมินซ้ำ) โดยไม่บันทึกคะแนน
-- RLS เปิดแต่ไม่มี policy = เข้าถึงได้เฉพาะ service role (ผ่าน API)

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  data jsonb not null
);

alter table public.ratings enable row level security;
-- ไม่สร้าง policy โดยเจตนา → anon อ่าน/เขียนตรงไม่ได้

notify pgrst, 'reload schema';
