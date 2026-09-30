// ครั้งเดียว (30 ก.ย. 69 เย็น): กริ๊บต๊อก (UV) griptok-th — ฐานทรงกลมกับฐานทรงหัวใจเป็นคนละวัสดุ (เจ้าของร้านแจ้ง)
//   - แบบ "ทรงกลม (UV)" × ฐาน สี → ฐาน Griptok ร่วม P-GRIPTOK-CLEAR-MIRROR-1/2/3 (ชุดเดียวกับกริ๊บต๊อกอื่น)
//   - แบบ "ทรงหัวใจ (UV)" × ฐาน สี → ฐานหัวใจของตัวเอง: สีขาว = P-GRIPTOK-TH-12 · สีดำ = กู้ P-GRIPTOK-TH-4 คืน · สีใส ไม่มี (champ ลบ 22 ก.ย.)
//   - กลุ่ม "ฐาน" ไม่ผูกอะไรเอง (สีไปตัดผ่านลิงก์ของกลุ่มแบบ) — กันตัดซ้อน
//   - ปลด SKU ทรงกลม/หัวใจ ที่แยกซ้ำ (TH-7 8 9 10 11 13 14 · ยอด 0 ไม่มีประวัติ)
// ใช้: node scripts/stock-griptok-th-heart-base.mjs [--apply]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const die = (m) => { console.log("⛔", m); process.exit(1); };
const BY = "Claude (ฐานทรงกลม/หัวใจ กริ๊บต๊อก UV แยกกัน ตามที่เจ้าของร้านแจ้ง 30 ก.ย. 69)";
const ID = "griptok-th", BOM_PART = "วัสดุแฝง";
const ROUND = { "สีขาว": "P-GRIPTOK-CLEAR-MIRROR-1", "สีดำ": "P-GRIPTOK-CLEAR-MIRROR-2", "สีใส": "P-GRIPTOK-CLEAR-MIRROR-3" };
const HEART = { "สีขาว": { code: "P-GRIPTOK-TH-12", name: "ฐาน Griptok หัวใจ · สีขาว" }, "สีดำ": { code: "P-GRIPTOK-TH-4", name: "ฐาน Griptok หัวใจ · สีดำ", restore: true } };
const HEART_FAMILY = "ฐาน Griptok หัวใจ";

const all = (await db.collection("stockItems").get()).docs.map(d=>({ id: d.id, ...d.data() }));
const byCodeAny = Object.fromEntries(all.map(i=>[i.code, i]));
const byId = Object.fromEntries(all.map(i=>[i.id, i]));
const round = Object.fromEntries(Object.entries(ROUND).map(([k,c]) => { const i = byCodeAny[c]; if (!i || i.active===false) die("ไม่พบ/ถูกลบ " + c); return [k, i]; }));
const heart = Object.fromEntries(Object.entries(HEART).map(([k,h]) => { const i = byCodeAny[h.code]; if (!i) die("ไม่พบ " + h.code); if (i.active===false && !h.restore) die(h.code + " ถูกลบ"); return [k, i]; }));
const keepIds = new Set([...Object.values(round), ...Object.values(heart)].map(i=>i.id));

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single(); if (error) die(error.message);
const opts = row.data.options;
const gi = (label) => { const ix = opts.map((o,i)=>[o,i]).filter(([o])=>o.label===label && !o.presetId).map(([,i])=>i); if (ix.length!==1) die(`กลุ่ม "${label}" มี ${ix.length}`); return ix[0]; };
const sI = gi("แบบ"), bI = gi("ฐาน");
const baseNames = opts[bI].choices.map(c=>c.name);
for (const k of Object.keys(ROUND)) if (!baseNames.includes(k)) die(`กลุ่มฐานไม่มี "${k}"`);
const link = (item, color) => ({ stockItemId: item.id, when: [{ label: "ฐาน", choices: [color] }] });
const retireIds = new Set();
const noteOld = (c) => { for (const id of [c.stockItemId, ...(c.stockLinks??[]).map(l=>l.stockItemId)]) if (id && !keepIds.has(id) && /^P-GRIPTOK-TH-/.test(byId[id]?.code ?? "")) retireIds.add(id); };
const next = opts.map((o, i) => {
  if (i === sI) return { ...o, choices: o.choices.map(c => {
    noteOld(c); const { stockItemId, stockQtyPer, stockLinks, ...rest } = c;
    if (/^ทรงกลม/.test(c.name)) return { ...rest, stockLinks: Object.entries(round).map(([k, it]) => link(it, k)) };
    if (/^ทรงหัวใจ/.test(c.name)) return { ...rest, stockLinks: Object.entries(heart).map(([k, it]) => link(it, k)) };
    die(`แบบ "${c.name}" ไม่รู้จัก`);
  }) };
  if (i === bI) return { ...o, choices: o.choices.map(c => { noteOld(c); const { stockItemId, stockQtyPer, stockLinks, ...rest } = c; return rest; }) };
  return o;
});
const canon_ = (v) => Array.isArray(v) ? v.map(canon_) : v && typeof v==="object" ? Object.fromEntries(Object.keys(v).sort().map(k=>[k, canon_(v[k])])) : v;
const changed = JSON.stringify(canon_(next)) !== JSON.stringify(canon_(opts));
// ปลดทุก SKU P-GRIPTOK-TH-* ที่ยัง active และไม่ใช่ตัวที่เก็บ (รวม TH-10 ที่ไม่ได้ผูกอะไร)
for (const i of all) if (i.active!==false && /^P-GRIPTOK-TH-\d+$/.test(i.code) && !keepIds.has(i.id)) retireIds.add(i.id);
const retire = [...retireIds].map(id=>byId[id]).filter(i=>i && i.active!==false);
const { data: allP } = await sb.from("products").select("id,data");
for (const p of allP) { if (p.id===ID) continue; const hit=[]; for (const o of p.data.options??[]) for (const c of o.choices??[]) { if (retireIds.has(c.stockItemId)) hit.push(c.name); for (const l of c.stockLinks??[]) if (retireIds.has(l.stockItemId)) hit.push(c.name); } if (hit.length) die(`สินค้า ${p.id} ยังอ้าง SKU ที่จะปลด: ${hit.join(", ")}`); }
for (const r of retire) { const m = await db.collection("stockMoves").where("itemId","==",r.id).limit(1).get(); if ((r.balance??0)!==0 || !m.empty) die(`${r.code} ยอด ${r.balance}/มีประวัติ — ให้คนดู`); }

console.log("🔗 griptok-th:");
for (const c of next[sI].choices) console.log(`   [แบบ] ${c.name} → ${c.stockLinks.map(l=>`${byId[l.stockItemId].code} เมื่อ ฐาน=${l.when[0].choices[0]}`).join(" | ")}`);
console.log(`   [ฐาน] ${next[bI].choices.map(c=>c.name).join(" / ")} — ไม่ผูกเอง`);
console.log(`\n📦 ฐานหัวใจ (ติดป้าย ${BOM_PART} · ตระกูล ${HEART_FAMILY}):`);
for (const [k, it] of Object.entries(heart)) console.log(`   ${it.code}  "${it.name}" → "${HEART[k].name}"${it.active===false?"  (กู้คืนจากที่ลบ)":""}  ยอด ${it.balance}`);
console.log(`\n🗑 ปลด ${retire.length} SKU:`); for (const r of retire) console.log(`   ${r.code.padEnd(16)} "${r.name}"`);
console.log("\nℹ️ ทรงหัวใจ + ฐานสีใส ไม่มี SKU (champ ลบ 22 ก.ย.) — เลือกคู่นี้แล้วไม่ตัดฐาน");
if (!APPLY) { console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

mkdirSync(".cache/stock-fix", { recursive: true });
const bak = `.cache/stock-fix/griptok-th-heart-base.before-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
writeFileSync(bak, JSON.stringify({ heart, retire, product: row }, null, 2)); console.log("\n💾", bak);
const now = new Date().toISOString();
for (const [k, it] of Object.entries(heart)) {
  const name = HEART[k].name; const aliases = [...new Set([...(it.aliases??[]), it.name, `ทรงหัวใจ (UV) ${k}`].filter(a=>a&&a!==name))];
  const patch = { name, aliases, part: BOM_PART, family: HEART_FAMILY, productIds: [], needsReview: false, updatedAt: now };
  if (it.active===false) Object.assign(patch, { active: true, deletedAt: FieldValue.delete(), deletedBy: FieldValue.delete(), unlinkedFrom: FieldValue.delete() });
  await db.collection("stockItems").doc(it.id).update(patch);
}
console.log("✅ ฐานหัวใจ");
if (changed) {
  await sb.from("product_revisions").insert({ product_id: ID, data: row.data, action: "save", editor: "claude", editor_name: BY }).then(r=>r.error && console.log("(ข้ามประวัติ:", r.error.message, ")"));
  const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...row.data, options: next, savedAt: now } }).eq("id", ID).select("id");
  if (e2 || !upd?.length) die("เขียนสินค้าไม่สำเร็จ: " + (e2?.message ?? "0 แถว"));
  const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
  if (back.data.savedAt !== now || JSON.stringify(canon_(back.data.options)) !== JSON.stringify(canon_(next))) die("อ่านกลับไม่ตรง — รันซ้ำ");
  console.log("✅ ผูก griptok-th (อ่านกลับตรง)");
} else console.log("✅ griptok-th ตรงอยู่แล้ว");
for (const r of retire) { await db.collection("stockItems").doc(r.id).update({ productIds: [], active: false, deletedAt: now, deletedBy: BY, updatedAt: now }); console.log(`✅ ปลด ${r.code}`); }
console.log("\n✅ เสร็จ"); process.exit(0);
