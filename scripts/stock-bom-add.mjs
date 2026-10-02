#!/usr/bin/env node
/**
 * 🔩 เพิ่มวัสดุแฝงเข้าคลัง (รหัส BOM-n) + ผูกสินค้าที่ใช้ทุกชิ้น (bomFor ×per) — ใช้ซ้ำได้ทุกวัสดุ
 *
 *   node scripts/stock-bom-add.mjs --name "สปริง 15mm" --category "อะไหล่ตะขอ / เข็มกลัด" --products standee-spring            # ดูก่อน
 *   node scripts/stock-bom-add.mjs --name "สปริง 15mm" --category "อะไหล่ตะขอ / เข็มกลัด" --products standee-spring --apply    # เขียนจริง
 *   ตัวเลือกเพิ่ม: --per 2 (ใช้กี่ชิ้นต่อสินค้า 1 ชิ้น · ค่าเริ่ม 1) · --unit แผ่น · --alias "ชื่ออื่น,ชื่ออื่น" · --products a,b,c
 *
 * รันซ้ำได้: มี SKU ชื่อเดียวกันในคลังแล้ว = ใช้ตัวเดิม · ผูกแล้ว = ข้าม
 * ของที่เป็น "ตัวเลือก" ให้ลูกค้าเลือก (ตัดเฉพาะเมื่อเลือก) ไม่ใช่ทางนี้ — ผูกที่ choice.stockItemId (ดู scripts/stock-clear-stopper-bom.mjs ขั้น 3)
 * สคริปต์รันนอก Next จึงเขียน Firestore ตรง ๆ แบบเดียวกับ saveStockItem/setBom (stock.ts ติด "server-only") + จองรหัสที่ stockMeta/codeSeq เหมือน reserveCodeNumber
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes("--apply");
const NAME = (arg("name", "") || "").trim();
const CATEGORY = (arg("category", "") || "").trim();
const UNIT = (arg("unit", "ชิ้น") || "ชิ้น").trim();
const PER = Number(arg("per", "1"));
const ALIASES = (arg("alias", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const PRODUCTS = (arg("products", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const PART = "วัสดุแฝง"; // = BOM_PART ใน src/lib/stock-match.ts
const die = (m) => { console.error(`❌ ${m}`); process.exit(1); };
if (!NAME) die("ต้องใส่ --name");
if (!PRODUCTS.length) die("ต้องใส่ --products <id,id>");
if (!Number.isFinite(PER) || PER <= 0) die("--per ต้องมากกว่า 0");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const now = () => new Date().toISOString();

/* 0) สินค้าต้องมีจริง · หมวดต้องมีในรายการหมวด (กันพิมพ์ผิดแล้วได้หมวดใหม่โผล่) */
const { data: prows, error: perr } = await sb.from("products").select("id,name").in("id", PRODUCTS);
if (perr) die(`อ่านสินค้าไม่ได้ — ${perr.message}`);
for (const id of PRODUCTS) if (!prows.some((p) => p.id === id)) die(`ไม่พบสินค้า ${id}`);
const nameOf = (id) => prows.find((p) => p.id === id)?.name ?? id;
if (CATEGORY) {
  const cats = (await db.collection("stockMeta").doc("categories").get()).data()?.names ?? [];
  if (!cats.includes(CATEGORY)) die(`ไม่มีหมวด "${CATEGORY}" ในคลัง — หมวดที่มี: ${cats.join(" | ")}`);
}

/* 1) SKU — ชื่อเดียวกันมีแล้วใช้ตัวเดิม · ไม่มีสร้างใหม่ BOM-n */
const all = (await db.collection("stockItems").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
let sku = all.find((x) => x.active !== false && x.name?.trim() === NAME);
if (sku) console.log(`✓ มี SKU อยู่แล้ว: ${sku.code} ${sku.name} (${sku.id}) หมวด ${sku.category ?? "-"}`);
else {
  const taken = new Set(all.map((x) => x.code).filter((c) => /^BOM-\d+$/.test(c ?? "")));
  const scanMax = Math.max(0, ...[...taken].map((c) => Number(c.slice(4))));
  sku = { id: `sku-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: NAME, code: `BOM-${scanMax + 1}` };
  console.log(`＋ สร้าง SKU ใหม่: ~${sku.code} "${NAME}" หมวด ${CATEGORY || "-"} ชนิด ${PART} หน่วย ${UNIT}${ALIASES.length ? ` · ชื่ออื่น ${ALIASES.join("/")}` : ""}`);
  if (APPLY) {
    const seqRef = db.collection("stockMeta").doc("codeSeq");
    const code = await db.runTransaction(async (tx) => {
      const doc = (await tx.get(seqRef)).data() ?? {};
      const seq = { ...(doc.seq ?? {}) };
      let n = Math.max(scanMax + 1, (Number(seq["BOM-"]) || 0) + 1);
      while (taken.has(`BOM-${n}`)) n++;
      seq["BOM-"] = n;
      tx.set(seqRef, { seq, updatedAt: now() });
      return `BOM-${n}`;
    }, { maxAttempts: 20 });
    sku.code = code;
    const t = now();
    const doc = { id: sku.id, name: NAME, code, ...(ALIASES.length ? { aliases: ALIASES } : {}), unit: UNIT, part: PART, ...(CATEGORY ? { category: CATEGORY } : {}), balance: 0, productIds: [], active: true, createdAt: t, updatedAt: t };
    await db.collection("stockItems").doc(sku.id).set(doc);
    const back = (await db.collection("stockItems").doc(sku.id).get()).data();
    if (back?.code !== code || back?.part !== PART || (CATEGORY && back?.category !== CATEGORY)) die("อ่านกลับ SKU ไม่ตรงที่เขียน");
    console.log(`  ✅ สร้างแล้ว ${code} (${sku.id})`);
  }
}

/* 2) bomFor ×PER */
for (const pid of PRODUCTS) {
  const cur = sku.bomFor?.[pid];
  if (cur === PER) { console.log(`✓ ${nameOf(pid)} ผูกวัสดุแฝง ×${PER} อยู่แล้ว`); continue; }
  console.log(`＋ ${nameOf(pid)} [${pid}] → วัสดุแฝง ×${PER}${cur ? ` (เดิม ×${cur})` : ""}`);
  if (APPLY) {
    await db.collection("stockItems").doc(sku.id).update(new FieldPath("bomFor", pid), PER, "updatedAt", now());
    const back = (await db.collection("stockItems").doc(sku.id).get()).data();
    if (back?.bomFor?.[pid] !== PER) die(`อ่านกลับ bomFor[${pid}] ไม่ตรง`);
  }
}
console.log(APPLY ? "🎉 เสร็จ" : "(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)");
process.exit(0);
