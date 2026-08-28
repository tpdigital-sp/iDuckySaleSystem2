#!/usr/bin/env node
/**
 * ดู/กู้คืนประวัติเวอร์ชันสินค้า (ตาราง product_revisions — สร้างด้วย supabase/product-revisions.sql)
 *
 *   node scripts/product-revisions.mjs <product-id>                    # ลิสต์ประวัติของสินค้า
 *   node scripts/product-revisions.mjs <product-id> --show <rev-id>    # ดูกลุ่มตัวเลือกของเวอร์ชันนั้น
 *   node scripts/product-revisions.mjs <product-id> --diff <rev-id>    # เทียบกลุ่ม/ฟิลด์หลักกับข้อมูลปัจจุบัน
 *   node scripts/product-revisions.mjs <product-id> --restore <rev-id>           # ซ้อมกู้ (ไม่เขียน)
 *   node scripts/product-revisions.mjs <product-id> --restore <rev-id> --write   # กู้จริง
 *
 * การกู้จะเก็บข้อมูลปัจจุบันลงประวัติก่อนเสมอ (กู้แล้วเปลี่ยนใจ ย้อนกลับได้อีก)
 * และอัปเดตคอลัมน์กระจก name/category/price ให้ตรงกับ data ที่กู้ (ดู memory iducky-script-write-product)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [productId, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const WRITE = rest.includes("--write");

if (!productId || productId.startsWith("--")) {
  console.log("ใช้: node scripts/product-revisions.mjs <product-id> [--show|--diff|--restore <rev-id>] [--write]");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const groupsBrief = (d) =>
  (d.options ?? []).map((o) => `${o.label} (${(o.choices ?? []).length})`).join(" · ") || "— ไม่มีกลุ่มตัวเลือก —";

const { data: curRow } = await sb.from("products").select("name,data").eq("id", productId).maybeSingle();

const showId = flag("--show");
const diffId = flag("--diff");
const restoreId = flag("--restore");

if (!showId && !diffId && !restoreId) {
  const { data: revs, error } = await sb
    .from("product_revisions")
    .select("id,action,editor,editor_name,replaced_at,data")
    .eq("product_id", productId)
    .order("id", { ascending: false });
  if (error) {
    console.error("อ่านประวัติไม่ได้:", error.message, "\n(ยังไม่ได้รัน supabase/product-revisions.sql หรือเปล่า?)");
    process.exit(1);
  }
  console.log(`สินค้า: ${curRow?.name ?? "(ไม่พบในตาราง products)"} · ปัจจุบัน: ${curRow ? groupsBrief(curRow.data) : "-"}`);
  console.log(`ประวัติ ${revs.length} รายการ (ใหม่ → เก่า):\n`);
  for (const r of revs) {
    const when = new Date(r.replaced_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const who = r.editor_name || r.editor || "ไม่ทราบ (บันทึกก่อนเก็บชื่อ หรือมาจากสคริปต์)";
    console.log(`#${r.id}  ${when}  ${r.action === "delete" ? "🗑 ก่อนลบสินค้า" : "ถูกทับโดย"}: ${who}`);
    console.log(`    ${groupsBrief(r.data)}`);
  }
  process.exit(0);
}

const revId = showId ?? diffId ?? restoreId;
const { data: rev, error: revErr } = await sb
  .from("product_revisions")
  .select("id,product_id,action,editor,editor_name,replaced_at,data")
  .eq("id", revId)
  .maybeSingle();
if (revErr || !rev) {
  console.error("ไม่พบประวัติ id", revId, revErr?.message ?? "");
  process.exit(1);
}
if (rev.product_id !== productId) {
  console.error(`ประวัติ #${revId} เป็นของสินค้า "${rev.product_id}" ไม่ใช่ "${productId}" — หยุดไว้ก่อน`);
  process.exit(1);
}

if (showId) {
  console.log(`เวอร์ชัน #${rev.id} (${new Date(rev.replaced_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })})`);
  for (const o of rev.data.options ?? []) {
    console.log(`\nGROUP "${o.label}" display=${o.display ?? "-"}`);
    for (const c of o.choices ?? []) console.log("  ", c.name, "| extra:", c.extra ?? 0, c.extraBelow ? `| extraBelow: ${c.extraBelow}` : "");
  }
  process.exit(0);
}

if (diffId) {
  if (!curRow) {
    console.error("สินค้านี้ไม่อยู่ในตาราง products แล้ว (ถูกลบ?) — ใช้ --restore เพื่อกู้ทั้งตัว");
    process.exit(1);
  }
  const a = new Set((rev.data.options ?? []).map((o) => o.label));
  const b = new Set((curRow.data.options ?? []).map((o) => o.label));
  console.log("กลุ่มในเวอร์ชันเก่าที่หายจากปัจจุบัน:", [...a].filter((x) => !b.has(x)).join(" · ") || "—");
  console.log("กลุ่มที่เพิ่มใหม่หลังเวอร์ชันนั้น:", [...b].filter((x) => !a.has(x)).join(" · ") || "—");
  for (const f of ["name", "price", "terms"]) {
    const same = JSON.stringify(rev.data[f]) === JSON.stringify(curRow.data[f]);
    console.log(`${f}: ${same ? "เหมือนเดิม" : "ต่างกัน"}`);
  }
  process.exit(0);
}

// --restore
const d = rev.data;
console.log(`จะกู้ "${d.name}" กลับเป็นเวอร์ชัน #${rev.id} (${new Date(rev.replaced_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })})`);
console.log("กลุ่มตัวเลือกหลังกู้:", groupsBrief(d));
if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write เพื่อกู้จริง)");
  process.exit(0);
}

// เก็บข้อมูลปัจจุบันลงประวัติก่อน (ถ้าสินค้ายังอยู่) — กู้แล้วย้อนกลับได้
if (curRow?.data) {
  await sb.from("product_revisions").insert({
    product_id: productId,
    data: curRow.data,
    action: "save",
    editor: null,
    editor_name: "สคริปต์กู้คืน (เก็บสภาพก่อนกู้)",
  });
}

const restored = { ...d, savedAt: new Date().toISOString() };
const { error: upErr } = await sb.from("products").upsert(
  {
    id: productId,
    name: restored.name,
    category: restored.category,
    price: restored.price,
    sold: restored.sold,
    featured: restored.featured ?? false,
    badge: restored.badge ?? null,
    data: restored,
  },
  { onConflict: "id" }
);
if (upErr) {
  console.error("กู้ไม่สำเร็จ:", upErr.message);
  process.exit(1);
}
console.log("\n✅ กู้คืนแล้ว — เปิดหน้าแก้ไขสินค้า (F5) ตรวจอีกรอบได้เลย");
