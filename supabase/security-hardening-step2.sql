-- ═══════════════════════════════════════════════════════════════
-- 🔒 ปิดช่องโหว่ RLS ขั้นที่ 2 (ข้อ 3-4 · เจ้าของร้านเคาะ 8 ต.ค. 69) — ขั้นที่ 1 รันไปแล้ว
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
-- ไม่แตะข้อมูลสักแถว เปลี่ยนแค่ "ใครอ่านแถวไหนได้" · รันซ้ำได้
--
-- ⚠️ หลังรัน เปิดหน้าแรก · หน้าสินค้าสักตัว · ตะกร้า · หน้าสินค้าในหลังบ้าน ดูหนึ่งรอบ
--    ถ้าอะไรหาย = แถวตั้งค่าที่หน้าเว็บอ่านผ่าน anon ไม่อยู่ใน allowlist ด้านล่าง → เติม id/category แล้วรันใหม่
--    ย้อนกลับทั้งหมด:  create policy "products public read" on public.products for select using (true);
-- ═══════════════════════════════════════════════════════════════

-- ── 3) products: แถวตั้งค่าระบบ (id ขึ้นต้น "__") เคยอ่านได้สาธารณะทั้งหมด ──
-- ปิด: __dealers__ · __user_perms__ · __role_perms__ · __contact_link_undo__ · __line_alert__ · __line_sources__
--      __answer_folders__ · __special_products__ · __pricelist_done__ (เซิร์ฟเวอร์อ่านด้วย service role ทั้งหมด)
-- เปิดต่อ (หน้าเว็บอ่านผ่าน anon จริง — ไล่โค้ดยืนยัน 8 ต.ค. 69):
--   คลังตัวเลือก __presets__ · เทมเพลต __templates__ + __template_cats__ · ตั้งค่าร้าน __shop_payment__
--   หมวดสินค้า __categories__ · บทความ __articles__ · เมนู/แบนเนอร์/จุดเชียร์ขาย (เผื่อไว้ — เป็นเนื้อหาสาธารณะอยู่แล้ว)
drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products
  for select using (
    id not like '\_\_%' escape '\'
    or category in ('__presets__', '__templates__', '__categories__', '__articles__')
    or id in ('__template_cats__', '__shop_payment__', '__categories__', '__site_nav__', '__promo_banners__', '__spotlight__')
  );

-- ── 4) price_links: เซิร์ฟเวอร์อ่านให้อยู่แล้ว — ไม่ต้องเปิด anon ──
drop policy if exists "price_links public read" on public.price_links;

-- ── ตรวจผล: products ต้องมี policy เดียวและ qual ต้องมี "not like" · price_links เหลือ "price_links service write" ──
select tablename, policyname, cmd, left(qual, 60) as qual
from pg_policies
where schemaname = 'public' and tablename in ('products', 'price_links')
order by 1, 2;
