-- ประวัติเวอร์ชันสินค้า — API หลังบ้านเก็บ "ข้อมูลก่อนถูกเขียนทับ/ลบ" ทุกครั้งที่บันทึก
-- ที่มา: กลุ่มตัวเลือกเคยหายจากการบันทึกทับ (เคลือบเรซิ่น กริ๊บต๊อก · งานปัก เสื้อ) แล้วไม่มีทางกู้
-- รันไฟล์นี้ใน Supabase SQL Editor ครั้งเดียว — ยังไม่รัน ระบบก็บันทึกสินค้าได้ปกติ แค่ไม่มีประวัติ
--
-- ดู/กู้คืน: node scripts/product-revisions.mjs <product-id>

create table if not exists product_revisions (
  id bigint generated always as identity primary key,
  product_id text not null,
  data jsonb not null,                          -- ข้อมูลสินค้า (คอลัมน์ data) เวอร์ชันก่อนถูกทับ
  action text not null default 'save',          -- save = ถูกบันทึกทับ · delete = สำเนาสุดท้ายก่อนลบสินค้า
  editor text,                                  -- username คนที่กดบันทึก (คนที่ "ทับ" เวอร์ชันนี้)
  editor_name text,
  replaced_at timestamptz not null default now()
);

create index if not exists product_revisions_product_idx
  on product_revisions (product_id, id desc);

-- อ่าน/เขียนได้เฉพาะ service role (API หลังบ้าน) — ไม่เปิด policy ให้ฝั่งลูกค้าเลย
alter table product_revisions enable row level security;
