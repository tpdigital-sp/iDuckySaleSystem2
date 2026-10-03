#!/usr/bin/env node
/**
 * 🧢 หมวกแก๊ป: ไม่โชว์บรรทัด "สเปคเรท" ในตะกร้า (Product.hideRateSpecInCart = true)
 * คำอธิบายเรท (พิมพ์ DTF | FLEX / งานปัก) เป็นคำโฆษณา ไม่ใช่สเปคงาน — เจ้าของร้านสั่ง 3 ต.ค. 69
 *
 *   node scripts/cap-hide-rate-spec.mjs           (dry-run)
 *   node scripts/cap-hide-rate-spec.mjs --apply
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const { data: rows, error } = await sb.from("products").select("id,name,data").eq("name", "หมวกแก๊ป");
if (error) throw error;
if (rows.length !== 1) throw new Error(`เจอหมวกแก๊ป ${rows.length} แถว (ต้อง 1)`);
const row = rows[0];
console.log(row.id, row.name, "hideRateSpecInCart =", row.data.hideRateSpecInCart ?? "(ไม่มี)");
if (!APPLY) process.exit(0);
const data = { ...row.data, hideRateSpecInCart: true };
const { data: out, error: e2 } = await sb.from("products").update({ data }).eq("id", row.id).select("data");
if (e2) throw e2;
if (out?.[0]?.data?.hideRateSpecInCart !== true) throw new Error("เขียนไม่ลง");
const { data: back } = await sb.from("products").select("data").eq("id", row.id).single();
if (back.data.hideRateSpecInCart !== true) throw new Error("อ่านกลับแล้วไม่ตรง");
console.log("✓ ตั้งแล้ว");
