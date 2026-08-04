-- ใบเสนอราคา (Quotation) — แยกจากตาราง orders เพื่อไม่ให้ปนคิวงานจริง
-- รันใน Supabase → SQL Editor ครั้งเดียว
create table if not exists public.quotes (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- ลูกค้าเปิดดูใบเสนอราคาของตัวเองผ่านลิงก์ที่มี key (ตรวจ key ในโค้ดอีกชั้น)
alter table public.quotes enable row level security;

drop policy if exists "quotes public read" on public.quotes;
create policy "quotes public read" on public.quotes for select using (true);

-- เขียนได้เฉพาะ service role (หลังบ้าน) — ไม่เปิดให้ anon
drop policy if exists "quotes service write" on public.quotes;
create policy "quotes service write" on public.quotes for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create index if not exists quotes_created_at_idx on public.quotes (created_at desc);
