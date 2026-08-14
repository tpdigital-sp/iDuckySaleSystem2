#!/usr/bin/env node
/**
 * ผูก "สินค้าที่ขายทั้งชิ้น" (ไม่มีตัวเลือกที่กินสต๊อก) เข้ากับ SKU แบบ 1 ต่อ 1
 *
 *   node scripts/link-product-stock.mjs            # ดูอย่างเดียว
 *   node scripts/link-product-stock.mjs --write    # สร้าง SKU + ใส่ productIds
 *
 * ต่างจาก link-preset-stock.mjs: ตัวนั้นผูกที่ "ตัวเลือก" (เลือกสีไหมไหน = ตัดไหมหลอดนั้น)
 * ตัวนี้ผูกที่ "ตัวสินค้า" — ของอย่างร่มกอล์ฟ/Light Box ขายยังไงก็ตัดของชิ้นเดิม
 *
 * ⚠️ ข้ามแม่แบบ (__template_*) — ลูกค้าสั่งด้วย id นั้นไม่ได้ ผูกไปก็ไม่มีวันตัด
 * ⚠️ ข้ามแถวคอนฟิก (__categories__, __role_perms__, …) ที่ปนอยู่ในตาราง products
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/เเ/g, "แ")
    .replace(/\s+/g, "")
    .replace(/[็่้๊๋์]/g, "");

/** รหัส SKU จาก id สินค้า — ตัดให้สั้นพออ่านออกและไม่ชนกัน */
const codeOf = (id) => `P-${id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20).toUpperCase()}`;

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const app = initializeApp({
  credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))),
});
const fx = getFirestore(app, "tp-fixflow");

const { data: rows, error } = await sb.from("products").select("id,data").neq("category", "__presets__");
if (error) throw error;

const candidates = (rows ?? []).filter((r) => {
  const d = r.data;
  if (!d || d.hidden) return false;
  if (r.id.startsWith("__template")) return false; // แม่แบบ ไม่ใช่ของขาย
  if (/^__.*__$/.test(r.id)) return false; // แถวคอนฟิกที่ปนอยู่ในตารางเดียวกัน
  if (!d.name || typeof d.price !== "number") return false; // ไม่มีชื่อ/ราคา = ไม่ใช่สินค้า
  return (d.options ?? []).length === 0; // มีตัวเลือก = ผูกที่ตัวเลือกแทน (ดู link-preset-stock)
});

// SKU ที่มีอยู่แล้ว — จับคู่ก่อนสร้างใหม่ ไม่งั้นได้ของซ้ำสองใบ
const existing = (await fx.collection("stockItems").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const findExisting = (name) => {
  const n = norm(name);
  return (
    existing.find((s) => norm(s.name) === n) ??
    existing.find((s) => (s.aliases ?? []).some((a) => norm(a) === n)) ??
    null
  );
};

const plan = candidates.map((r) => {
  const hit = findExisting(r.data.name);
  const alreadyLinked = existing.find((s) => (s.productIds ?? []).includes(r.id));
  return {
    productId: r.id,
    name: r.data.name,
    price: r.data.price,
    category: r.data.category,
    match: hit,
    alreadyLinked,
  };
});

console.log(`สินค้าจริงที่ขายทั้งชิ้น (ไม่มีตัวเลือก): ${plan.length} ตัว\n`);
for (const p of plan) {
  const state = p.alreadyLinked ? `ผูกแล้ว → ${p.alreadyLinked.code ?? p.alreadyLinked.id}` : p.match ? `ใช้ SKU เดิม → ${p.match.code ?? p.match.id}` : `สร้างใหม่ ${codeOf(p.productId)}`;
  console.log(`   ${p.productId.padEnd(24)} ${String(p.name).slice(0, 34).padEnd(36)} ฿${String(p.price).padEnd(6)} ${state}`);
}
const toCreate = plan.filter((p) => !p.alreadyLinked && !p.match).length;
const toReuse = plan.filter((p) => !p.alreadyLinked && p.match).length;
console.log(`\n📊 สร้างใหม่ ${toCreate} · ใช้ SKU เดิม ${toReuse} · ผูกอยู่แล้ว ${plan.length - toCreate - toReuse}`);

if (!WRITE) {
  console.log(`\n💡 ยังไม่เขียนอะไร — ใส่ --write ถ้าจะเขียนจริง`);
  process.exit(0);
}

const now = new Date().toISOString();
let created = 0, linkedN = 0;
for (const p of plan) {
  if (p.alreadyLinked) continue;
  let target = p.match;
  if (!target) {
    const code = codeOf(p.productId);
    const id = code.toLowerCase();
    await fx.collection("stockItems").doc(id).set({
      id,
      code,
      name: p.name,
      unit: "ชิ้น",
      category: p.category ?? "สินค้าสำเร็จ",
      family: "สินค้าขายทั้งชิ้น",
      aliases: [],
      balance: 0, // ต้องเดินนับจริง
      productIds: [p.productId],
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    created++;
    continue;
  }
  // มี SKU อยู่แล้ว → เติม productId เข้าไป ไม่แตะยอด/ชื่อ
  const ids = [...new Set([...(target.productIds ?? []), p.productId])];
  await fx.collection("stockItems").doc(target.id).update({ productIds: ids, updatedAt: now });
  linkedN++;
}
console.log(`\n✅ สร้าง SKU ใหม่ ${created} · ผูก productId เข้า SKU เดิม ${linkedN} (ยอด 0 — ต้องเดินนับจริง)`);
process.exit(0);
