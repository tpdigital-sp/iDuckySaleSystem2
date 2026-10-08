-- ═══════════════════════════════════════════════════════════════
-- 🔒 ปิดช่องโหว่ RLS ขั้นที่ 1 (เจ้าของร้านเคาะ 8 ต.ค. 69: ทำข้อ 1-2 ก่อน)
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
-- ไม่แตะข้อมูลสักแถว เปลี่ยนแค่นโยบายอ่าน/เขียน · รันซ้ำได้ · หน้าร้านไม่กระทบ
-- (หน้าเว็บไม่เคยเขียน products ผ่าน anon และไม่เคยอ่าน quotes ผ่าน anon)
-- ฉบับเต็ม (ข้อ 3-4) อยู่ที่ security-hardening.sql — ค่อยรันทีหลัง
-- ═══════════════════════════════════════════════════════════════

-- ── 1) ลูกค้าที่ล็อกอินแก้ profiles.role ของตัวเองเป็น 'admin' ได้ → is_admin() จริง → เขียนตาราง products ทั้งตาราง ──
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- ปิดประตูเขียน products / option_presets ผ่าน anon ถาวร (ทุกการเขียนจริงผ่าน service role หลัง requirePerm อยู่แล้ว)
drop policy if exists "products admin write" on public.products;
-- (ตาราง option_presets ไม่มีในฐานจริง — ติดตั้งด้วย setup.sql · ถ้ามีค่อยรัน: drop policy if exists "option_presets admin write" on public.option_presets;)

-- ── 2) ใบเสนอราคาอ่านได้สาธารณะทั้งตาราง (ชื่อ/เบอร์/ที่อยู่/อีเมล/key) ──
drop policy if exists "quotes public read" on public.quotes;

-- ── ตรวจผล: ควรเหลือ products = "products public read" อย่างเดียว · quotes = "quotes service write" อย่างเดียว ──
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('products', 'quotes', 'profiles')
order by 1, 2;
