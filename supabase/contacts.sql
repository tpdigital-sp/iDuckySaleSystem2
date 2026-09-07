-- คลังผู้ติดต่อ (นำเข้าจาก backoffice.casedesign2u.com — รายชื่อลูกค้าร้านเดิม ~28,000 ราย)
-- แพตเทิร์นเดียวกับ orders/product_claims: id + data jsonb ทั้งก้อน · เข้าถึงผ่าน API (service role) เท่านั้น
-- รันไฟล์นี้ใน Supabase SQL Editor หนึ่งครั้ง (รันซ้ำได้ ไม่ทำลายข้อมูล)
-- แล้วนำเข้าข้อมูลจากหน้า หลังบ้าน › ลูกค้า & การตลาด › ข้อมูลผู้ติดต่อ › นำเข้า

create table if not exists public.contacts (
  id text primary key,               -- รหัสผู้ติดต่อจากระบบเดิม เช่น "28473" (รายใหม่ในระบบนี้ต่อเลขจากเดิม)
  data jsonb not null,               -- { name, phone, address, email, point, rank, rankStatus, rankExpiry, customerType, note, source, importedAt, updatedAt }
  created_at timestamptz not null default now()
);

-- เลขลำดับสำหรับเรียง "ใหม่สุดก่อน" (id เป็น text เรียงตรง ๆ จะได้ 9 > 28473)
alter table public.contacts
  add column if not exists num bigint generated always as (case when id ~ '^\d+$' then id::bigint else null end) stored;

create index if not exists contacts_num_idx on public.contacts (num desc);
create index if not exists contacts_name_idx on public.contacts ((data->>'name'));
create index if not exists contacts_phone_idx on public.contacts ((data->>'phone'));

-- ปิดการเข้าถึงตรงจากฝั่งลูกค้า (anon) — อ่าน/เขียนผ่าน service role ใน API route เท่านั้น
alter table public.contacts enable row level security;

-- ประวัติคะแนนสะสม (นำเข้าจาก backoffice › ประวัติการสะสมคะแนน ของแต่ละราย) — service role เท่านั้น
create table if not exists public.contact_points (
  id text primary key,                 -- "<contact_id>:<ลำดับ>"
  contact_id text not null,
  data jsonb not null,                 -- { at, action, point, orderId, note }
  created_at timestamptz not null default now()
);
create index if not exists contact_points_contact_idx on public.contact_points (contact_id);
alter table public.contact_points enable row level security;
