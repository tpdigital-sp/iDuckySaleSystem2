-- ลิงก์ราคา (/p/<code>) — แอดมินตั้งสเปคที่หน้าสินค้าแล้วส่งลิงก์สั้นให้ลูกค้าแทน screenshot
-- รันใน Supabase → SQL Editor ครั้งเดียว
create table if not exists public.price_links (
  code       text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- ลูกค้าเปิดการ์ดราคาของตัวเองได้ (โค้ดสุ่ม 5 หลักคือกุญแจ) — ฝั่งเซิร์ฟเวอร์อ่านให้อยู่แล้ว
alter table public.price_links enable row level security;

drop policy if exists "price_links public read" on public.price_links;
create policy "price_links public read" on public.price_links for select using (true);

-- เขียนได้เฉพาะ service role (หลังบ้าน) — ไม่เปิดให้ anon
drop policy if exists "price_links service write" on public.price_links;
create policy "price_links service write" on public.price_links for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create index if not exists price_links_created_at_idx on public.price_links (created_at desc);
