// 📦 โปสเตอร์แขวนผนัง (uv-2) ไม่คิดค่ากล่อง — 7 ก.ย. 69 ใส่ excludeIds ผิดไอดี ("wall-poster-hang" = ไอดีสินค้าตัวอย่างในโค้ด ไม่มีในฐาน)
// ของจริงในฐานคือ uv-2 → keyword A3 ในกลุ่ม "ขนาด" ยังจับอยู่ (20 ต.ค. 69)
// ใช้: node scripts/box-fee-exclude-uv2.mjs [--apply]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const apply = process.argv.includes("--apply");
const { data: row, error } = await sb.from("products").select("id,data").eq("id","__shop_payment__").single();
if (error) throw error;
const fees = row.data?.boxFees ?? [];
const next = fees.map((f) => f.id !== "box-a3" ? f : {
  ...f,
  productIds: (f.productIds ?? []).filter((x) => x !== "uv-2"),
  excludeIds: [...new Set([...(f.excludeIds ?? []).filter((x) => x !== "wall-poster-hang"), "uv-2"])],
});
console.log("ก่อน:", JSON.stringify(fees.map(f=>({id:f.id,productIds:f.productIds,excludeIds:f.excludeIds}))));
console.log("หลัง:", JSON.stringify(next.map(f=>({id:f.id,productIds:f.productIds,excludeIds:f.excludeIds}))));
if (!apply) { console.log("(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึก)"); process.exit(0); }
mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
writeFileSync(new URL("../backups/shop-payment-boxfees-2026-10-20.json", import.meta.url), JSON.stringify(row.data.boxFees, null, 2));
const { error: e2 } = await sb.from("products").update({ data: { ...row.data, boxFees: next } }).eq("id","__shop_payment__");
if (e2) throw e2;
console.log("✅ บันทึกแล้ว");
