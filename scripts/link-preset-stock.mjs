#!/usr/bin/env node
/**
 * ผูก "คลังตัวเลือกกลาง" (option preset) เข้ากับ SKU ในคลังวัสดุ
 *
 *   node scripts/link-preset-stock.mjs                    # ดูอย่างเดียว
 *   node scripts/link-preset-stock.mjs --write            # สร้าง SKU + เขียน stockItemId ลง preset
 *   node scripts/link-preset-stock.mjs --only=preset-4    # ทำเฉพาะคลังเดียว
 *
 * ทำไมผูกที่ preset: preset หนึ่งตัวถูกลิงก์จากหลายสินค้า — ผูก 13 ครั้งได้ 12 สินค้าพร้อมกัน
 * และ resolveOptions() คลี่ preset ลงสินค้าตอนอ่านอยู่แล้ว stockItemId จึงไหลตามไปเอง
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
  readFileSync("/Users/iduckshop/Desktop/iDuckySaleSystem2/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

/**
 * คลังที่จะผูก — ประกาศทีละตัวเพราะแต่ละคลังตั้งรหัส/หน่วยไม่เหมือนกัน
 * codeOf: ดึง "รหัส" ออกจากชื่อตัวเลือกมาทำรหัส SKU
 *   คืน null = ตัวเลือกนี้ไม่ใช่ของ (เช่น "ไม่มีตัวเลือก") → ข้าม ไม่สร้าง SKU
 */
const TARGETS = [
  {
    presetId: "preset-4",
    family: "สีไหมเย็บ",
    unit: "หลอด",
    category: "ด้าย/ไหม",
    prefix: "THREAD",
    // "ขาว (1803)" → 1803
    codeOf: (name) => (name.match(/\((\d{3,5})\)/) || [])[1] ?? null,
    nameOf: (name) => `ไหมเย็บ ${name}`,
  },
  {
    presetId: "hook-color-c",
    family: "ตะขอ C (โซ่ไข่ปลา)",
    unit: "ชิ้น",
    category: "อะไหล่",
    prefix: "HKC",
    // "C16 สีฟ้าอ่อน" → C16
    codeOf: (name) => (name.match(/^(C\d{1,3})\b/i) || [])[1]?.toUpperCase() ?? null,
    nameOf: (name) => `ตะขอโซ่ไข่ปลา ${name}`,
  },
  {
    presetId: "hook-color-aa",
    family: "ตะขอ AA",
    unit: "ชิ้น",
    category: "อะไหล่",
    prefix: "HKAA",
    codeOf: (name) => (name.match(/^(AA\d{1,3})\b/i) || [])[1]?.toUpperCase() ?? null,
    nameOf: (name) => `ตะขอ ${name}`,
  },
];

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const app = initializeApp({
  credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))),
});
const fx = getFirestore(app, "tp-fixflow");

// ── โหลด preset + สินค้าที่ลิงก์ preset นั้นอยู่ ──
const [{ data: presetRows }, { data: prodRows }] = await Promise.all([
  sb.from("products").select("id,data").eq("category", "__presets__"),
  sb.from("products").select("id,data").neq("category", "__presets__"),
]);
const liveProducts = (prodRows ?? []).filter((r) => r.data && !r.data.hidden);
const usersOf = (presetId) =>
  liveProducts.filter((r) => (r.data.options ?? []).some((o) => o.presetId === presetId));

const plan = [];
for (const t of TARGETS) {
  if (ONLY && ONLY !== t.presetId) continue;
  const row = (presetRows ?? []).find((r) => r.data?.id === t.presetId);
  if (!row) {
    console.log(`⚠️  ไม่พบคลัง "${t.presetId}" — ข้าม`);
    continue;
  }
  const choices = row.data.choices ?? [];
  const used = usersOf(t.presetId);
  const items = [];
  const skipped = [];
  for (const c of choices) {
    const key = t.codeOf(c.name);
    if (!key) {
      skipped.push(c.name);
      continue;
    }
    items.push({
      choice: c.name,
      code: `${t.prefix}-${key}`,
      id: `${t.prefix}-${key}`.toLowerCase(),
      name: t.nameOf(c.name),
      already: c.stockItemId ?? null,
    });
  }
  plan.push({ t, row, items, skipped, used });
}

// ── รายงาน ──
for (const p of plan) {
  console.log(`\n━━ ${p.row.data.label} [${p.t.presetId}] ━━`);
  console.log(`   ผูกแล้วมีผลกับสินค้า ${p.used.length} ตัว: ${p.used.slice(0, 4).map((r) => r.data.name).join(" · ")}${p.used.length > 4 ? " …" : ""}`);
  console.log(`   สร้าง SKU ${p.items.length} ตัว${p.skipped.length ? ` · ข้าม ${p.skipped.length} (ไม่มีรหัสในชื่อ: ${p.skipped.slice(0, 3).join(", ")})` : ""}`);
  for (const i of p.items.slice(0, 6)) {
    console.log(`     ${i.code.padEnd(14)} ${i.name}${i.already ? `   (ผูกไว้แล้ว → ${i.already})` : ""}`);
  }
  if (p.items.length > 6) console.log(`     … อีก ${p.items.length - 6} ตัว`);
}
const total = plan.reduce((s, p) => s + p.items.length, 0);
const reach = new Set(plan.flatMap((p) => p.used.map((r) => r.id))).size;
console.log(`\n📊 รวม ${total} SKU · ครอบคลุมสินค้า ${reach} ตัว`);

if (!WRITE) {
  console.log(`\n💡 ยังไม่เขียนอะไร — ใส่ --write ถ้าจะเขียนจริง`);
  process.exit(0);
}

// ── เขียนจริง: Firestore ก่อน แล้วค่อยผูกที่ Supabase ──
// เรียงแบบนี้เพื่อไม่ให้ preset ชี้ไปยัง SKU ที่ยังไม่มีจริง ถ้าพังกลางทาง
const now = new Date().toISOString();
let created = 0, linked = 0;
for (const p of plan) {
  for (const i of p.items) {
    const ref = fx.collection("stockItems").doc(i.id);
    if ((await ref.get()).exists) continue;      // มีแล้ว → ไม่ทับยอด/ชื่อที่คนแก้ไว้
    await ref.set({
      id: i.id,
      code: i.code,
      name: i.name,
      unit: p.t.unit,
      category: p.t.category,
      family: p.t.family,
      aliases: [i.choice],                        // ชื่อที่ใช้บนหน้าร้าน = alias ตัวแรก
      balance: 0,                                 // ต้องเดินนับจริง
      productIds: [],
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    created++;
  }
  // เขียน stockItemId กลับเข้า choices ของ preset
  const byChoice = new Map(p.items.map((i) => [i.choice, i.id]));
  const nextChoices = (p.row.data.choices ?? []).map((c) =>
    byChoice.has(c.name) ? { ...c, stockItemId: byChoice.get(c.name) } : c
  );
  const { error } = await sb
    .from("products")
    .update({ data: { ...p.row.data, choices: nextChoices } })
    .eq("id", p.row.id);
  if (error) {
    console.error(`❌ ผูก ${p.t.presetId} ไม่สำเร็จ: ${error.message}`);
    continue;
  }
  linked += byChoice.size;
}
console.log(`\n✅ สร้าง SKU ใหม่ ${created} ตัว · ผูกตัวเลือก ${linked} ค่า (ยอดคงเหลือ 0 — ต้องเดินนับจริง)`);
process.exit(0);
