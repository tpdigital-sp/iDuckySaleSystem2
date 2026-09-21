-- ⚡ ดัชนีลดการอ่านดิสก์ของตาราง orders (21 ก.ย. 69) — รันครั้งเดียวใน Supabase SQL Editor
--
-- ทำไมต้องมี: Supabase ส่งเมลเตือน "Disk IO Budget กำลังจะหมด"
-- ต้นเหตุ = คิวรีที่กรองด้วย data->>'...' ทุกตัวต้อง **สแกนทั้งตาราง** แล้ว "แกะ jsonb ออกจาก TOAST ทีละใบ"
-- เพื่อดูค่าฟิลด์เดียว (ออเดอร์ใบหนึ่งใหญ่ได้ถึง 56 KB เพราะ log/proofs) — อ่านดิสก์เปล่า ๆ ทั้งตาราง
-- cron 2 ตัวยิงทุก 10 และ 15 นาทีตลอด 24 ชม. + หน้าแอดมินโพลทุก 15 วิ = ดิสก์ทำงานไม่ได้พัก
--
-- มีดัชนีแล้ว Postgres กระโดดไปอ่านเฉพาะใบที่ตรงเงื่อนไข ไม่ต้องแตะ jsonb ของใบที่ไม่เกี่ยว
-- (ค่าที่ใช้ทำดัชนีเป็นข้อความสั้น ๆ เก็บแยกจากก้อน jsonb)
--
-- ปลอดภัย: สร้างดัชนีอย่างเดียว ไม่แตะข้อมูล · if not exists = รันซ้ำได้ · ไม่เอาก็ drop index ทิ้งได้
-- ⚠️ ห้ามใส่ concurrently ใน Supabase SQL Editor — มันห่อทุกคำสั่งไว้ใน transaction ให้เอง
--    จะได้ ERROR 25001 "CREATE INDEX CONCURRENTLY cannot run inside a transaction block" (เจอจริง 21 ก.ย. 69)
--    ตารางแค่ ~500 ใบ ล็อกไม่ถึงวินาที · ถ้าวันหน้าตารางใหญ่จนต้องเลี่ยงล็อก ให้ต่อ psql แล้วค่อยใส่ concurrently

-- สถานะออเดอร์ — cron แจ้งแบบงาน (ทุก 10 นาที), cron เก็บตกเงินเข้า (ทุก 15 นาที),
-- คิวโฟลเดอร์ผลิต, ปิดงานอัตโนมัติ ทุกตัวกรองด้วยฟิลด์นี้
create index if not exists orders_status_idx
  on public.orders ((data->>'status'));

-- เข็มเวลาบันทึกล่าสุด — หน้าแอดมินโพลถามว่า "มีใบไหนเปลี่ยนหลังเวลานี้บ้าง" ทุก 15 วินาที
create index if not exists orders_saved_at_idx
  on public.orders ((data->>'savedAt'));

-- เรียง/กรองตามวันที่สร้าง — สแกนย้อนหลัง N วัน (ส่วนลดโอนไว, สะพาน TP) + ลิสต์ทุกหน้าเรียงด้วยคอลัมน์นี้
create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

-- ใบมัดจำที่ยังเก็บเงินไม่ครบ — cron ทวงยอดคงเหลือทุกเช้า (ดัชนีบางส่วน เล็กมาก)
create index if not exists orders_deposit_open_idx
  on public.orders ((data->'deposit'->>'firstPaidAt'))
  where (data->'deposit'->>'settledAt') is null;

-- กันสลิปซ้ำ — ทุกครั้งที่ลูกค้าอัปสลิปจะถามว่า "hash/transRef นี้เคยใช้ในใบไหนหรือยัง" (data->payments @> ...)
create index if not exists orders_payments_gin
  on public.orders using gin ((data->'payments') jsonb_path_ops);

-- ── ตรวจผลหลังรัน ────────────────────────────────────────────────────────
-- ดัชนีที่มีอยู่ + ขนาด
--   select indexname, pg_size_pretty(pg_relation_size(indexrelid)) as size
--   from pg_indexes join pg_stat_user_indexes using (indexrelid)
--   where tablename = 'orders';
--
-- พิสูจน์ว่าคิวรีเลิกสแกนทั้งตาราง (ควรขึ้น "Index Scan using orders_status_idx" ไม่ใช่ "Seq Scan")
--   explain analyze select id from public.orders where data->>'status' in ('รอตรวจแบบ','แก้ไขแบบ');
--
-- นับว่าดัชนีถูกใช้จริงกี่ครั้ง (idx_scan ควรเพิ่มขึ้นเรื่อย ๆ)
--   select indexrelname, idx_scan from pg_stat_user_indexes where relname = 'orders';
