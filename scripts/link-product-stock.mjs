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

/**
 * มิติที่กินสต๊อก vs มิติกระบวนการ (ชุดเดียวกับ product-variants.mjs)
 * เช็ค process ก่อนเสมอ — "สกรีนกี่ด้าน" มีคำว่า "ด้าน" แต่ไม่ใช่วัสดุ
 */
const PROC_DIM = /สกรีน|พิมพ์|ตำแหน่งงาน|เทคนิค|ไดคัท|เจาะรู|ระบบพิมพ์|จำนวน|ด้าน$/;
const MAT_DIM = /เนื้อผ้า|^ผ้า|สีไหม|ไหม|ซิป|ตะขอ|โซ่|อะคริลิค|ขนาด|ประเภท|วัสดุ|กลิตเตอร์|^สี|ฐาน|หูกระเป๋า|ชนิด|ความหนา/;
const isMaterialDim = (label) => {
  const L = String(label ?? "").trim();
  if (!L || PROC_DIM.test(L)) return false;
  return MAT_DIM.test(L);
};

/**
 * รหัส SKU จาก id สินค้า
 * ⚠️ ตัดตรง ๆ ที่ 20 ตัวไม่ได้ — สินค้า otheracrylicproducts2-1 … 5-1 (13 ใบ) ยุบเป็นรหัสเดียวกันหมด
 *    แล้ว .set() เขียนทับกันไปเรื่อย ๆ เหลือใบสุดท้ายใบเดียว ข้อมูลใบอื่นหายเงียบ
 *    id ยาวเกินจึงต่อท้ายด้วยแฮชสั้นของ id เต็ม — คงที่ รันกี่รอบก็ได้รหัสเดิม
 */
const shortHash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  // ⚠️ ห้าม slice(0,4) — ตัดหัวเลข base36 ทำให้ id ที่คล้ายกันได้ค่าเดียวกัน
  //    (otheracrylicproducts2-2 กับ 3-3 ชนกันมาแล้ว) ใช้ค่าเต็ม 32 บิตไปเลย
  return h.toString(36).toUpperCase().padStart(7, "0");
};
const codeOf = (id) => {
  const base = id.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase();
  return base.length <= 20 ? `P-${base}` : `P-${base.slice(0, 15)}-${shortHash(id)}`;
};

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const app = initializeApp({
  credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))),
});
const fx = getFirestore(app, "tp-fixflow");

const { data: rows, error } = await sb.from("products").select("id,data").neq("category", "__presets__");
if (error) throw error;

/**
 * ชื่อหมวดภาษาไทย — อ่านจากแถวคอนฟิก __categories__ ไม่ hardcode
 * (หมวดใน data.category เป็น id อังกฤษ/สุ่ม เช่น "standee", "cat-mssijpgu" อ่านในหน้าคลังไม่รู้เรื่อง)
 */
const CATEGORY_NAME = new Map(
  ((rows ?? []).find((r) => r.id === "__categories__")?.data?.categories ?? [])
    .filter((c) => c?.id && c?.name)
    .map((c) => [c.id, c.name])
);
const familyOf = (product) => CATEGORY_NAME.get(product.category) ?? product.category ?? "ยังไม่จัดตระกูล";

const candidates = (rows ?? []).filter((r) => {
  const d = r.data;
  if (!d) return false;
  // ⚠️ รวมฉบับร่างด้วย (d.hidden) — ร่าง 226 รายการเป็นสินค้าจริงทั้งหมด ไม่มีแม่แบบปน
  //    และ "ร่าง" ที่นี่ไม่ได้แปลว่าไม่ใช่ของจริง (ส.ค. 69 ทั้งเว็บถูกตีกลับเป็นร่างทีเดียว)
  //    วัสดุของมันอยู่บนชั้นวางจริง ต้องนับ · พอกดเผยแพร่แล้วตัดสต๊อกได้ทันทีไม่ต้องมาผูกใหม่
  if (r.id.startsWith("__template")) return false; // แม่แบบ ไม่ใช่ของขาย
  if (/^__.*__$/.test(r.id)) return false; // แถวคอนฟิกที่ปนอยู่ในตารางเดียวกัน
  if (!d.name || typeof d.price !== "number") return false; // ไม่มีชื่อ/ราคา = ไม่ใช่สินค้า
  // 1:1 ได้เมื่อ "ไม่มีมิติที่กินสต๊อก" — มีแต่ตัวเลือกกระบวนการ (สกรีนกี่ด้าน/ตำแหน่งงาน) ก็ยังนับ
  // เพราะสกรีน 1 หรือ 2 ด้านก็ใช้ของชิ้นเดิม · ถ้ามี ขนาด/เนื้อผ้า/สี ต้องไปผูกที่ตัวเลือกแทน
  return !(d.options ?? []).some((o) => isMaterialDim(o.label));
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
    family: familyOf(r.data),
    draft: !!r.data.hidden,
    match: hit,
    alreadyLinked,
  };
});

const drafts = plan.filter((p) => p.draft).length;
console.log(`สินค้าจริงที่ขายทั้งชิ้น (ไม่มีตัวเลือก): ${plan.length} ตัว — เผยแพร่ ${plan.length - drafts} · ร่าง ${drafts}\n`);
for (const p of plan.slice(0, 20)) {
  const state = p.alreadyLinked ? `ผูกแล้ว → ${p.alreadyLinked.code ?? p.alreadyLinked.id}` : p.match ? `ใช้ SKU เดิม → ${p.match.code ?? p.match.id}` : `สร้างใหม่ ${codeOf(p.productId)}`;
  console.log(`   ${p.draft ? "ร่าง" : "    "} ${p.productId.padEnd(24)} ${String(p.name).slice(0, 30).padEnd(32)} ฿${String(p.price).padEnd(6)} ${state}`);
}
if (plan.length > 20) console.log(`   … อีก ${plan.length - 20} ตัว`);
const toCreate = plan.filter((p) => !p.alreadyLinked && !p.match).length;
const toReuse = plan.filter((p) => !p.alreadyLinked && p.match).length;
console.log(`\n📊 สร้างใหม่ ${toCreate} · ใช้ SKU เดิม ${toReuse} · ผูกอยู่แล้ว ${plan.length - toCreate - toReuse}`);

if (!WRITE) {
  console.log(`\n💡 ยังไม่เขียนอะไร — ใส่ --write ถ้าจะเขียนจริง`);
  process.exit(0);
}

const now = new Date().toISOString();
let created = 0, linkedN = 0;
// ชื่อที่สร้างไปแล้ว "ในรอบนี้" — สินค้าคนละใบชื่อเดียวกัน (UV Printing 6 ใบคนละราคา)
// ต้องเข้า SKU เดียวกันแล้วเก็บ productId หลายตัว ไม่ใช่สร้างใหม่ทุกใบ
const madeThisRun = new Map();
for (const p of plan) {
  if (p.alreadyLinked) {
    // ซ่อมตระกูลให้ตรงหมวดสินค้าปัจจุบันเสมอ (รันซ้ำได้ — แก้หมวดที่ฝั่งขายแล้วคลังตามให้เอง)
    if (p.alreadyLinked.family !== p.family) {
      await fx.collection("stockItems").doc(p.alreadyLinked.id).update({ family: p.family, updatedAt: now });
      linkedN++;
    }
    continue;
  }
  let target = p.match ?? madeThisRun.get(norm(p.name)) ?? null;
  if (!target) {
    const code = codeOf(p.productId);
    const id = code.toLowerCase();
    // ยามกันเขียนทับ — ถ้ารหัสไปชนของสินค้าตัวอื่น หยุดทันที อย่าเขียนทับเงียบ ๆ
    const clash = await fx.collection("stockItems").doc(id).get();
    if (clash.exists && !(clash.data().productIds ?? []).includes(p.productId)) {
      console.error(`❌ รหัส ${code} ชนกับ SKU ที่มีอยู่ (${clash.data().name}) — ข้าม ${p.productId}`);
      continue;
    }
    const doc = {
      id,
      code,
      name: p.name,
      unit: "ชิ้น",
      category: p.category ?? "สินค้าสำเร็จ",
      family: p.family,
      aliases: [],
      balance: 0, // ต้องเดินนับจริง
      productIds: [p.productId],
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await fx.collection("stockItems").doc(id).set(doc);
    madeThisRun.set(norm(p.name), doc);
    created++;
    continue;
  }
  // มี SKU อยู่แล้ว → เติม productId เข้าไป ไม่แตะยอด/ชื่อ
  const ids = [...new Set([...(target.productIds ?? []), p.productId])];
  // ชื่อเดียวถูกใช้กับสินค้าหลายใบ = อาจเป็นเรทราคา ไม่ใช่ของคนละตัว → ให้คนมาดูก่อนเชื่อ
  await fx
    .collection("stockItems")
    .doc(target.id)
    .update({ productIds: ids, updatedAt: now, ...(ids.length > 2 ? { needsReview: true } : {}) });
  target.productIds = ids;
  linkedN++;
}
console.log(`\n✅ สร้าง SKU ใหม่ ${created} · ผูก productId เข้า SKU เดิม ${linkedN} (ยอด 0 — ต้องเดินนับจริง)`);
process.exit(0);
