-- ตาราง orders (ออเดอร์จริง) — รันครั้งเดียวใน Supabase SQL Editor
-- RLS เปิดแต่ไม่มี policy = เข้าถึงได้เฉพาะ service role (ผ่าน API ฝั่งเซิร์ฟเวอร์)
-- = ปลอดภัย เพราะมีข้อมูลส่วนตัวลูกค้า (ชื่อ/เบอร์/ที่อยู่) ห้ามให้ anon อ่าน

create table if not exists public.orders (
  id text primary key,                          -- เลขออเดอร์ เช่น OD-260721-1234
  data jsonb not null,                          -- Order เต็ม (ลูกค้า/ที่อยู่/รายการ/สถานะ)
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
-- (ไม่ต้องสร้าง policy — service role bypass RLS อยู่แล้ว)
-- เฟสสมาชิก: จะเพิ่ม customer_id + policy ให้ลูกค้าอ่านออเดอร์ของตัวเองภายหลัง
