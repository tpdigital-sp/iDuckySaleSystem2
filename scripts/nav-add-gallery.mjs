/**
 * 📸 เพิ่มเมนู "ผลงาน" (/gallery) ลงเมนูที่บันทึกไว้ในฐาน (products.__site_nav__) ต่อจาก "สินค้าขายดี"
 *
 * เมนูบนเว็บจริงอ่านจากฐาน ไม่ใช่ DEFAULT_MENU ในโค้ด → แก้โค้ดอย่างเดียวเมนูไม่ขึ้น
 * ⚠️ รันหลัง deploy หน้า /gallery แล้วเท่านั้น (ไม่งั้นลูกค้ากดเมนูแล้วเจอ 404)
 * แก้ data.nav.menu อย่างเดียว ส่วนอื่นของแถวคงเดิม · มีเมนู /gallery อยู่แล้ว = ไม่ทำอะไร
 *
 *   node scripts/nav-add-gallery.mjs          # ดูก่อน (ไม่เขียน)
 *   node scripts/nav-add-gallery.mjs --apply  # เขียนจริง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const apply = process.argv.includes("--apply");

const { data: row, error } = await sb.from("products").select("data").eq("id", "__site_nav__").single();
if (error) throw error;
const menu = row.data?.nav?.menu;
if (!Array.isArray(menu) || !menu.length) {
  console.log("ฐานยังไม่มีเมนูที่บันทึก → ใช้ DEFAULT_MENU ในโค้ด (มี ผลงาน แล้ว) ไม่ต้องทำอะไร");
  process.exit(0);
}
if (menu.some((l) => l.href === "/gallery" || l.id === "gallery")) {
  console.log("มีเมนู ผลงาน อยู่แล้ว:", menu.map((l) => l.label).join(" · "));
  process.exit(0);
}
const at = menu.findIndex((l) => l.id === "bestseller" || l.href === "/#bestseller");
const next = [...menu];
next.splice(at >= 0 ? at + 1 : Math.min(2, next.length), 0, { id: "gallery", label: "ผลงาน", href: "/gallery", hidden: false });
console.log("ก่อน:", menu.map((l) => l.label).join(" · "));
console.log("หลัง:", next.map((l) => l.label).join(" · "));
if (!apply) {
  console.log("(ยังไม่เขียน — ใส่ --apply)");
  process.exit(0);
}
const { error: e2 } = await sb
  .from("products")
  .update({ data: { ...row.data, nav: { ...row.data.nav, menu: next } } })
  .eq("id", "__site_nav__");
if (e2) throw e2;
console.log("✅ บันทึกแล้ว (เว็บจริงเห็นภายใน ~1 นาที ตามแคช /api/nav)");
