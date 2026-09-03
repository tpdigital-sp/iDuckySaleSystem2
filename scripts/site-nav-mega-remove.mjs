#!/usr/bin/env node
/**
 * ลบแถบเมกะเมนูหน้าร้าน (DIGITAL PRINT / SIMPLE GIFTS / …) ออกถาวร
 * ผู้ใช้สั่ง 2 ก.ย. 69 (ตอนแรกให้ซ่อนชั่วคราว แล้วเปลี่ยนเป็นลบเลย)
 *
 *   node scripts/site-nav-mega-remove.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/site-nav-mega-remove.mjs --write   # ลบจริง (สำรองของเดิมลง backups/ ก่อนเสมอ)
 *
 * ตั้ง data.nav.mega ของแถว __site_nav__ เป็น [] — siteNavOf ถือว่า
 * "อาร์เรย์ว่าง = ตั้งใจไม่เอา" จึงไม่ดึง DEFAULT_MEGA ในโค้ดกลับมาแสดง
 * อยากได้เมนูคืน: กู้จากไฟล์ใน backups/ หรือสร้างใหม่ที่ /admin/nav
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const NAV_ID = "__site_nav__";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: navRow, error } = await sb.from("products").select("id,data").eq("id", NAV_ID).single();
if (error) throw error;
const nav = structuredClone(navRow.data?.nav ?? {});
const mega = Array.isArray(nav.mega) ? nav.mega : [];

if (!mega.length) {
  console.log("mega ว่างอยู่แล้ว — ไม่มีอะไรต้องลบ");
  process.exit(0);
}
for (const g of mega) console.log(`  จะลบ  ${g.label} (${(g.columns ?? []).length} คอลัมน์)`);

if (!WRITE) {
  console.log(`\nจะลบ ${mega.length} หัวข้อ — ยังไม่ได้บันทึก ใส่ --write เพื่อลบจริง`);
  process.exit(0);
}

mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const bak = new URL(`../backups/site-nav-before-${stamp}.json`, import.meta.url);
writeFileSync(bak, JSON.stringify(navRow.data, null, 1));
console.log(`\nสำรองของเดิมไว้ที่ backups/site-nav-before-${stamp}.json`);

nav.mega = [];
const { error: e2 } = await sb.from("products").update({ data: { ...navRow.data, nav } }).eq("id", NAV_ID);
if (e2) throw e2;
console.log(`ลบเมกะเมนู ${mega.length} หัวข้อออกจาก __site_nav__ เรียบร้อย`);
