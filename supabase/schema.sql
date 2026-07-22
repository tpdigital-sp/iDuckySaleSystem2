-- ═══════════════════════════════════════════════════════════════
-- iDucky Prints Studio — Supabase schema (เฟส 1: สินค้า + ล็อกอินแอดมิน)
-- วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
--         จากนั้นวาง supabase/seed.sql → Run (นำเข้าสินค้า)
-- ═══════════════════════════════════════════════════════════════

-- ── ⚠️ ลบตารางเก่าจากการเริ่มทำครั้งก่อน (ผู้ใช้ยืนยันให้เริ่มใหม่) ──
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.proofs cascade;
drop table if exists public.customers cascade;
drop table if exists public.products cascade;

-- ── profiles: ผูกกับ auth.users เก็บบทบาท (admin/customer) + ข้อมูลสมาชิก ──
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

-- สร้าง profile อัตโนมัติเมื่อมีสมาชิกใหม่
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ตัวช่วยเช็คว่า user ปัจจุบันเป็นแอดมินไหม
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ── products: เก็บสินค้าแบบ JSONB (โครงตรงกับ TS Product) + คอลัมน์ที่ query บ่อย ──
create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null,
  price numeric not null default 0,
  sold int not null default 0,
  featured boolean not null default false,
  badge text,
  sort int not null default 0,
  data jsonb not null,                     -- Product เต็ม (options, rules, pricing, images, body, ...)
  updated_at timestamptz not null default now()
);
create index if not exists products_category_idx on public.products (category);

-- ── option_presets: คลังตัวเลือกกลาง (ชนิดกระดาษ, เคลือบ ฯลฯ) ใช้ซ้ำหลายสินค้า ──
create table if not exists public.option_presets (
  id text primary key,
  label text not null,
  data jsonb not null,                     -- OptionPreset เต็ม (id, label, choices, note)
  updated_at timestamptz not null default now()
);

-- ── RLS ──
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.option_presets enable row level security;

-- profiles: อ่าน/แก้ของตัวเอง, แอดมินอ่านได้หมด
drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (id = auth.uid());

-- products: ใครก็อ่านแคตตาล็อกได้ (public) — เขียนได้เฉพาะแอดมิน
drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products
  for select using (true);
drop policy if exists "products admin write" on public.products;
create policy "products admin write" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- option_presets: ใครก็อ่านได้ (หน้าร้านต้องใช้คลี่ตัวเลือก) — เขียนได้เฉพาะแอดมิน
drop policy if exists "option_presets public read" on public.option_presets;
create policy "option_presets public read" on public.option_presets
  for select using (true);
drop policy if exists "option_presets admin write" on public.option_presets;
create policy "option_presets admin write" on public.option_presets
  for all using (public.is_admin()) with check (public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- หลังรัน schema แล้ว: ตั้งให้บัญชีคุณเป็นแอดมิน
--   1) ไปที่ Authentication → Users → Add user (อีเมล+รหัสผ่านของคุณ)
--   2) รันคำสั่งนี้ (แทน your@email.com ด้วยอีเมลที่สร้าง):
-- update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'your@email.com');
-- ═══════════════════════════════════════════════════════════════
