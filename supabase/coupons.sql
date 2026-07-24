-- ตารางคูปอง (รันใน Supabase SQL Editor เหมือนตอนสร้าง orders)
-- เก็บเป็น jsonb ต่อ 1 โค้ด · RLS เปิดแต่ไม่มี policy = เข้าถึงได้เฉพาะ service role (ผ่าน API)
-- กันคนอ่าน/เดาโค้ดคูปองผ่าน anon key

create table if not exists public.coupons (
  code text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.coupons enable row level security;
-- ไม่สร้าง policy โดยเจตนา → anon/ผู้ใช้ทั่วไปเข้าไม่ได้ · ทุกอย่างผ่าน API (service role)
