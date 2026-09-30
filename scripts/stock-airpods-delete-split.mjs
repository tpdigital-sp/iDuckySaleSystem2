// ครั้งเดียว (30 ก.ย. 69): เจ้าของร้านสั่ง "ลบ SKU Airpods ที่แยกตามตัวเลือกออกทั้งหมด เดี๋ยวจะแยกใหม่อีกรอบ"
//   - ลบเฉพาะลูก P-CASE-AIRPODS-1..50 (ยอด 0 ไม่มีประวัติ) · ตัวแม่ P-CASE-AIRPODS เก็บไว้ (มีประวัติขาย 1 รายการ)
//   - ทำเหมือน route DELETE /api/admin/stock ทุกขั้น: soft delete (active:false) → ถอด stockItemId/stockLinks จากทุกแถว products
//     → จด unlinkedFrom[] ไว้กู้คืน → เก็บ product_revisions (เหตุที่ไม่ยิง API: เบราว์เซอร์ของ Claude ไม่ได้ล็อกอิน)
// ใช้: node scripts/stock-airpods-delete-split.mjs [--apply]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const die = (m) => { console.log("⛔", m); process.exit(1); };
const BY = "Claude (ลบ SKU Airpods ที่แยกตามตัวเลือก เพื่อแยกใหม่ ตามที่เจ้าของร้านขอ 30 ก.ย. 69)";
const RATE_LABEL = "เรทราคา", RATE_OPTION_INDEX = -1;

const all = (await db.collection("stockItems").get()).docs.map(d=>({ id: d.id, ...d.data() }));
const targets = all.filter(i => i.active!==false && /^P-CASE-AIRPODS-\d+$/.test(i.code ?? ""));
if (!targets.length) die("ไม่พบ SKU ลูก P-CASE-AIRPODS-*");
for (const t of targets) {
  const m = await db.collection("stockMoves").where("itemId","==",t.id).limit(1).get();
  if (m.size || t.balance) die(`${t.code} มียอด/ประวัติ (balance ${t.balance}) — ให้คนดู`);
}
const ids = new Set(targets.map(t=>t.id));
console.log(`จะลบ ${targets.length} ตัว:`, targets.map(t=>t.code).join(", "));

// หาแถว products ที่อ้าง SKU พวกนี้ (options / priceRates / choices ของ preset)
const { data: rows, error } = await sb.from("products").select("id,data"); if (error) die(error.message);
const hits = (c) => ids.has(c.stockItemId) || (c.stockLinks ?? []).some(l => ids.has(l.stockItemId));
const refsOf = new Map(); // skuId → UnlinkedRef[]
const push = (skuId, r) => (refsOf.get(skuId) ?? refsOf.set(skuId, []).get(skuId)).push(r);
const strip = (chs, rowId, label, optionIndex) => chs.map((c) => {
  if (!hits(c)) return c;
  if (ids.has(c.stockItemId)) push(c.stockItemId, { rowId, ...(label !== undefined ? { label } : {}), ...(optionIndex !== undefined ? { optionIndex } : {}), choice: c.name, main: true, ...(c.stockQtyPer ? { stockQtyPer: c.stockQtyPer } : {}) });
  for (const l of c.stockLinks ?? []) if (ids.has(l.stockItemId)) push(l.stockItemId, { rowId, ...(label !== undefined ? { label } : {}), ...(optionIndex !== undefined ? { optionIndex } : {}), choice: c.name, extra: { ...(l.per ? { per: l.per } : {}), when: l.when ?? [] } });
  const rest = (c.stockLinks ?? []).filter(l => !ids.has(l.stockItemId));
  const drop = [...(ids.has(c.stockItemId) ? ["stockItemId", "stockQtyPer"] : []), ...(rest.length ? [] : ["stockLinks"])];
  const base = Object.fromEntries(Object.entries(c).filter(([k]) => !drop.includes(k)));
  return rest.length ? { ...base, stockLinks: rest } : base;
});
// สต๊อกตามเรท: กลุ่มเสมือนเก็บบน priceRates[i].stock (ดู lib/stock-rate.ts)
const rateOpt = (rates) => { const r = (rates ?? []).find(r => r?.stock?.choices?.length); return r?.stock; };
const updates = [];
for (const r of rows) {
  const d = r.data; if (!d) continue;
  const isPreset = r.id.startsWith("__preset_"), isProduct = !r.id.startsWith("__");
  const hitPreset = isPreset && (d.choices ?? []).some(hits);
  const hitProduct = isProduct && (d.options ?? []).some(o => (o.choices ?? []).some(hits));
  const hitRate = isProduct && (rateOpt(d.priceRates)?.choices ?? []).some(hits);
  if (!hitPreset && !hitProduct && !hitRate) continue;
  const next = hitPreset ? { ...d, choices: strip(d.choices ?? [], r.id) } : {
    ...d,
    options: (d.options ?? []).map((o, oi) => ({ ...o, choices: strip(o.choices ?? [], r.id, o.label, oi) })),
    ...(hitRate ? { priceRates: d.priceRates.map(pr => pr?.stock?.choices?.length ? { ...pr, stock: { ...pr.stock, choices: strip(pr.stock.choices, r.id, RATE_LABEL, RATE_OPTION_INDEX) } } : pr) } : {}),
  };
  updates.push({ id: r.id, prev: d, next, hitRate });
}
for (const u of updates) console.log(`ถอดลิงก์จาก ${u.id}${u.hitRate ? " (รวมสต๊อกตามเรท)" : ""}`);
const totalRefs = [...refsOf.values()].reduce((s, a) => s + a.length, 0);
console.log(`ลิงก์ที่จะถอดรวม ${totalRefs} จุด · SKU ที่มีลิงก์ ${refsOf.size}/${targets.length}`);
if (!APPLY) { console.log("(dry-run — ใส่ --apply เพื่อลงมือ)"); process.exit(0); }

for (const u of updates) {
  await sb.from("product_revisions").insert({ product_id: u.id, data: u.prev, action: "save", editor: null, editor_name: BY });
  const { error: e } = await sb.from("products").update({ data: u.next }).eq("id", u.id); if (e) die(`${u.id}: ${e.message}`);
}
const now = new Date().toISOString();
for (const t of targets) {
  const refs = refsOf.get(t.id) ?? []; const { id: _id, ...doc } = t;
  await db.collection("stockItems").doc(t.id).set({ ...doc, active: false, deletedAt: now, deletedBy: BY, updatedAt: now, ...(refs.length ? { unlinkedFrom: refs } : {}) }, { merge: false });
}
console.log(`✅ ลบแล้ว ${targets.length} ตัว · แก้สินค้า ${updates.length} แถว`);
