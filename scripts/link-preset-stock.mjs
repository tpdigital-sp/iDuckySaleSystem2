#!/usr/bin/env node
/**
 * ผูก "คลังตัวเลือกกลาง" (option preset) เข้ากับ SKU ในคลังวัสดุ
 *
 *   node scripts/link-preset-stock.mjs                # ดูอย่างเดียว
 *   node scripts/link-preset-stock.mjs --write        # สร้าง SKU + เขียน stockItemId ลง preset
 *   node scripts/link-preset-stock.mjs --only=hook    # ทำเฉพาะกลุ่มเดียว
 *
 * ทำไมผูกที่ preset: preset ตัวเดียวถูกลิงก์จากหลายสินค้า — ผูก 13 ครั้งได้ 12 สินค้าพร้อมกัน
 * และ resolveOptions() คลี่ preset ลงสินค้าตอนอ่านอยู่แล้ว stockItemId จึงไหลตามไปเอง
 *
 * ⚠️ หัวใจคือ "หนึ่งรหัส = หนึ่ง SKU" ข้ามทุกคลัง
 * คลัง "สีตะขอ" (185 ค่า) เป็นคลังรวมที่ครอบ G/H/U/I/S/T/W/AB/C/AA ไว้หมด
 * รหัส G1 จึงโผล่ทั้งใน "สีตะขอ G" และ "สีตะขอ" — ถ้าตั้ง prefix แยกตามคลัง
 * ตะขอตัวเดียวจะกลายเป็น SKU สองใบ นับสต๊อกแยกกันแล้วยอดไม่มีวันตรง
 * จึงรวมทุกคลังตะขอไว้ใน keyspace เดียว (HOOK-<รหัส>)
 *
 * ยอดคงเหลือตั้งต้น = 0 เสมอ — ต้องเดินนับจริงแล้วลง "ปรับยอดนับจริง"
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const WRITE = process.argv.includes("--write");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

/**
 * กลุ่มวัสดุ — หนึ่งกลุ่ม = หนึ่ง keyspace ของรหัส SKU
 * presets: ทุกคลังที่พูดถึงของกลุ่มนี้ (รหัสซ้ำกันข้ามคลังได้ → ชี้ SKU ตัวเดียวกัน)
 * keyOf:   ดึง "รหัส" ออกจากชื่อตัวเลือก · คืน null = ไม่ใช่ของ ข้ามไป ไม่สร้าง SKU
 * retired: prefix ของ SKU รุ่นเก่าที่ถูกกลุ่มนี้แทนที่ — ลบทิ้งได้ถ้ายอด 0 และไม่เคยเคลื่อนไหว
 */
const NAMESPACES = [
  {
    id: "thread",
    prefix: "THREAD",
    family: "สีไหมเย็บ",
    unit: "หลอด",
    category: "ด้าย/ไหม",
    presets: ["preset-4"],
    keyOf: (name) => (name.match(/\((\d{3,5})\)/) || [])[1] ?? null, // "ขาว (1803)" → 1803
    nameOf: (name) => `ไหมเย็บ ${name}`,
  },
  {
    id: "hook",
    prefix: "HOOK",
    family: "ตะขอ",
    unit: "ชิ้น",
    category: "อะไหล่",
    // "9" = คลังรวม 185 ค่า · ที่เหลือเป็นคลังย่อยรายตระกูลที่เป็นสับเซตของมัน
    presets: [
      "9",
      "hook-color-c",
      "hook-color-aa",
      "g-2", // สีตะขอ G — id ไม่ได้ตั้งชื่อตามแบบ hook-color-*
      "hook-color-h",
      "hook-color-u",
      "hook-color-i",
      "hook-color-ab",
      "hook-color-s",
      "hook-color-t",
      "hook-color-w",
    ],
    keyOf: (name) => (name.match(/^([A-Z]{1,3}\d{1,3})\b/i) || [])[1]?.toUpperCase() ?? null, // "C16 สีฟ้าอ่อน" → C16
    nameOf: (name) => `ตะขอ ${name}`,
    retired: ["hkc-", "hkaa-"], // รอบแรกเคยตั้ง prefix แยกตามคลัง — ยุบมารวมที่ HOOK-
  },
  {
    id: "part",
    prefix: "PART",
    family: "อะไหล่เสริม",
    unit: "ชิ้น",
    category: "อะไหล่",
    presets: ["hook-accessory"],
    keyOf: (name) => (name.match(/^(P\d{1,2})\b/) || [])[1] ?? null, // "P1 เข็มกลัดติดอะคริลิค (สีเงิน)" → P1
    nameOf: (name) => name,
  },
];

/**
 * คลังที่ "ผูกอัตโนมัติไม่ได้" — จงใจไม่ใส่ใน NAMESPACES เพราะจับคู่ผิดแล้วยอดพัง
 * เก็บไว้เป็นรายการให้คนตัดสิน ไม่ใช่ลืม
 */
const NEEDS_HUMAN = [
  ["preset-3", "ตะขอ (Z1/Z2/A/B/…)", "เป็น 'ชนิด' ตะขอ ไม่ใช่ตัวสินค้า — SKU จริงคือ ชนิด×สี เช่น F สีเงิน"],
  ["hook-color-metal", "สีตะขอ · โลหะ (F/J/K/L/M/N/O)", "ค่าเป็น 'สีเงิน/สีทอง' ลอย ๆ ต้องรู้ว่าคู่กับชนิดไหน (ใช้ showWhen)"],
  ["hook-color-r", "สีตะขอ R (โลหะ)", "เหมือนข้างบน — ต้องประกอบกับชนิด R ก่อนถึงเป็น SKU"],
  ["preset", "สีอะคริลิค (46 ค่า)", "ชื่อไม่มีรหัส และ TP ไม่เคยสั่งเข้าเลยสักตัว — ต้องถามก่อนว่าซื้อนอกระบบหรือเปล่า"],
  ["preset-2", "เคลือบ (12 ค่า)", "ชื่อไม่มีรหัส · ทับซ้อนกับตระกูล LAM-* ที่กางจากใบสั่ง TP แล้ว ต้องเลือกว่าจะใช้ตัวไหน"],
];

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const app = initializeApp({
  credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))),
});
const fx = getFirestore(app, "tp-fixflow");

const [{ data: presetRows }, { data: prodRows }] = await Promise.all([
  sb.from("products").select("id,data").eq("category", "__presets__"),
  sb.from("products").select("id,data").neq("category", "__presets__"),
]);
const liveProducts = (prodRows ?? []).filter((r) => r.data && !r.data.hidden);
const findPreset = (id) => (presetRows ?? []).find((r) => r.data?.id === id || r.id === `__preset_${id}`);
const usersOf = (presetId) =>
  liveProducts.filter((r) => (r.data.options ?? []).some((o) => o.presetId === presetId));

// ── วางแผน ──
const plan = [];
for (const ns of NAMESPACES) {
  if (ONLY && ONLY !== ns.id) continue;
  const skus = new Map(); // key → { code, id, names:Set }
  const touched = []; // { row, label, links: Map<choiceName, skuId> }
  const productIds = new Set();
  const missingPresets = [];

  for (const pid of ns.presets) {
    const row = findPreset(pid);
    if (!row) {
      missingPresets.push(pid);
      continue;
    }
    const links = new Map();
    for (const c of row.data.choices ?? []) {
      const key = ns.keyOf(c.name);
      if (!key) continue;
      const id = `${ns.prefix}-${key}`.toLowerCase();
      if (!skus.has(key)) skus.set(key, { code: `${ns.prefix}-${key}`, id, names: new Set() });
      skus.get(key).names.add(c.name);
      links.set(c.name, id);
    }
    if (links.size) {
      touched.push({ row, label: row.data.label, links });
      for (const p of usersOf(pid)) productIds.add(p.id);
    }
  }
  plan.push({ ns, skus, touched, productIds, missingPresets });
}

// ── รายงาน ──
for (const p of plan) {
  console.log(`\n━━ ${p.ns.family}  [${p.ns.prefix}-*] ━━`);
  console.log(`   คลังที่รวมเข้ามา ${p.touched.length} คลัง · SKU ไม่ซ้ำ ${p.skus.size} ตัว · สินค้าที่ได้ผล ${p.productIds.size} ตัว`);
  for (const t of p.touched) {
    console.log(`     ${String(t.links.size).padStart(3)} ค่า · ${t.label}`);
  }
  if (p.missingPresets.length) console.log(`   ⚠️ ไม่พบคลัง: ${p.missingPresets.join(", ")}`);
  const sample = [...p.skus.values()].slice(0, 5);
  for (const s of sample) {
    const [first, ...rest] = [...s.names];
    console.log(`     ${s.code.padEnd(12)} ${p.ns.nameOf(first)}${rest.length ? `   (อีก ${rest.length} ชื่อ → alias)` : ""}`);
  }
  if (p.skus.size > 5) console.log(`     … อีก ${p.skus.size - 5} ตัว`);
}
const totalSku = plan.reduce((s, p) => s + p.skus.size, 0);
const totalProd = new Set(plan.flatMap((p) => [...p.productIds])).size;
console.log(`\n📊 รวม ${totalSku} SKU · ครอบคลุมสินค้า ${totalProd} ตัว`);

console.log(`\n━━ ต้องให้คนตัดสิน ${NEEDS_HUMAN.length} คลัง (จงใจไม่ผูกอัตโนมัติ) ━━`);
for (const [id, label, why] of NEEDS_HUMAN) {
  const row = findPreset(id);
  console.log(`   ${label} · ${(row?.data.choices ?? []).length} ค่า`);
  console.log(`      ${why}`);
}

if (!WRITE) {
  console.log(`\n💡 ยังไม่เขียนอะไร — ใส่ --write ถ้าจะเขียนจริง`);
  process.exit(0);
}

// ── เขียนจริง: Firestore ก่อน แล้วค่อยผูกที่ Supabase ──
// เรียงแบบนี้เพื่อไม่ให้ preset ชี้ไปยัง SKU ที่ยังไม่มีจริง ถ้าพังกลางทาง
const now = new Date().toISOString();
let created = 0, linked = 0, retiredN = 0;

for (const p of plan) {
  for (const s of p.skus.values()) {
    const ref = fx.collection("stockItems").doc(s.id);
    if ((await ref.get()).exists) continue; // มีแล้ว → ไม่ทับยอด/ชื่อที่คนแก้ไว้
    const [first, ...rest] = [...s.names];
    await ref.set({
      id: s.id,
      code: s.code,
      name: p.ns.nameOf(first),
      unit: p.ns.unit,
      category: p.ns.category,
      family: p.ns.family,
      aliases: [...s.names, ...rest].filter((v, i, a) => a.indexOf(v) === i),
      balance: 0, // ต้องเดินนับจริง
      productIds: [],
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    created++;
  }

  for (const t of p.touched) {
    const next = (t.row.data.choices ?? []).map((c) =>
      t.links.has(c.name) ? { ...c, stockItemId: t.links.get(c.name) } : c
    );
    const { error } = await sb
      .from("products")
      .update({ data: { ...t.row.data, choices: next } })
      .eq("id", t.row.id);
    if (error) {
      console.error(`❌ ผูก "${t.label}" ไม่สำเร็จ: ${error.message}`);
      continue;
    }
    linked += t.links.size;
  }

  // ── เก็บกวาด SKU รุ่นเก่าที่ถูกยุบมารวม ──
  // ลบเฉพาะที่ยอด 0 และไม่เคยมีการเคลื่อนไหว — ledger เป็นบันทึกจริง ห้ามลบทิ้งเด็ดขาด
  for (const pre of p.ns.retired ?? []) {
    const snap = await fx.collection("stockItems").get();
    for (const d of snap.docs) {
      if (!d.id.startsWith(pre)) continue;
      const it = d.data();
      const mv = await fx.collection("stockMoves").where("itemId", "==", d.id).limit(1).get();
      if ((it.balance ?? 0) !== 0 || !mv.empty) {
        console.log(`   ⏭️  ข้าม ${d.id} — มียอด/ประวัติแล้ว ต้องยุบด้วยมือ`);
        continue;
      }
      await d.ref.delete();
      retiredN++;
    }
  }
}
console.log(`\n✅ สร้าง SKU ใหม่ ${created} · ผูกตัวเลือก ${linked} ค่า · ลบ SKU รุ่นเก่าที่ยุบรวม ${retiredN}`);
console.log(`   ยอดคงเหลือทั้งหมดเป็น 0 — ต้องเดินนับจริงก่อนถึงใช้ตัดสินใจสั่งของได้`);
process.exit(0);
