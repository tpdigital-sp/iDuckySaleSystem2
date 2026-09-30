// ครั้งเดียว (30 ก.ย. 69 รอบบ่าย): กริ๊บต๊อก 5 สินค้าใช้ "ฐาน Griptok" ขาว/ดำ/ใส ชุดเดียวเป็นวัสดุแฝง (เจ้าของร้านสั่ง)
//   1-4 กริ๊บต๊อกอะคริลิค · griptok-clear-mirror กระจกอะคริลิคใส · griptok-th กริ๊บต๊อก (UV) · griptok-mirror GRIPTOK MIRROR · griptok-emboss ปั๊มนูน
//   - SKU กลาง = P-GRIPTOK-CLEAR-MIRROR-1/2/3 "ฐาน Griptok · สีขาว/สีดำ/สีใส" → ติดป้าย part "วัสดุแฝง" (หน้าสต๊อกจัดไปกลุ่มวัสดุแฝงที่เดียว) · ล้าง bomFor ที่ค้าง
//   - ทุกสินค้า: กลุ่ม "ฐาน Griptok"/"ฐาน" → choice.stockItemId ชี้ SKU กลางตามสี · ถอดลิงก์เสริมที่ชี้ฐานตัวเก่า
//   - griptok-th: กลุ่ม "แบบ" เดิมผูก SKU รวมทรง×สีฐาน 5 ตัว → ยุบเหลือทรงละ 1 SKU (อะคริลิคทรงกลม/หัวใจ UV) เพราะสีฐานไปตัดที่ SKU กลางแล้ว
//   - ปลด SKU ฐานรายสินค้าที่แยกซ้ำไว้ + SKU รวม P-GRIPTOK-TH (ยอด 0 ไม่มีประวัติทั้งหมด — ด่านเช็ค)
// ใช้: node scripts/stock-griptok-base-bom.mjs [--apply]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const die = (m) => { console.log("⛔", m); process.exit(1); };
const BY = "Claude (ฐาน Griptok เป็นวัสดุแฝงร่วม 5 สินค้า ตามที่เจ้าของร้านขอ 30 ก.ย. 69)";
const BOM_PART = "วัสดุแฝง", FAMILY = "ฐาน Griptok";
const CANON = { "สีขาว": "P-GRIPTOK-CLEAR-MIRROR-1", "สีดำ": "P-GRIPTOK-CLEAR-MIRROR-2", "สีใส": "P-GRIPTOK-CLEAR-MIRROR-3" };
const colorOf = (name) => Object.keys(CANON).find(k => name.trim().startsWith(k));
const PRODUCTS = ["1-4", "griptok-clear-mirror", "griptok-th", "griptok-mirror", "griptok-emboss"];
/** griptok-th: SKU ทรง×สี → เหลือทรงละตัว */
const TH_SHAPE = { "ทรงกลม (UV)": { keep: "P-GRIPTOK-TH-1", name: "กริ๊บต๊อก UV · ทรงกลม" }, "ทรงหัวใจ (UV)": { keep: "P-GRIPTOK-TH-2", name: "กริ๊บต๊อก UV · ทรงหัวใจ" } };

const all = (await db.collection("stockItems").get()).docs.map(d=>({ id: d.id, ...d.data() }));
const byCode = Object.fromEntries(all.filter(i=>i.active!==false).map(i=>[i.code, i]));
const byId = Object.fromEntries(all.map(i=>[i.id, i]));
const canon = Object.fromEntries(Object.entries(CANON).map(([k, c]) => [k, byCode[c] ?? die("ไม่พบ " + c)]));
const canonIds = new Set(Object.values(canon).map(i=>i.id));
const keepTh = Object.fromEntries(Object.entries(TH_SHAPE).map(([k, v]) => [k, byCode[v.keep] ?? die("ไม่พบ " + v.keep)]));

const { data: rows, error } = await sb.from("products").select("id,data").in("id", PRODUCTS); if (error) die(error.message);
const rowOf = Object.fromEntries(rows.map(r=>[r.id, r]));
for (const id of PRODUCTS) if (!rowOf[id]) die("ไม่พบสินค้า " + id);
const canon_ = (v) => Array.isArray(v) ? v.map(canon_) : v && typeof v==="object" ? Object.fromEntries(Object.keys(v).sort().map(k=>[k, canon_(v[k])])) : v;
const retireIds = new Set();
const plans = [];
for (const id of PRODUCTS) {
  const row = rowOf[id]; const opts = row.data.options;
  const bi = opts.map((o,i)=>[o,i]).filter(([o])=>/^ฐาน( Griptok)?$/.test(o.label) && !o.presetId).map(([,i])=>i);
  if (bi.length !== 1) die(`${id}: กลุ่มฐานมี ${bi.length} กลุ่ม`);
  const next = opts.map((o, oi) => {
    if (oi === bi[0]) return { ...o, choices: o.choices.map(c => {
      const k = colorOf(c.name) ?? die(`${id}: ฐาน "${c.name}" อ่านสีไม่ออก`);
      const { stockItemId, stockQtyPer, stockLinks, ...rest } = c;
      for (const old of [stockItemId, ...(stockLinks??[]).map(l=>l.stockItemId)]) if (old && !canonIds.has(old)) retireIds.add(old);
      const keep = (stockLinks ?? []).filter(l => canonIds.has(l.stockItemId) ? false : retireIds.has(l.stockItemId) ? false : true);
      return { ...rest, stockItemId: canon[k].id, ...(keep.length ? { stockLinks: keep } : {}) };
    }) };
    if (id === "griptok-th" && o.label === "แบบ") return { ...o, choices: o.choices.map(c => {
      const t = TH_SHAPE[c.name] ?? die(`griptok-th: แบบ "${c.name}" ไม่อยู่ในตาราง`);
      const { stockItemId, stockLinks, ...rest } = c;
      for (const old of [stockItemId, ...(stockLinks??[]).map(l=>l.stockItemId)]) if (old && old !== keepTh[c.name].id) retireIds.add(old);
      return { ...rest, stockItemId: keepTh[c.name].id };
    }) };
    return o;
  });
  const changed = JSON.stringify(canon_(next)) !== JSON.stringify(canon_(opts));
  plans.push({ id, row, next, changed });
}
// SKU รวมทั้งตัวของสินค้าเหล่านี้ (ตัด 2 เด้ง) → ปลดด้วย
for (const i of all) if (i.active!==false && (i.productIds??[]).some(p=>PRODUCTS.includes(p))) { if (canonIds.has(i.id) || Object.values(keepTh).some(k=>k.id===i.id)) continue; retireIds.add(i.id); }
const retire = [...retireIds].map(id=>byId[id]).filter(i=>i && i.active!==false);
// ด่าน: SKU ที่จะปลดต้องยอด 0 ไม่มีประวัติ และไม่มีสินค้านอกรายการอ้าง
const { data: allP } = await sb.from("products").select("id,data");
for (const p of allP) { if (PRODUCTS.includes(p.id)) continue; const hit=[]; for (const o of p.data.options??[]) for (const c of o.choices??[]) { if (retireIds.has(c.stockItemId)) hit.push(c.name); for (const l of c.stockLinks??[]) if (retireIds.has(l.stockItemId)) hit.push(c.name); } if (hit.length) die(`สินค้า ${p.id} ยังอ้าง SKU ที่จะปลด: ${hit.join(", ")}`); }
for (const r of retire) { const m = await db.collection("stockMoves").where("itemId","==",r.id).limit(1).get(); if ((r.balance??0)!==0 || !m.empty) die(`${r.code} ยอด ${r.balance} / มีประวัติ — ให้คนตัดสินใจ`); const others=(r.productIds??[]).filter(p=>!PRODUCTS.includes(p)); if (others.length) die(`${r.code} ผูกทั้งตัวกับสินค้าอื่น ${others}`); }

console.log("📦 SKU กลาง (ติดป้ายวัสดุแฝง · ตระกูล ฐาน Griptok · ล้าง bomFor):");
for (const [k, i] of Object.entries(canon)) console.log(`  ${i.code}  "${i.name}"  ยอด ${i.balance}  part=${i.part??"-"} bomFor=${JSON.stringify(i.bomFor??null)}`);
console.log("📦 griptok-th ทรง (เปลี่ยนชื่อ):"); for (const [k, i] of Object.entries(keepTh)) console.log(`  ${i.code}  "${i.name}" → "${TH_SHAPE[k].name}"`);
for (const p of plans) {
  console.log(`\n🔗 ${p.id} | ${p.row.data.name}${p.changed?"":"  (ตรงอยู่แล้ว)"}`);
  for (const o of p.next) if (/^ฐาน( Griptok)?$/.test(o.label) || (p.id==="griptok-th" && o.label==="แบบ")) for (const c of o.choices) console.log(`   [${o.label}] ${c.name} → ${byId[c.stockItemId]?.code}${c.stockLinks?.length?" + เสริม "+c.stockLinks.map(l=>byId[l.stockItemId]?.code).join(","):""}`);
}
console.log(`\n🗑 ปลด ${retire.length} SKU (ยอด 0 ไม่มีประวัติ):`); for (const r of retire) console.log(`   ${r.code.padEnd(28)} "${r.name}"`);
if (!APPLY) { console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

mkdirSync(".cache/stock-fix", { recursive: true });
const bak = `.cache/stock-fix/griptok-base-bom.before-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
writeFileSync(bak, JSON.stringify({ canon, keepTh, retire, products: rows }, null, 2)); console.log("\n💾", bak);
const now = new Date().toISOString();
for (const i of Object.values(canon)) await db.collection("stockItems").doc(i.id).update({ part: BOM_PART, family: FAMILY, bomFor: {}, productIds: [], needsReview: false, updatedAt: now });
for (const [k, i] of Object.entries(keepTh)) { const name = TH_SHAPE[k].name; const aliases=[...new Set([...(i.aliases??[]), i.name, k].filter(a=>a&&a!==name))]; await db.collection("stockItems").doc(i.id).update({ name, aliases, family: "กริ๊บต๊อก UV", productIds: [], needsReview: false, updatedAt: now }); }
console.log("✅ SKU กลาง + ทรง UV");
for (const p of plans) {
  if (!p.changed) continue;
  await sb.from("product_revisions").insert({ product_id: p.id, data: p.row.data, action: "save", editor: "claude", editor_name: BY }).then(r=>r.error && console.log("(ข้ามประวัติ:", r.error.message, ")"));
  const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...p.row.data, options: p.next, savedAt: now } }).eq("id", p.id).select("id");
  if (e2 || !upd?.length) die(`เขียน ${p.id} ไม่สำเร็จ: ` + (e2?.message ?? "0 แถว"));
  const { data: back } = await sb.from("products").select("data").eq("id", p.id).single();
  if (back.data.savedAt !== now || JSON.stringify(canon_(back.data.options)) !== JSON.stringify(canon_(p.next))) die(`${p.id} อ่านกลับไม่ตรง — รันซ้ำ`);
  console.log(`✅ ผูก ${p.id}`);
}
for (const r of retire) { await db.collection("stockItems").doc(r.id).update({ productIds: [], active: false, deletedAt: now, deletedBy: BY, updatedAt: now }); console.log(`✅ ปลด ${r.code}`); }
console.log("\n✅ เสร็จ"); process.exit(0);
