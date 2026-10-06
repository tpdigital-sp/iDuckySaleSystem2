/**
 * ผ้าแขวนผนัง (fabric-poster) — ตั้ง Product.workSize ให้ใบงานมีบรรทัด "ขนาด" (6 ต.ค. 69 · OD-261002-7431)
 * ตัดเต็มหลา/สั่งทำพิเศษไม่มีกลุ่มขนาดใน sel → การ์ดออเดอร์/ใบงาน/คิวกราฟฟิกไม่บอกขนาดเลย
 * withWorkSize เติมให้เฉพาะรายการที่ไม่มีบรรทัดขนาด — ตัดแบ่งตามขนาดมีขนาดชิ้นงานของตัวเองอยู่แล้ว ไม่ซ้ำ
 *
 * ดูเฉย ๆ:  node scripts/fabric-poster-work-size.mjs
 * เขียนจริง: node scripts/fabric-poster-work-size.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "fabric-poster";
const SIZE = "1 หลา = 140 × 90 ซม. (หน้าผ้า 140 ซม.)";

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

const { data, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const d = data.data;
console.log(`workSize: ${JSON.stringify(d.workSize ?? null)} → ${JSON.stringify(SIZE)}`);
if (d.workSize === SIZE) process.exit(0);
if (!WRITE) {
  console.log("(dry-run — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
d.workSize = SIZE;
d.savedAt = new Date().toISOString();
const { data: rows, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) throw e2;
if (rows?.[0]?.data?.workSize !== SIZE) throw new Error("เขียนไม่ลง — อ่านกลับมาไม่ตรง");
console.log("✓ บันทึกแล้ว");
