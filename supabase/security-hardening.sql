-- ═══════════════════════════════════════════════════════════════
-- 🔒 ปิดช่องโหว่ RLS (ตรวจความปลอดภัย 8 ต.ค. 69)
-- วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run  (รันซ้ำได้ ไม่พัง)
--
-- anon key อยู่ในโค้ดหน้าเว็บ ใครก็หยิบไปยิง REST ของ Supabase ตรง ๆ ได้ — นโยบาย RLS จึงเป็นด่านจริง
-- ═══════════════════════════════════════════════════════════════

-- ── 1) profiles: ลูกค้าเคยแก้ role ของตัวเองเป็น 'admin' ได้ ──────────────────────────────
-- policy "profiles update own" ไม่ได้ล็อกคอลัมน์ → สมาชิกที่ล็อกอินอยู่ update role='admin' ให้ตัวเอง
-- → is_admin() เป็นจริง → policy "products admin write" ปล่อยให้เขียนตาราง products ทั้งตาราง
--   (รวมแถว __shop_payment__ = เลขบัญชีรับโอนของร้าน · __role_perms__ · __dealers__ · ราคาสินค้า)
-- แก้: ถอดสิทธิ์ update คอลัมน์ role ออกจาก anon/authenticated (service role ยังแก้ได้)
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- ── 2) products / option_presets: ไม่มีทางไหนในเว็บเขียนผ่าน anon key เลย (ทุกการเขียนผ่าน service role หลัง requirePerm) ──
-- policy เขียนด้วย is_admin() จึงเป็นประตูที่ไม่มีใครใช้ แต่เปิดทิ้งไว้ = ความเสี่ยงข้อ 1 — ปิดถาวร
drop policy if exists "products admin write" on public.products;
drop policy if exists "option_presets admin write" on public.option_presets;

-- ── 3) products: แถวตั้งค่าระบบ (id ขึ้นต้น "__") เคยอ่านได้สาธารณะทั้งหมด ──────────────────
-- รั่ว: __dealers__ (ทะเบียนตัวแทน+ใบสมัคร) · __user_perms__/__role_perms__ (ชื่อผู้ใช้พนักงาน+สิทธิ์)
--      __contact_link_undo__ (สำเนาการ์ดผู้ติดต่อ = ชื่อ/เบอร์/ที่อยู่ลูกค้า) · __line_alert__ (token เข้ารหัส+เลขห้อง)
--      __line_sources__ · __answer_folders__ (path ใน NAS) · __special_products__ · __pricelist_done__ ฯลฯ
-- หน้าร้านอ่านผ่าน anon จริงแค่: สินค้า · __presets__ · __templates__ · __template_cats__ · __shop_payment__
-- (ตั้งค่าร้านที่ลูกค้าต้องเห็นอยู่แล้ว: บัญชีโอน/วิธีส่ง/ของแถม/ระดับสมาชิก) — นอกนั้นเซิร์ฟเวอร์อ่านด้วย service role
drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products
  for select using (
    id not like '\_\_%' escape '\'
    or category in ('__presets__', '__templates__', '__categories__', '__articles__')
    or id in ('__template_cats__', '__shop_payment__', '__categories__', '__site_nav__', '__promo_banners__', '__spotlight__')
  );

-- ── 4) quotes: เคยอ่านได้สาธารณะทั้งตาราง ────────────────────────────────────────────────
-- ใบเสนอราคามี ชื่อ/เบอร์/ที่อยู่/อีเมลลูกค้า + key ของลิงก์ → ดึงทั้งตารางแล้วเปิด/กด "ตกลง" แทนลูกค้าได้ทุกใบ
-- หน้าเว็บไม่ได้อ่านตารางนี้ผ่าน anon เลย (/api/quotes/[id] อ่านด้วย service role + ตรวจ key) — ปิด
drop policy if exists "quotes public read" on public.quotes;

-- ── 5) price_links: เซิร์ฟเวอร์อ่านให้อยู่แล้ว (service role) — ไม่ต้องเปิด anon ──────────────
drop policy if exists "price_links public read" on public.price_links;

-- ── ตรวจผล ──
-- select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2;
