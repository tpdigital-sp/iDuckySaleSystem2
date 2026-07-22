/**
 * สร้าง supabase/seed.sql จากสินค้าใน src/lib/products.ts
 * รัน: npx tsx scripts/gen-seed-sql.ts
 * แล้วนำ supabase/seed.sql ไปวางใน Supabase SQL Editor (หลัง schema.sql)
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PRODUCTS } from "../src/lib/products";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const lines: string[] = [
  "-- iDucky Prints Studio — seed สินค้า (รันหลัง schema.sql)",
  "-- ล้างของเดิมก่อน (idempotent — รันซ้ำได้)",
  "delete from public.products;",
  "",
];

PRODUCTS.forEach((p, i) => {
  const json = JSON.stringify(p);
  lines.push(
    `insert into public.products (id,name,category,price,sold,featured,badge,sort,data) values (` +
      `${q(p.id)}, ${q(p.name)}, ${q(p.category)}, ${p.price}, ${p.sold}, ${p.featured ? "true" : "false"}, ` +
      `${p.badge ? q(p.badge) : "null"}, ${i}, $prod$${json}$prod$::jsonb);`
  );
});

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "seed.sql");
writeFileSync(out, lines.join("\n") + "\n");
console.log(`✅ เขียน supabase/seed.sql (${PRODUCTS.length} รายการ)`);
