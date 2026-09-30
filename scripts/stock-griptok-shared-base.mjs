// ครั้งเดียว (30 ก.ย. 69): กริ๊บต๊อก 3 ตัว (กระจกอะคริลิคใส / อะคริลิค 1-4 / ปั๊มนูน) ใช้ "ฐาน Griptok" ขาว/ดำ/ใส ชุดเดียวกัน
//   - ใช้ SKU P-GRIPTOK-CLEAR-MIRROR-1..3 (ที่แยกไว้แล้ว) เป็นตัวกลาง → เปลี่ยนชื่อเป็น "ฐาน Griptok · สี…" + ตระกูล "ฐาน Griptok"
//   - ผูกลง choice.stockItemId ของกลุ่ม "ฐาน Griptok" ในสินค้า 1-4 และ griptok-emboss (เทียบเท่าหน้า /admin/stock/link)
//   - ปลด SKU รวมทั้งตัว P-1-4 / P-GRIPTOK-EMBOSS (ยอด 0 ไม่มีประวัติ) กันตัด 2 เด้ง — soft delete เหมือนปุ่มแยกสต๊อก
// ใช้: node scripts/stock-griptok-shared-base.mjs            (ดูอย่างเดียว)
//      node scripts/stock-griptok-shared-base.mjs --apply    (เขียนจริง + สำรองที่ .cache/stock-fix/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});

const GROUP = "ฐาน Griptok";
const FAMILY = "ฐาน Griptok";
/** ค่าในกลุ่ม → SKU กลาง (รหัส) + ชื่อใหม่ */
const SHARED = {
  "สีขาว": { code: "P-GRIPTOK-CLEAR-MIRROR-1", name: "ฐาน Griptok · สีขาว" },
  "สีดำ": { code: "P-GRIPTOK-CLEAR-MIRROR-2", name: "ฐาน Griptok · สีดำ" },
  "สีใส (มีรอยขนแมวบ้าง)": { code: "P-GRIPTOK-CLEAR-MIRROR-3", name: "ฐาน Griptok · สีใส" },
};
/** สินค้าที่ต้องผูกเพิ่ม → SKU รวมทั้งตัวที่ต้องปลด */
const TARGETS = [
  { productId: "1-4", retire: "P-1-4" },
  { productId: "griptok-emboss", retire: "P-GRIPTOK-EMBOSS" },
  { productId: "griptok-clear-mirror", retire: null }, // ผูกอยู่แล้ว เอาไว้ตรวจซ้ำ
];

const all = (await db.collection("stockItems").get()).docs.map(d=>({ id: d.id, ...d.data() }));
const byCode = Object.fromEntries(all.filter(i=>i.active!==false).map(i=>[i.code, i]));
const shared = Object.entries(SHARED).map(([choice, s]) => ({ choice, ...s, sku: byCode[s.code] }));
for (const s of shared) if (!s.sku) { console.log(`⛔ ไม่พบ SKU ${s.code} — หยุด`); process.exit(1); }

const { data: rows, error } = await sb.from("products").select("id,data").in("id", TARGETS.map(t=>t.productId));
if (error) { console.log("⛔ อ่านสินค้าไม่ได้:", error.message); process.exit(1); }
const rowOf = Object.fromEntries((rows??[]).map(r=>[r.id, r]));

const plan = [];
for (const t of TARGETS) {
  const row = rowOf[t.productId];
  if (!row) { console.log(`⛔ ไม่พบสินค้า ${t.productId} — หยุด`); process.exit(1); }
  const opts = row.data.options ?? [];
  const idx = opts.map((o,i)=>[o,i]).filter(([o])=>o.label===GROUP && !o.presetId).map(([,i])=>i);
  if (idx.length !== 1) { console.log(`⛔ ${t.productId}: กลุ่ม "${GROUP}" มี ${idx.length} กลุ่ม (ต้องมี 1) — หยุด`); process.exit(1); }
  const oi = idx[0];
  const names = (opts[oi].choices??[]).map(c=>c.name);
  const missing = Object.keys(SHARED).filter(n=>!names.includes(n));
  if (missing.length) { console.log(`⛔ ${t.productId}: กลุ่ม "${GROUP}" ไม่มีค่า ${missing.join(", ")} (มี: ${names.join(" / ")}) — หยุด`); process.exit(1); }
  const nextOptions = opts.map((o,i) => i!==oi ? o : { ...o, choices: (o.choices??[]).map(c => {
    const s = SHARED[c.name]; if (!s) return c;
    const sku = byCode[s.code];
    if (c.stockItemId === sku.id) return c;
    const { stockQtyPer, ...rest } = c; // เปลี่ยน SKU = อัตราเดิมไม่ตามไป (กติกาเดียวกับ route link)
    return { ...rest, stockItemId: sku.id };
  }) });
  const changed = JSON.stringify(nextOptions[oi]) !== JSON.stringify(opts[oi]);
  const retire = t.retire ? byCode[t.retire] : null;
  if (t.retire && !retire) console.log(`  (ℹ️ ${t.retire} ไม่พบ/ถูกลบไปแล้ว — ข้าม)`);
  plan.push({ t, row, oi, nextOptions, changed, retire });
}

// ด่านก่อนปลด SKU รวม: ยอด 0 + ไม่มีประวัติ + ไม่ได้ใช้กับสินค้าอื่น
const retireIds = plan.map(p=>p.retire?.id).filter(Boolean);
if (retireIds.length) {
  const moves = await db.collection("stockMoves").where("itemId","in",retireIds).limit(5).get();
  for (const p of plan) {
    const r = p.retire; if (!r) continue;
    const others = (r.productIds??[]).filter(x=>x!==p.t.productId);
    const hasMoves = moves.docs.some(d=>d.data().itemId===r.id);
    if (r.balance !== 0 || hasMoves || others.length) { console.log(`⛔ ${r.code}: ยอด ${r.balance} · ประวัติ ${hasMoves?"มี":"ไม่มี"} · สินค้าอื่น ${JSON.stringify(others)} — ปลดไม่ได้ ให้คนตัดสินใจ`); process.exit(1); }
  }
}

console.log("📦 SKU กลาง (เปลี่ยนชื่อ + ตระกูล):");
for (const s of shared) console.log(`  ${s.code}  "${s.sku.name}" → "${s.name}"  ตระกูล "${s.sku.family??"-"}" → "${FAMILY}"  ยอด ${s.sku.balance}`);
console.log("\n🔗 ผูกตัวเลือก:");
for (const p of plan) {
  console.log(`  ${p.t.productId} | ${p.row.data.name} | กลุ่ม [${p.oi}] ${GROUP}${p.changed?"":"  (ผูกครบอยู่แล้ว)"}`);
  for (const c of p.nextOptions[p.oi].choices) { const sk = all.find(i=>i.id===c.stockItemId); console.log(`      ${c.name}  →  ${sk ? sk.code : "(ไม่ตัด)"}`); }
  if (p.retire) console.log(`      🗑 ปลด SKU รวม ${p.retire.code} "${p.retire.name}" (ยอด 0 · ไม่มีประวัติ)`);
}
if (!APPLY) { console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

mkdirSync(".cache/stock-fix", { recursive: true });
const bak = `.cache/stock-fix/griptok-shared-base.before-${new Date().toISOString().slice(0,10)}.json`;
writeFileSync(bak, JSON.stringify({ shared: shared.map(s=>s.sku), retire: plan.map(p=>p.retire).filter(Boolean), products: plan.map(p=>p.row) }, null, 2));
console.log("\n💾 สำรองที่", bak);

const now = new Date().toISOString();
const BY = "Claude (รวมฐาน Griptok ใช้ร่วม 3 สินค้า ตามที่เจ้าของร้านขอ 30 ก.ย. 69)";
for (const s of shared) {
  const aliases = [...new Set([...(s.sku.aliases??[]), s.sku.name, s.choice].filter(a=>a && a!==s.name))];
  await db.collection("stockItems").doc(s.sku.id).update({ name: s.name, aliases, family: FAMILY, needsReview: false, updatedAt: now });
}
for (const p of plan) {
  if (p.changed) {
    await sb.from("product_revisions").insert({ product_id: p.row.id, data: p.row.data, action: "save", editor: "claude", editor_name: BY }).then(r=>r.error && console.log("(ข้ามประวัติ:", r.error.message, ")"));
    const { error: e2 } = await sb.from("products").update({ data: { ...p.row.data, options: p.nextOptions } }).eq("id", p.row.id);
    if (e2) { console.log(`⛔ เขียนสินค้า ${p.row.id} ไม่สำเร็จ:`, e2.message); process.exit(1); }
    console.log(`✅ ผูกแล้ว ${p.row.id}`);
  }
  if (p.retire) {
    await db.collection("stockItems").doc(p.retire.id).update({ productIds: [], active: false, deletedAt: now, deletedBy: BY, updatedAt: now });
    console.log(`✅ ปลดแล้ว ${p.retire.code}`);
  }
}
console.log("\n✅ เสร็จ");
process.exit(0);
