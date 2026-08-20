-- ระบบรีวิว/ให้คะแนนสินค้า (เฟส 4 ของโซนบัญชีลูกค้า)
-- แยกจากตาราง ratings เดิมโดยเจตนา — ratings คือแบบสำรวจนิรนาม ห้ามผูกตัวตน
-- ส่วน reviews ระบุตัวตน (ยืนยันว่าซื้อจริง) และแสดงบนหน้าสินค้าหลังแอดมินตรวจ
-- รันไฟล์นี้ใน Supabase SQL Editor หนึ่งครั้ง

create table if not exists public.reviews (
  id text primary key,               -- เช่น RV-260820-1234
  data jsonb not null,               -- ตัวรีวิวทั้งก้อน (โครงสร้างอยู่ใน src/lib/reviews.ts)
  created_at timestamptz not null default now()
);

-- หน้าสินค้า = กรองด้วย productId · หน้า "รีวิวของฉัน" = กรองด้วย customerId
create index if not exists reviews_product_created_idx
  on public.reviews ((data->>'productId'), created_at desc);
create index if not exists reviews_customer_created_idx
  on public.reviews ((data->>'customerId'), created_at desc);

-- เปิด RLS แต่ไม่สร้าง policy = ปิดตายฝั่ง client (เข้าถึงผ่าน API service role เท่านั้น)
alter table public.reviews enable row level security;
