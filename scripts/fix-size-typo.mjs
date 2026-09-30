#!/usr/bin/env node
/**
 * แก้คำผิด "ไซซ์" → "ไซส์" ทั้งฐานข้อมูล (30 ก.ย. 69)
 *
 *   node scripts/fix-size-typo.mjs            # ดูก่อน (ไม่เขียน)
 *   node scripts/fix-size-typo.mjs --write    # เขียน + อ่านกลับเทียบ
 *
 * ครอบคลุม: Supabase products (รวมแถว __…__ คลังตัวเลือกกลาง) (แทนทั้งก้อน data ตามแนว scripts/rename-choice.mts
 *   → ชื่อกลุ่ม · ชื่อตัวเลือก · คีย์ช่องราคา · showWhen/rules · ข้อความ ขยับพร้อมกัน)
 *   + คอลัมน์กระจก name · Firestore stockItems (ชื่อ SKU ที่ตั้งตามชื่อตัวเลือก)
 * ⛔ ไม่แตะ orders/quotes — ประวัติที่ลูกค้าสั่งไว้คงเดิม (แค่รายงานจำนวน)
 * ⛔ หยุดถ้าสินค้าไหนมีกลุ่ม/ตัวเลือกชื่อ "ไซส์…" อยู่แล้วคู่กับ "ไซซ์…" (เปลี่ยนแล้วจะซ้ำ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const WRITE = process.argv.includes("--write");
const OLD = "ไซซ์", NEW = "ไซส์";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = getFirestore(
  initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }),
  env.FIREBASE_DATABASE_ID || "tp-fixflow"
);
const count = (s) => s.split(OLD).length - 1;
const fix = (v) => JSON.parse(JSON.stringify(v).split(OLD).join(NEW));
let problems = 0;

/* ---------- Supabase: products ---------- */
const { data: prods, error } = await sb.from("products").select("id,name,data");
if (error) throw error;
const pHits = prods.filter((r) => JSON.stringify(r).includes(OLD));
console.log(`📦 products: สแกน ${prods.length} แถว · เจอ ${pHits.length} แถว`);
for (const r of pHits) {
  const raw = JSON.stringify(r.data);
  const where = [];
  for (const [gi, g] of (r.data.options ?? []).entries()) {
    if ((g.label ?? "").includes(OLD)) {
      where.push(`กลุ่ม[${gi}] "${g.label}"`);
      if ((r.data.options ?? []).some((o) => o.label === g.label.split(OLD).join(NEW))) { where.push("⛔ มีกลุ่มชื่อใหม่อยู่แล้ว"); problems++; }
    }
    for (const c of g.choices ?? []) if ((c.name ?? "").includes(OLD)) {
      where.push(`ตัวเลือก "${c.name}" ใน "${g.label}"`);
      if ((g.choices ?? []).some((x) => x.name === c.name.split(OLD).join(NEW))) { where.push("⛔ มีตัวเลือกชื่อใหม่อยู่แล้ว"); problems++; }
    }
  }
  const cells = Object.keys(r.data.pricing?.cells ?? {}).filter((k) => k.includes(OLD)).length
    + (r.data.priceRates ?? []).reduce((n, rate) => n + Object.keys(rate.pricing?.cells ?? {}).filter((k) => k.includes(OLD)).length, 0);
  if (cells) where.push(`ช่องราคา ${cells}`);
  const dl = JSON.stringify(r.data.pricing?.driverLabels ?? []) + JSON.stringify((r.data.priceRates ?? []).map((x) => x.pricing?.driverLabels ?? []));
  if (dl.includes(OLD)) where.push(`driverLabels ${count(dl)}`);
  const sw = (r.data.options ?? []).filter((g) => JSON.stringify([g.showWhen, g.showWhenAlso, g.showWhenAll, g.showWhenAny]).includes(OLD)).length;
  if (sw) where.push(`showWhen ${sw} กลุ่ม`);
  if ((r.name ?? "").includes(OLD)) where.push(`คอลัมน์ name`);
  console.log(`  ${r.id.padEnd(24)} ${count(raw)} จุด · ${where.join(" · ") || "ข้อความอย่างเดียว"}`);
}

/* ---------- Supabase: option_presets + ตารางอื่น (รายงาน) ---------- */
/* (คลังตัวเลือกกลางอยู่ในตาราง products เป็นแถว __…__ — สแกนรวมด้านบนแล้ว) */
for (const t of ["orders", "quotes", "coupons"]) {
  const { data, error: e } = await sb.from(t).select("*");
  if (e) { console.log(`  (${t}: ${e.message})`); continue; }
  const h = data.filter((r) => JSON.stringify(r).includes(OLD));
  console.log(`🗂 ${t}: ${h.length}/${data.length} แถวมีคำผิด (ไม่แก้ — ประวัติ)`);
}

/* ---------- Firestore: stockItems ---------- */
const stock = (await db.collection("stockItems").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const sHits = stock.filter((r) => JSON.stringify(r).includes(OLD));
console.log(`🏷 stockItems: สแกน ${stock.length} · เจอ ${sHits.length}`);
for (const r of sHits) {
  const f = Object.keys(r).filter((k) => JSON.stringify(r[k] ?? null).includes(OLD));
  console.log(`  ${r.id.padEnd(22)} ${r.sku ?? ""} "${r.name}" · ฟิลด์: ${f.join(", ")}`);
}

if (problems) { console.error(`\n⛔ ชนกัน ${problems} จุด — ดูเองก่อน ไม่เขียน`); process.exit(1); }
if (!WRITE) { console.log("\n(dry-run · เติม --write เพื่อเขียน)"); process.exit(0); }

/* ---------- เขียน + อ่านกลับ ---------- */
let bad = 0;
for (const r of pHits) {
  const patch = { data: fix(r.data), name: r.name?.split(OLD).join(NEW) };
  patch.data.savedAt = new Date().toISOString();
  const { data: back, error: e } = await sb.from("products").update(patch).eq("id", r.id).select("name,data");
  if (e || !back?.length || JSON.stringify(back[0]).includes(OLD)) { console.error(`  ❌ products ${r.id}`, e?.message ?? "อ่านกลับยังมีคำผิด"); bad++; }
  else console.log(`  ✓ products ${r.id}`);
}
for (const r of sHits) {
  const { id, ...rest } = r;
  const patch = {};
  for (const k of Object.keys(rest)) if (JSON.stringify(rest[k] ?? null).includes(OLD)) patch[k] = fix(rest[k]);
  await db.collection("stockItems").doc(id).update(patch);
  const back = (await db.collection("stockItems").doc(id).get()).data();
  if (JSON.stringify(back).includes(OLD)) { console.error(`  ❌ stockItems ${id} อ่านกลับยังมีคำผิด`); bad++; }
  else console.log(`  ✓ stockItems ${id} "${back.name}"`);
}
console.log(bad ? `\n❌ ไม่ผ่าน ${bad} แถว` : "\n✅ เสร็จ · อ่านกลับตรงทุกแถว");
process.exit(bad ? 1 : 0);
