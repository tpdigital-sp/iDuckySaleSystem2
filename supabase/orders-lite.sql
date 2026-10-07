-- 🪶 วิว orders_lite — ออเดอร์แบบเบาสำหรับหน้ารายงาน (7 ต.ค. 69) — รันครั้งเดียวใน Supabase SQL Editor
--
-- ทำไมต้องมี: /admin/reports ดึงออเดอร์ทั้งช่วงมาคิดยอด — ใบหนึ่ง jsonb ใหญ่ถึง 10–50 KB
-- เพราะ log (ประวัติแก้ 57%) + proofs/ลายในรายการ (29%) ซึ่งรายงานไม่ใช้เลย
-- วัดจริง 828 ใบ = 9.3 MB / 4.8 วิ → วิวนี้เหลือ ~1 MB (โค้ดไม่มีวิวก็ยังทำงาน แต่ตัดได้แค่ log)
--
-- โค้ดที่ใช้: src/lib/server/orders-lite.ts (fetchReportOrders ลองวิวก่อน ไม่มีค่อยถอยไปตาราง orders)
--
-- ปลอดภัย: วิวอ่านอย่างเดียว ไม่แตะข้อมูล · create or replace = รันซ้ำได้ · ไม่เอาก็ drop view ทิ้ง
-- 🔒 security_invoker = วิวใช้สิทธิ์ของคนเรียก → RLS ของ orders ยังคุม (anon ไม่มี policy = อ่านไม่ได้)
--    + revoke ซ้ำอีกชั้น ให้เหลือแค่ service role (ฝั่งเซิร์ฟเวอร์) เหมือนตาราง orders
--    (security_invoker ต้องการ Postgres 15+ — โปรเจกต์ Supabase ปัจจุบันเป็น 15/17 อยู่แล้ว)

create or replace view public.orders_lite
with (security_invoker = true) as
select
  o.id,
  o.created_at,
  (o.data->>'status') as status,
  -- ก้อนเบา: ตัด log + รูปแพ็ค/ปริ้นซ้ำ/โปรไฟล์ LINE ออก (รายการยังครบ — เผื่อจอที่ต้องเห็นลาย/proofs)
  (o.data - 'log' - 'packPhotos' - 'reprintPhotos' - 'lineProfile') as data,
  -- ก้อนรายงาน: เหมือนข้างบน + รายการเหลือแค่ ชื่อ/จำนวน/ราคา/ส่วนลดต่อบรรทัด (ตรงกับ REPORT_ITEM_KEYS ใน orders-lite.ts)
  (o.data - 'log' - 'packPhotos' - 'reprintPhotos' - 'lineProfile' - 'items')
    || jsonb_build_object(
      'items',
      coalesce(
        (
          select jsonb_agg(
            jsonb_strip_nulls(
              jsonb_build_object(
                'productId', it.e->'productId',
                'name', it.e->'name',
                'qty', it.e->'qty',
                'unitPrice', it.e->'unitPrice',
                'discount', it.e->'discount',
                'discountPct', it.e->'discountPct'
              )
            )
            order by it.n  -- คงลำดับรายการเดิม
          )
          from jsonb_array_elements(
            case when jsonb_typeof(o.data->'items') = 'array' then o.data->'items' else '[]'::jsonb end
          ) with ordinality as it(e, n)
        ),
        '[]'::jsonb
      )
    ) as data_report
from public.orders o;

revoke all on public.orders_lite from anon, authenticated;
