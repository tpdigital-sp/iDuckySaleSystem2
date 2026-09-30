/**
 * 🧾 ย้ายยอดขายที่ค้างอยู่บน "SKU ทั้งสินค้ารุ่นเก่า" ไปยัง SKU รายตัวเลือกที่แยกทีหลัง (30 ก.ย. 69)
 *
 * เหตุ: กระเป๋าต๊อบแต๊บ / เฟรมการ์ดใส / โฟโต้การ์ด PVC ถูกขายตัดยอดช่วง 24–27 ก.ย. ที่ SKU ทั้งสินค้า (P-CLIP-POUCH ฯลฯ)
 *       ต่อมาถูก "แยกสต๊อกตามตัวเลือก" → ระบบถอด productIds ของตัวเก่าทิ้ง ยอดติดลบเลยค้างที่ตัวที่ไม่มีใครใช้แล้ว
 *       และขึ้นเป็น "ยังไม่ผูก" ในหน้าคลัง (เจ้าของร้านถาม 30 ก.ย. 69)
 * ⚠️ เจ้าของร้านกด "รีเซ็ตยอดทุกรายการเป็น 0" ไปก่อน (16:20 น. 30 ก.ย. 69) → ยอดติดลบหายแล้ว ไม่ต้องย้ายยอดขาย (ตัวเลือก MOVE_BALANCE=false)
 * ทำ:   1) ปิดใช้งาน SKU ทั้งสินค้ารุ่นเก่า (active=false กู้คืนได้จาก "ที่ลบไปแล้ว") — ไม่ให้ค้างเป็น "ยังไม่ผูก"
 *       2) โฟโต้การ์ด PVC: ออเดอร์เลือก "PVC สีใส" แต่ตอนแยกมีแค่ SKU สีขาว → สร้าง SKU สีใส + ผูกกับตัวเลือกให้ (ขายครั้งหน้าถึงตัด)
 *       (ถ้าต้องการย้ายยอดขายจริงในอนาคต ตั้ง MOVE_BALANCE=true — แผนยอดต่อออเดอร์อยู่ใน PLAN)
 * ⚠️ ไม่ทำกับ SHIKISHI — อีกเซสชันย้ายไป A5 ให้แล้ว
 * รัน: node scripts/stock-move-presplit-negatives.mjs          (dry-run)
 *      node scripts/stock-move-presplit-negatives.mjs --apply
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.log("⛔", m); process.exit(1); };
const BY = "Claude (ปิด SKU ทั้งสินค้ารุ่นเก่าหลังแยกตามตัวเลือก 30 ก.ย. 69)";
/** ย้ายยอดขายจากตัวเก่าไปตัวเลือกด้วยไหม — false เพราะเจ้าของร้านรีเซ็ตยอดเป็น 0 ไปแล้ว */
const MOVE_BALANCE = false;

/** old code → ยอดที่คาด + ปลายทาง (จาก selections ของออเดอร์จริง) */
const PLAN = [
  { old: "P-CLIP-POUCH", expect: -40, to: [
    { code: "P-CLIP-POUCH-1", qty: 20, ref: "OD-260925-1264" }, // ขนาด 9.5x9cm
    { code: "P-CLIP-POUCH-2", qty: 20, ref: "OD-260925-1264" }, // ขนาด 11.5x10cm
  ] },
  { old: "P-FRAME-CARD", expect: -54, to: [
    { code: "P-FRAME-CARD-2", qty: 4, ref: "OD-260923-4497" },  // ไม่เจาะรู
    { code: "P-FRAME-CARD-1", qty: 50, ref: "OD-260925-7756" }, // เจาะรู
  ] },
  { old: "P-PHOTOCARD-PVC-UV", expect: -10, to: [
    { code: "P-PHOTOCARD-PVC-UV-2", qty: 10, ref: "OD-260924-1215", create: { productId: "photocard-pvc-uv", optionLabel: "ชนิดบัตร PVC", choice: "PVC สีใส", name: "โฟโต้การ์ด PVC · PVC สีใส", template: "P-PHOTOCARD-PVC-UV-1" } },
  ] },
];

const all = (await db.collection("stockItems").get()).docs.map((d) => d.data());
const byCode = new Map(all.filter((i) => i.code).map((i) => [i.code, i]));
const now = () => new Date().toISOString();

async function addMove(item, qty, reason, note, refOrderId) {
  const itemRef = db.collection("stockItems").doc(item.id);
  const moveRef = db.collection("stockMoves").doc();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists) throw new Error("ไม่พบ " + item.id);
    const cur = snap.data();
    const balanceAfter = (cur.balance ?? 0) + qty;
    const at = now();
    tx.update(itemRef, { balance: balanceAfter, updatedAt: at });
    tx.set(moveRef, { itemId: item.id, itemName: cur.name, qty, reason, note, ...(refOrderId ? { refOrderId } : {}), by: BY, source: "iducky", at, balanceAfter });
    return balanceAfter;
  });
}

for (const p of PLAN) {
  const old = byCode.get(p.old);
  if (!old) die(`ไม่พบ ${p.old}`);
  if (old.active === false) { console.log(`↷ ${p.old} ปิดใช้งานไปแล้ว — ข้าม`); continue; }
  if ((old.productIds ?? []).length) die(`${p.old} ยังผูกสินค้าอยู่ ${JSON.stringify(old.productIds)} — ไม่ใช่เคสนี้`);
  if (MOVE_BALANCE && old.balance !== p.expect) die(`${p.old} ยอด ${old.balance} ไม่ตรงที่คาด ${p.expect} — มีคนแก้ไปแล้ว ตรวจใหม่ก่อน`);
  if (!MOVE_BALANCE && old.balance !== 0) die(`${p.old} ยอด ${old.balance} ไม่ใช่ 0 — ปิดใช้งานไม่ได้ ต้องย้ายยอดก่อน`);
  console.log(`\n== ${p.old} (${old.name}) ยอด ${old.balance}`);
  for (const t of p.to) {
    let target = byCode.get(t.code);
    if (!target && t.create) {
      const tpl = byCode.get(t.create.template);
      if (!tpl) die(`ไม่พบแม่แบบ ${t.create.template}`);
      const id = `sku-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      target = { id, name: t.create.name, code: t.code, unit: tpl.unit || "ชิ้น", family: tpl.family, category: tpl.category, part: tpl.part, aliases: [t.create.choice], balance: 0, productIds: [], active: true, createdAt: now(), updatedAt: now() };
      console.log(`   ＋ สร้าง SKU ${t.code} "${t.create.name}" (หน่วย ${target.unit} · ตระกูล ${target.family}) และผูกกับ ${t.create.productId} · ${t.create.optionLabel} = ${t.create.choice}`);
      if (APPLY) {
        const clean = Object.fromEntries(Object.entries(target).filter(([, v]) => v !== undefined));
        await db.collection("stockItems").doc(id).set(clean);
        // ผูกกับตัวเลือกในสินค้า (choice.stockItemId) — เขียน data ทั้งก้อนแบบเดียวกับ route split แล้วอ่านกลับเทียบ
        const { data: row } = await sb.from("products").select("id,data").eq("id", t.create.productId).maybeSingle();
        if (!row) die("ไม่พบสินค้า " + t.create.productId);
        const next = structuredClone(row.data);
        const opt = (next.options ?? []).find((o) => o.label === t.create.optionLabel);
        const ch = opt?.choices?.find((c) => (c.name ?? c.label) === t.create.choice);
        if (!ch) die(`ไม่พบตัวเลือก ${t.create.optionLabel}=${t.create.choice}`);
        if (ch.stockItemId) die(`ตัวเลือกนี้ผูก ${ch.stockItemId} อยู่แล้ว`);
        ch.stockItemId = id;
        next.savedAt = now();
        const { error } = await sb.from("products").update({ data: next }).eq("id", t.create.productId).select("id");
        if (error) die("อัปเดตสินค้าไม่สำเร็จ: " + error.message);
        const { data: back } = await sb.from("products").select("data").eq("id", t.create.productId).maybeSingle();
        const chk = (back?.data?.options ?? []).find((o) => o.label === t.create.optionLabel)?.choices?.find((c) => (c.name ?? c.label) === t.create.choice);
        if (chk?.stockItemId !== id) die("อ่านกลับแล้ว stockItemId ไม่ตรง — เขียนไม่ลง");
        byCode.set(t.code, target);
      }
    }
    if (!target) die(`ไม่พบ ${t.code}`);
    if (!MOVE_BALANCE) { console.log(`   · ${t.code} (${target.name}) พร้อมใช้ ยอด ${target.balance}`); continue; }
    console.log(`   → ${t.code} (${target.name}) ขาย −${t.qty} อ้างอิง ${t.ref} · ยอดปัจจุบัน ${target.balance}`);
    if (APPLY) {
      const after = await addMove(target, -t.qty, "ขาย", `ย้ายยอดขายมาจาก ${p.old} (SKU ทั้งสินค้ารุ่นเก่า ก่อนแยกตามตัวเลือก)`, t.ref);
      console.log(`     ✓ ${t.code} คงเหลือ ${after}`);
    }
  }
  const total = p.to.reduce((s, t) => s + t.qty, 0);
  console.log(`   ← ${p.old} ${MOVE_BALANCE ? `ปรับยอด +${total} → 0 แล้ว` : ""}ปิดใช้งาน (กู้คืนได้จาก "ที่ลบไปแล้ว")`);
  if (APPLY) {
    if (MOVE_BALANCE) {
      const after = await addMove(old, total, "ปรับยอดนับจริง", `ย้ายยอดขายไป ${p.to.map((t) => t.code).join(", ")} — SKU นี้ถูกแทนด้วย SKU รายตัวเลือกแล้ว`);
      if (after !== 0) die(`${p.old} หลังปรับได้ ${after} ไม่ใช่ 0`);
    }
    await db.collection("stockItems").doc(old.id).update({ active: false, deletedAt: now(), deletedBy: BY, updatedAt: now() });
    console.log(`     ✓ ${p.old} = 0 · ปิดใช้งานแล้ว`);
  }
}
console.log(APPLY ? "\n✅ เสร็จ" : "\n(dry-run — เติม --apply เพื่อทำจริง)");
process.exit(0);
