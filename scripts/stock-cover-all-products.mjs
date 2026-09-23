#!/usr/bin/env node
/**
 * สร้าง SKU ให้สินค้าที่ยัง "ไม่มีสต๊อกผูกอยู่เลย" — ให้ทุกสินค้าในร้านโผล่ในหน้า /admin/stock
 *
 *   node scripts/stock-cover-all-products.mjs           # ดูอย่างเดียว
 *   node scripts/stock-cover-all-products.mjs --write   # สร้างจริง
 *
 * ต่างจาก link-product-stock.mjs: ตัวนั้นทำเฉพาะสินค้า "ขายทั้งชิ้น" (ไม่มีมิติวัสดุ) — เหลือ 138 ตัวไม่ถูกแตะ
 * ตัวนี้สร้าง SKU ตัวแทนสินค้าละ 1 ตัวก่อน (1 ต่อ 1) แล้วค่อยกดปุ่ม "แยกตามตัวเลือก" ทีหลังได้ตามต้องการ
 * ⚠️ ไม่แตะสินค้าที่มีลิงก์อยู่แล้ว (ตัวสินค้า / ตัวเลือกของมันเอง / คลังตัวเลือกกลาง / วัสดุแฝง) — กันตัดซ้ำ 2 เด้ง
 * ⚠️ ชื่อซ้ำกับ SKU เดิมที่ยังไม่ถูกผูกกับสินค้าไหน = ผูกตัวเดิม ไม่สร้างใหม่
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }), "tp-fixflow");
const die = (m) => { console.log("⛔", m); process.exit(1); };
const norm = (s) => String(s || "").toLowerCase().replace(/เเ/g, "แ").replace(/\s+/g, "").replace(/[็่้๊๋์]/g, "");

/** รหัส SKU จาก id สินค้า — id ยาวเกิน 20 ต้องต่อแฮช ไม่งั้นรหัสชนกัน (ชุดเดียวกับ link-product-stock.mjs) */
const shortHash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(36).toUpperCase().padStart(7, "0"); };
const codeOf = (id) => { const b = id.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase(); return b.length <= 20 ? `P-${b}` : `P-${b.slice(0, 15)}-${shortHash(id)}`; };

const { data: rows, error } = await sb.from("products").select("id,category,data");
if (error) die(error.message);
const presets = (rows ?? []).filter((r) => r.category === "__presets__").map((r) => r.data).filter((p) => p?.id);
const prods = (rows ?? []).filter((r) => r.category !== "__presets__" && !/^__/.test(r.id) && r.data?.name && typeof r.data?.price === "number");
const CATEGORY_NAME = new Map(((rows ?? []).find((r) => r.id === "__categories__")?.data?.categories ?? []).filter((c) => c?.id && c?.name).map((c) => [c.id, c.name]));

const items = (await db.collection("stockItems").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const liveItems = items.filter((s) => s.active !== false);
const codes = new Set(items.map((s) => String(s.code ?? "")).filter(Boolean)); // รวมตัวที่ลบแล้ว — รหัสห้ามซ้ำของเก่า

/** สินค้าที่ "มีสต๊อกอยู่แล้ว" ทุกทาง */
const presetLinked = new Set(presets.filter((p) => (p.choices ?? []).some((c) => c.stockItemId)).map((p) => p.id));
const linked = new Set();
for (const s of liveItems) { for (const p of s.productIds ?? []) linked.add(p); for (const p of Object.keys(s.bomFor ?? {})) linked.add(p); }
for (const r of prods) for (const o of r.data.options ?? []) {
  if (o.presetId && presetLinked.has(o.presetId)) linked.add(r.id);
  for (const c of o.choices ?? []) if (c.stockItemId) linked.add(r.id);
}
const todo = prods.filter((r) => !linked.has(r.id));

/** SKU เดิมที่ชื่อตรงและยังไม่ถูกผูกกับสินค้าไหน — ผูกตัวเดิมดีกว่าสร้างซ้ำ */
const freeByName = new Map();
for (const s of liveItems) if (!(s.productIds ?? []).length) for (const n of [s.name, ...(s.aliases ?? [])]) if (!freeByName.has(norm(n))) freeByName.set(norm(n), s);

const plan = todo.map((r) => {
  const reuse = freeByName.get(norm(r.data.name));
  return { pid: r.id, name: r.data.name, draft: !!r.data.hidden, family: CATEGORY_NAME.get(r.data.category) ?? r.data.category ?? undefined, reuse };
});
const reuseN = plan.filter((p) => p.reuse).length;
console.log(`สินค้าทั้งหมด ${prods.length} · มีสต๊อกแล้ว ${prods.length - todo.length} · จะเพิ่ม ${todo.length} (ผูก SKU เดิม ${reuseN} · สร้างใหม่ ${todo.length - reuseN})`);
for (const p of plan.slice(0, 12)) console.log(`   ${p.reuse ? "ผูกเดิม" : "สร้าง "} ${p.reuse?.code ?? codeOf(p.pid)} ← ${p.name}${p.draft ? " (ร่าง)" : ""}`);
if (plan.length > 12) console.log(`   … อีก ${plan.length - 12} ตัว`);
if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อสร้างจริง)"); process.exit(0); }

const now = new Date().toISOString();
let made = 0, tied = 0;
for (const p of plan) {
  if (p.reuse) {
    await db.collection("stockItems").doc(p.reuse.id).update({ productIds: [p.pid], updatedAt: now });
    tied++;
    continue;
  }
  let code = codeOf(p.pid), n = 1;
  while (codes.has(code)) code = `${codeOf(p.pid)}-${++n}`; // รหัสชนของเก่า/ตัวที่ลบแล้ว → ต่อเลข
  codes.add(code);
  const id = `sku-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await db.collection("stockItems").doc(id).set({
    id, name: p.name, code, unit: "ชิ้น", balance: 0, productIds: [p.pid],
    ...(p.family ? { family: p.family } : {}), needsReview: true, active: true, createdAt: now, updatedAt: now,
  });
  made++;
}
// อ่านกลับมาเทียบว่าทุกสินค้ามีสต๊อกผูกจริง
const after = (await db.collection("stockItems").get()).docs.map((d) => d.data()).filter((s) => s.active !== false);
const still = todo.filter((r) => !after.some((s) => (s.productIds ?? []).includes(r.id)));
if (still.length) die(`ยังไม่มีสต๊อก ${still.length} ตัว: ${still.slice(0, 5).map((r) => r.id).join(", ")}`);
console.log(`\n✅ สร้างใหม่ ${made} · ผูก SKU เดิม ${tied} · ตรวจแล้วทุกสินค้าใน ${todo.length} ตัวมีสต๊อกผูกครบ`);
process.exit(0);
