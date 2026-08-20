-- ระบบแจ้งปัญหา / เคลมสินค้า (เฟส 3 ของโซนบัญชีลูกค้า)
-- แพตเทิร์นเดียวกับ orders: id + data jsonb ทั้งก้อน · เข้าถึงผ่าน API (service role) เท่านั้น
-- รันไฟล์นี้ใน Supabase SQL Editor หนึ่งครั้ง

create table if not exists public.claims (
  id text primary key,               -- เช่น CL-260820-1234
  data jsonb not null,               -- ตัวเคลมทั้งก้อน (โครงสร้างอยู่ใน src/lib/claims.ts)
  created_at timestamptz not null default now()
);

-- ลูกค้าเปิดหน้า "เคลมของฉัน" = กรองด้วย customerId เรียงใหม่สุดก่อน
create index if not exists claims_customer_created_idx
  on public.claims ((data->>'customerId'), created_at desc);

-- เปิด RLS แต่ไม่สร้าง policy = ปิดตายฝั่ง client ทุกทาง (service role ข้าม RLS ได้อยู่แล้ว)
alter table public.claims enable row level security;
