-- ตารางคูปอง (รันใน Supabase SQL Editor เหมือนตอนสร้าง orders)
-- เก็บเป็น jsonb ต่อ 1 โค้ด · RLS เปิดแต่ไม่มี policy = เข้าถึงได้เฉพาะ service role (ผ่าน API)
-- กันคนอ่าน/เดาโค้ดคูปองผ่าน anon key
--
-- ⚠️ มีตาราง coupons เวอร์ชันเก่า (แยกคอลัมน์) ค้างอยู่ก่อนแล้ว — drop ทิ้งก่อน
--    (ยืนยันแล้วว่าไม่มีโค้ดไหนใช้ และ 2 แถวในนั้น redeem ไม่ได้อยู่แล้ว)
drop table if exists public.coupons cascade;

create table public.coupons (
  code text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.coupons enable row level security;
-- ไม่สร้าง policy โดยเจตนา → anon/ผู้ใช้ทั่วไปเข้าไม่ได้ · ทุกอย่างผ่าน API (service role)

-- บอก PostgREST ให้รีโหลด schema ทันที (ไม่ต้องรอ cache)
notify pgrst, 'reload schema';
