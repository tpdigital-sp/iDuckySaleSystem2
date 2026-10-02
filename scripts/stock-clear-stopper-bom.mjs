#!/usr/bin/env node
/**
 * 🔩 จุกใส (อะไหล่จุกสีใส) → คลังวัสดุแฝง หมวด "อะไหล่ตะขอ / เข็มกลัด" + ผูก 3 สินค้าที่ใช้ (เจ้าของร้านสั่ง 2 ต.ค. 69)
 *
 *   node scripts/stock-clear-stopper-bom.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/stock-clear-stopper-bom.mjs --apply   # เขียนจริง (รันซ้ำได้ — เช็คทีละขั้นว่าทำไปแล้วหรือยัง)
 *
 * ผูกแบบไหน:
 *   • พวงกุญแจจุกใส (keyring-clear-stopper) + สแตนดี้อะคริลิคจุกใส (new-mt1k6h3q-6601) ใช้ทุกชิ้นเสมอ → bomFor ×1 (ตัดที่ cutStockForOrder 1b)
 *   • สแตนดี้พวงกุญแจ (standee-keyring) จุกเป็นตัวเลือก → choice.stockItemId บนค่า "ใส่จุกใส (ระบุตำแหน่งเองได้)" ในกลุ่ม "จุกใส"
 *     (ตัดเฉพาะเมื่อลูกค้าเลือก — ทางเดียวกับ POST /api/admin/stock/link)
 * สคริปต์รันนอก Next จึงเขียน Firestore/Supabase ตรง ๆ แบบเดียวกับ saveStockItem/setBom (stock.ts ติด "server-only")
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const NAME = "จุกใส";
const ALIASES = ["จุกสีใส", "อะไหล่จุกสีใส"];
const CATEGORY = "อะไหล่ตะขอ / เข็มกลัด";
const PART = "วัสดุแฝง"; // = BOM_PART ใน src/lib/stock-match.ts
const BOM_PRODUCTS = ["keyring-clear-stopper", "new-mt1k6h3q-6601"]; // ใช้ทุกชิ้น ×1
const CHOICE_PRODUCT = { id: "standee-keyring", label: "จุกใส", choice: "ใส่จุกใส (ระบุตำแหน่งเองได้)" };

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const die = (m) => { console.error(`❌ ${m}`); process.exit(1); };
const now = () => new Date().toISOString();

/* ── 0) สินค้าทั้ง 3 ต้องมีจริง (ผูกกับรหัสที่ไม่มี = ลิงก์ตายตั้งแต่เกิด) ── */
const ids = [...BOM_PRODUCTS, CHOICE_PRODUCT.id];
const { data: prows, error: perr } = await sb.from("products").select("id,name,data").in("id", ids);
if (perr) die(`อ่านสินค้าไม่ได้ — ${perr.message}`);
for (const id of ids) if (!prows.some((p) => p.id === id)) die(`ไม่พบสินค้า ${id}`);
const nameOf = (id) => prows.find((p) => p.id === id)?.name ?? id;

/* ── 1) SKU จุกใส — มีแล้วใช้ตัวเดิม ไม่มีสร้างใหม่รหัส BOM-n ── */
const all = (await db.collection("stockItems").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
let sku = all.find((x) => x.active !== false && x.name?.trim() === NAME && (x.part === PART || x.bomFor));
if (sku) console.log(`✓ มี SKU อยู่แล้ว: ${sku.code} ${sku.name} (${sku.id}) หมวด ${sku.category ?? "-"}`);
else {
  const dup = all.filter((x) => x.active !== false && /จุก/.test(x.name ?? "") && !/^P-/.test(x.code ?? ""));
  if (dup.length) die(`มี SKU ชื่อคล้ายอยู่แล้ว: ${dup.map((x) => `${x.code} ${x.name}`).join(", ")} — ตรวจก่อน`);
  const taken = new Set(all.map((x) => x.code).filter((c) => /^BOM-\d+$/.test(c ?? "")));
  const scanMax = Math.max(0, ...[...taken].map((c) => Number(c.slice(4))));
  sku = { id: `sku-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: NAME, code: `BOM-${scanMax + 1} (จองจริงตอนเขียน)`, aliases: ALIASES, unit: "ชิ้น", part: PART, category: CATEGORY, balance: 0, productIds: [], active: true };
  console.log(`＋ สร้าง SKU ใหม่: ${sku.code} "${NAME}" หมวด ${CATEGORY} ชนิด ${PART} หน่วย ชิ้น · ชื่ออื่น ${ALIASES.join("/")}`);
  if (APPLY) {
    // จองเลขที่ stockMeta/codeSeq แบบเดียวกับ reserveCodeNumber ใน stock.ts (กันชนกับคำขอจากหน้าเว็บ)
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
    await db.collection("stockItems").doc(sku.id).set({ id: sku.id, name: NAME, code, aliases: ALIASES, unit: "ชิ้น", part: PART, category: CATEGORY, balance: 0, productIds: [], active: true, createdAt: t, updatedAt: t });
    const back = (await db.collection("stockItems").doc(sku.id).get()).data();
    if (back?.code !== code || back?.category !== CATEGORY || back?.part !== PART) die("อ่านกลับ SKU ไม่ตรงที่เขียน");
    console.log(`  ✅ สร้างแล้ว ${code} (${sku.id})`);
  }
}

/* ── 2) วัสดุแฝง ×1 ของ 2 สินค้าที่ใช้ทุกชิ้น ── */
for (const pid of BOM_PRODUCTS) {
  const cur = sku.bomFor?.[pid];
  if (cur === 1) { console.log(`✓ ${nameOf(pid)} ผูกวัสดุแฝง ×1 อยู่แล้ว`); continue; }
  console.log(`＋ ${nameOf(pid)} [${pid}] → วัสดุแฝง ×1${cur ? ` (เดิม ×${cur})` : ""}`);
  if (APPLY) {
    await db.collection("stockItems").doc(sku.id).update(new FieldPath("bomFor", pid), 1, "updatedAt", now());
    const back = (await db.collection("stockItems").doc(sku.id).get()).data();
    if (back?.bomFor?.[pid] !== 1) die(`อ่านกลับ bomFor[${pid}] ไม่ตรง`);
  }
}

/* ── 3) ตัวเลือก "ใส่จุกใส" ของสแตนดี้พวงกุญแจ → stockItemId (ตัดเฉพาะที่เลือก) ── */
{
  const row = prows.find((p) => p.id === CHOICE_PRODUCT.id);
  const opts = row.data.options ?? [];
  const oi = opts.findIndex((o) => o.label === CHOICE_PRODUCT.label && !o.presetId);
  if (oi < 0) die(`${row.name}: ไม่พบกลุ่ม "${CHOICE_PRODUCT.label}" (หรือกลุ่มมาจากคลังกลาง — ต้องผูกที่ preset แทน)`);
  const ch = (opts[oi].choices ?? []).find((c) => c.name === CHOICE_PRODUCT.choice);
  if (!ch) die(`${row.name}: กลุ่ม "${CHOICE_PRODUCT.label}" ไม่มีตัวเลือก "${CHOICE_PRODUCT.choice}" — ชื่ออาจถูกแก้ ตรวจก่อน`);
  if (ch.stockItemId === sku.id) console.log(`✓ ${row.name}: "${CHOICE_PRODUCT.choice}" ผูก SKU นี้อยู่แล้ว`);
  else {
    if (ch.stockItemId) {
      const old = all.find((x) => x.id === ch.stockItemId);
      die(`${row.name}: ตัวเลือกนี้ผูก SKU อื่นอยู่ (${old?.code ?? ch.stockItemId} ${old?.name ?? ""}) — ถอดก่อนค่อยผูกใหม่`);
    }
    console.log(`＋ ${row.name} [${row.id}] กลุ่ม "${CHOICE_PRODUCT.label}" › "${CHOICE_PRODUCT.choice}" → stockItemId ${sku.id} (×1)`);
    if (APPLY) {
      const next = { ...row.data, options: opts.map((o, i) => (i !== oi ? o : { ...o, choices: o.choices.map((c) => (c.name !== CHOICE_PRODUCT.choice ? c : { ...c, stockItemId: sku.id })) })) };
      const { data: upd, error } = await sb.from("products").update({ data: next }).eq("id", row.id).select("id");
      if (error) die(`เขียนสินค้าไม่ได้ — ${error.message}`);
      if (upd?.length !== 1) die(`update โดน ${upd?.length ?? 0} แถว`);
      const { data: back } = await sb.from("products").select("data").eq("id", row.id).single();
      const bc = (back.data.options?.[oi]?.choices ?? []).find((c) => c.name === CHOICE_PRODUCT.choice);
      if (typeof bc?.stockItemId !== "string" || bc.stockItemId !== sku.id) die("อ่านกลับ stockItemId ไม่ตรง");
      console.log("  ✅ ผูกตัวเลือกแล้ว (แคช products-slim บนเว็บหมดอายุเองใน 60 วิ)");
    }
  }
}
console.log(APPLY ? "\n🎉 เสร็จ" : "\n(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)");
process.exit(0);
