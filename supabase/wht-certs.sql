-- 🧾 ใบหัก ณ ที่จ่าย (50 ทวิ) ต่อใบกำกับภาษี FlowAccount — หน้า /admin/wht
-- แพตเทิร์นเดียวกับ orders: id + data jsonb ทั้งก้อน · เข้าถึงผ่าน API (service role) เท่านั้น
-- รันไฟล์นี้ใน Supabase SQL Editor หนึ่งครั้ง
--
-- id = เลขใบกำกับภาษี เช่น INV007654 · โครงสร้าง data อยู่ใน src/lib/wht.ts
-- ⚠️ มีเลขบัญชีโอนคืนของลูกค้า → ห้ามเปิด policy select ให้ anon (ต่างจาก products ที่อ่าน public ได้)

create table if not exists public.wht_certs (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- เปิดหน้าตามเดือน = กรอง data->>'month' (YYYY-MM)
create index if not exists wht_certs_month_idx on public.wht_certs ((data->>'month'));

-- เปิด RLS แต่ไม่สร้าง policy = ปิดตายฝั่ง client ทุกทาง (service role ข้าม RLS ได้อยู่แล้ว)
alter table public.wht_certs enable row level security;
