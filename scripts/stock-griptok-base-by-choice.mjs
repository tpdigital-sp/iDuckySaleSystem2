// ครั้งเดียว (30 ก.ย. 69): GRIPTOK MIRROR ตัด "ฐาน Griptok" ตามสีที่ลูกค้าเลือก ไม่ใช่ตัดฐานสีขาวทุกออเดอร์
//   สภาพก่อนแก้ (เกิดจากการกดหน้าจอตอน 09:27–09:28):
//     - ฐาน Griptok · สีขาว (P-GRIPTOK-CLEAR-MIRROR-1) ถูกตั้งเป็น "วัสดุแฝง" ของ griptok-mirror → ตัดทุกออเดอร์แม้เลือกสีดำ/สีใส
//     - griptok-mirror ถูก "แยกสต๊อกตามตัวเลือก" เป็น P-GRIPTOK-MIRROR-1..3 (รูปเป็นฐาน 3 สี = ซ้ำกับชุดฐานกลาง)
//     - ฐาน Griptok · สีดำ/สีใส (CLEAR-MIRROR-2/3) ถูกลบ → สีดำ/สีใสของ 1-4 / griptok-emboss / griptok-clear-mirror หลุดลิงก์ไปด้วย
//   ทำอะไร:
//     1. กู้ CLEAR-MIRROR-2/3 กลับ (active:true) + ถอด bomFor.griptok-mirror ออกจากทั้ง 3 ตัว
//     2. ผูกกลุ่ม "ฐาน Griptok" ของ 4 สินค้า (griptok-mirror, 1-4, griptok-emboss, griptok-clear-mirror) → ฐานกลาง สีขาว/สีดำ/สีใส
//     3. ปลด P-GRIPTOK-MIRROR-1..3 (ยอด 0 · ไม่มีประวัติ · ไม่ใช้กับสินค้าอื่น) — soft delete กู้ได้
// ใช้: node scripts/stock-griptok-base-by-choice.mjs            (ดูอย่างเดียว)
//      node scripts/stock-griptok-base-by-choice.mjs --apply    (เขียนจริง + สำรองที่ .cache/stock-fix/)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});

const GROUP = "ฐาน Griptok";
const SHARED = { "สีขาว": "P-GRIPTOK-CLEAR-MIRROR-1", "สีดำ": "P-GRIPTOK-CLEAR-MIRROR-2", "สีใส (มีรอยขนแมวบ้าง)": "P-GRIPTOK-CLEAR-MIRROR-3" };
const PRODUCTS = ["griptok-mirror", "1-4", "griptok-emboss", "griptok-clear-mirror"];
const RETIRE = ["P-GRIPTOK-MIRROR-1", "P-GRIPTOK-MIRROR-2", "P-GRIPTOK-MIRROR-3"];

const all = (await db.collection("stockItems").get()).docs.map(d=>({ id: d.id, ...d.data() }));
const byCode = Object.fromEntries(all.map(i=>[i.code, i])); // รวมตัวที่ถูกลบ — ต้องกู้กลับ
const shared = Object.entries(SHARED).map(([choice, code]) => ({ choice, code, sku: byCode[code] }));
for (const s of shared) if (!s.sku) { console.log(`⛔ ไม่พบ SKU ${s.code} — หยุด`); process.exit(1); }
const retire = RETIRE.map(c => byCode[c]).filter(Boolean);

const { data: rows, error } = await sb.from("products").select("id,data").in("id", PRODUCTS);
if (error) { console.log("⛔ อ่านสินค้าไม่ได้:", error.message); process.exit(1); }
const plan = [];
for (const pid of PRODUCTS) {
  const row = (rows??[]).find(r=>r.id===pid);
  if (!row) { console.log(`⛔ ไม่พบสินค้า ${pid} — หยุด`); process.exit(1); }
  const opts = row.data.options ?? [];
  const idx = opts.map((o,i)=>[o,i]).filter(([o])=>o.label===GROUP && !o.presetId).map(([,i])=>i);
  if (idx.length !== 1) { console.log(`⛔ ${pid}: กลุ่ม "${GROUP}" มี ${idx.length} กลุ่ม (ต้องมี 1) — หยุด`); process.exit(1); }
  const oi = idx[0];
  const names = (opts[oi].choices??[]).map(c=>c.name);
  const missing = Object.keys(SHARED).filter(n=>!names.includes(n));
  if (missing.length) { console.log(`⛔ ${pid}: กลุ่ม "${GROUP}" ไม่มีค่า ${missing.join(", ")} (มี: ${names.join(" / ")}) — หยุด`); process.exit(1); }
  const nextOptions = opts.map((o,i) => i!==oi ? o : { ...o, choices: (o.choices??[]).map(c => {
    const code = SHARED[c.name]; if (!code) return c;
    const sku = byCode[code];
    if (c.stockItemId === sku.id) return c;
    const { stockQtyPer, ...rest } = c; // เปลี่ยน SKU = อัตราเดิมไม่ตามไป (กติกาเดียวกับ route link)
    return { ...rest, stockItemId: sku.id };
  }) });
  plan.push({ pid, row, oi, nextOptions, changed: JSON.stringify(nextOptions[oi]) !== JSON.stringify(opts[oi]) });
}

// ด่านก่อนปลด: ยอด 0 + ไม่มีประวัติ + ไม่ผูกสินค้าอื่น + ไม่มีตัวเลือกของสินค้าอื่นชี้มา (นอกจาก 4 ตัวที่กำลังย้าย)
if (retire.length) {
  const ids = retire.map(r=>r.id);
  const moves = await db.collection("stockMoves").where("itemId","in",ids).limit(5).get();
  const { data: allProds } = await sb.from("products").select("id,data");
  for (const r of retire) {
    const hasMoves = moves.docs.some(d=>d.data().itemId===r.id);
    const refs = (allProds??[]).filter(p=>!PRODUCTS.includes(p.id) && JSON.stringify(p.data).includes(r.id)).map(p=>p.id);
    if ((r.balance??0) !== 0 || hasMoves || (r.productIds??[]).length || refs.length || (r.bomFor && Object.keys(r.bomFor).length)) {
      console.log(`⛔ ${r.code}: ยอด ${r.balance} · ประวัติ ${hasMoves?"มี":"ไม่มี"} · productIds ${JSON.stringify(r.productIds)} · อ้างจาก ${JSON.stringify(refs)} — ปลดไม่ได้ ให้คนตัดสินใจ`); process.exit(1);
    }
  }
}

console.log("📦 ฐานกลาง:");
for (const s of shared) console.log(`  ${s.code}  "${s.sku.name}"  active=${s.sku.active!==false}${s.sku.active===false?"  → กู้กลับ":""}  bomFor=${JSON.stringify(s.sku.bomFor??{})}${s.sku.bomFor?.["griptok-mirror"]?"  → ถอดวัสดุแฝง griptok-mirror":""}`);
console.log("\n🔗 ผูกกลุ่ม ฐาน Griptok:");
for (const p of plan) {
  console.log(`  ${p.pid} | ${p.row.data.name}${p.changed?"":"  (ผูกครบอยู่แล้ว)"}`);
  for (const c of p.nextOptions[p.oi].choices) { const sk = all.find(i=>i.id===c.stockItemId); const was = (p.row.data.options[p.oi].choices.find(x=>x.name===c.name)||{}).stockItemId; const wasSk = all.find(i=>i.id===was); console.log(`      ${c.name}  →  ${sk ? sk.code : "(ไม่ตัด)"}${was!==c.stockItemId?`   (เดิม ${wasSk?wasSk.code:"ไม่ตัด"})`:""}`); }
}
console.log("\n🗑 ปลด SKU ซ้ำ (ยอด 0 · ไม่มีประวัติ):");
for (const r of retire) console.log(`  ${r.code}  "${r.name}"`);
if (!APPLY) { console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

mkdirSync(".cache/stock-fix", { recursive: true });
const bak = `.cache/stock-fix/griptok-base-by-choice.before-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
writeFileSync(bak, JSON.stringify({ shared: shared.map(s=>s.sku), retire, products: plan.map(p=>p.row) }, null, 2));
console.log("\n💾 สำรองที่", bak);

const now = new Date().toISOString();
const BY = "Claude (ฐาน Griptok ตัดตามสีที่เลือก · เจ้าของร้านขอ 30 ก.ย. 69)";
for (const s of shared) {
  const ref = db.collection("stockItems").doc(s.sku.id);
  await ref.update({ ...(s.sku.active===false ? { active: true, deletedAt: FieldValue.delete(), deletedBy: FieldValue.delete() } : {}), updatedAt: now });
  if (s.sku.bomFor?.["griptok-mirror"]) await ref.update(new FieldPath("bomFor", "griptok-mirror"), FieldValue.delete());
  console.log(`✅ ฐาน ${s.code} พร้อมใช้`);
}
for (const p of plan) {
  if (!p.changed) continue;
  await sb.from("product_revisions").insert({ product_id: p.row.id, data: p.row.data, action: "save", editor: "claude", editor_name: BY }).then(r=>r.error && console.log("(ข้ามประวัติ:", r.error.message, ")"));
  const { error: e2 } = await sb.from("products").update({ data: { ...p.row.data, options: p.nextOptions } }).eq("id", p.row.id);
  if (e2) { console.log(`⛔ เขียนสินค้า ${p.row.id} ไม่สำเร็จ:`, e2.message); process.exit(1); }
  console.log(`✅ ผูกแล้ว ${p.row.id}`);
}
for (const r of retire) {
  await db.collection("stockItems").doc(r.id).update({ productIds: [], active: false, deletedAt: now, deletedBy: BY, updatedAt: now });
  console.log(`✅ ปลดแล้ว ${r.code}`);
}
console.log("\n✅ เสร็จ");
process.exit(0);
