// ครั้งเดียว (30 ก.ย. 69): Ultra-Hard CardBoard หนา 2 mm (ultra-hard-cardboard-2-mm) ใช้กระดาษแข็งชุดเดียวกับ SHIKISHI (pricelist-shikishi)
//   - SKU กลาง = ของ SHIKISHI P-PRICELIST-SHIKISHI-1..5 (A7 A6 A5 A4 A3) — เจ้าของร้านสั่ง "ใช้ของ shikishi"
//   - Ultra-Hard: choice.stockItemId ของกลุ่ม "ขนาด" ชี้ SKU กลาง (เดิมมี SKU ตัวเอง + ลิงก์เสริมไป SHIKISHI ซ้อนกัน = ตัด 2 เด้ง) → ปลด SKU ตัวเอง 5 ตัว (ยอด 0 ไม่มีประวัติ)
//   - SKU รวมทั้งตัว P-PRICELIST-SHIKISHI (ค้าง productIds [] ยอด -20 จาก OD-260925-1264 = A5 ×10 สองบรรทัด) → ย้ายประวัติขายไป SKU · A5 แล้วปลด
// ใช้: node scripts/stock-shikishi-shared.mjs [--apply]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const die = (m) => { console.log("⛔", m); process.exit(1); };
const BY = "Claude (รวมกระดาษแข็ง SHIKISHI ใช้ร่วม Ultra-Hard CardBoard ตามที่เจ้าของร้านขอ 30 ก.ย. 69)";
const REF = "pricelist-shikishi", TARGET = "ultra-hard-cardboard-2-mm", WHOLE = "P-PRICELIST-SHIKISHI";
const SIZES = [
  { key: "A7", code: "P-PRICELIST-SHIKISHI-1" }, { key: "A6", code: "P-PRICELIST-SHIKISHI-2" }, { key: "A5", code: "P-PRICELIST-SHIKISHI-3" },
  { key: "A4", code: "P-PRICELIST-SHIKISHI-4" }, { key: "A3", code: "P-PRICELIST-SHIKISHI-5" },
];
const sizeKey = (name) => /^(A[3-7])\b/.exec(name.trim())?.[1];

const all = (await db.collection("stockItems").get()).docs.map(d=>({ id: d.id, ...d.data() }));
const byCode = Object.fromEntries(all.filter(i=>i.active!==false).map(i=>[i.code, i]));
const byId = Object.fromEntries(all.map(i=>[i.id, i]));
const canon = Object.fromEntries(SIZES.map(s => [s.key, byCode[s.code] ?? die("ไม่พบ " + s.code)]));
const canonIds = new Set(Object.values(canon).map(i=>i.id));

const { data: rows, error } = await sb.from("products").select("id,data").in("id", [REF, TARGET]); if (error) die(error.message);
const ref = rows.find(r=>r.id===REF) ?? die("ไม่พบ " + REF), tgt = rows.find(r=>r.id===TARGET) ?? die("ไม่พบ " + TARGET);
const gi = (row) => { const ix = row.data.options.map((o,i)=>[o,i]).filter(([o])=>o.label==="ขนาด" && !o.presetId).map(([,i])=>i); if (ix.length!==1) die(`${row.id}: กลุ่มขนาดมี ${ix.length}`); return ix[0]; };
const rS = gi(ref), tS = gi(tgt);
// แม่แบบต้องผูกตรงตามที่คิด
for (const s of SIZES) { const c = ref.data.options[rS].choices.find(c=>c.name===s.key); if (!c || c.stockItemId !== canon[s.key].id) die(`${REF}: "${s.key}" ไม่ได้ผูก ${s.code}`); }
// ลิงก์ใหม่ของ Ultra-Hard: ขนาด "A5 (14.8 x 21.0 ซม.)" → SKU กลาง A5 · ถอดลิงก์เสริมที่ชี้ SKU กลาง/SKU เก่าออก
const nextOptions = tgt.data.options.map((o,i) => i!==tS ? o : { ...o, choices: o.choices.map(c => {
  const k = sizeKey(c.name); if (!k || !canon[k]) die(`${TARGET}: ขนาด "${c.name}" จับคู่ไม่ได้`);
  const { stockItemId, stockQtyPer, stockLinks, ...rest } = c;
  const keep = (stockLinks ?? []).filter(l => !canonIds.has(l.stockItemId) && !/^P-ULTRA-HARD-CARD/.test(byId[l.stockItemId]?.code ?? ""));
  return { ...rest, stockItemId: canon[k].id, ...(keep.length ? { stockLinks: keep } : {}) };
}) });
const canon_ = (v) => Array.isArray(v) ? v.map(canon_) : v && typeof v==="object" ? Object.fromEntries(Object.keys(v).sort().map(k=>[k, canon_(v[k])])) : v;
const same = JSON.stringify(canon_(tgt.data.options[tS])) === JSON.stringify(canon_(nextOptions[tS]));

// SKU ที่จะปลด: ของ Ultra-Hard ทุกตัว + SKU รวม SHIKISHI
const retire = all.filter(i => i.active!==false && (/^P-ULTRA-HARD-CARD-/.test(i.code) || i.code === WHOLE));
const { data: allP } = await sb.from("products").select("id,data");
const rid = new Set(retire.map(r=>r.id));
for (const p of allP) { if (p.id === TARGET) continue; const hit = []; for (const o of p.data.options??[]) for (const c of o.choices??[]) { if (rid.has(c.stockItemId)) hit.push(c.name); for (const l of c.stockLinks??[]) if (rid.has(l.stockItemId)) hit.push(c.name); } if (hit.length) die(`สินค้า ${p.id} ยังอ้าง SKU ที่จะปลด: ${hit.join(", ")}`); }
const movesOf = new Map();
for (const r of retire) { const m = await db.collection("stockMoves").where("itemId","==",r.id).get(); movesOf.set(r.id, m.docs.map(d=>({ id: d.id, ...d.data() })).sort((a,b)=>a.at.localeCompare(b.at))); }
for (const r of retire) if (r.code !== WHOLE && (movesOf.get(r.id).length || r.balance)) die(`${r.code} มียอด/ประวัติ — ให้คนดู`);
// SKU รวม: ทุกแถวขายต้องเป็น SHIKISHI ขนาดเดียวกันตามใบจริง → ย้ายไป SKU ขนาดนั้น
const whole = retire.find(r=>r.code===WHOLE);
const wholeMoves = whole ? movesOf.get(whole.id) : [];
const heirOf = new Map(); // moveId → canonical item
for (const m of wholeMoves) {
  if (m.reason !== "ขาย" || !m.refOrderId) die(`${WHOLE}: แถว ${m.reason} ${m.refOrderId??""} ไม่ใช่ขาย — ให้คนดู`);
  const { data: o } = await sb.from("orders").select("data").eq("id", m.refOrderId).maybeSingle();
  const lines = (o?.data?.items ?? []).filter(it => it.productId === REF);
  const sizes = new Set(lines.map(it => /ขนาด: (A[3-7])\b/.exec(it.selections ?? "")?.[1]).filter(Boolean));
  if (sizes.size !== 1) die(`${WHOLE}: ใบ ${m.refOrderId} มี SHIKISHI หลายขนาด/อ่านไม่ออก (${[...sizes].join(",")}) — ให้คนดู`);
  const sum = lines.reduce((a, it) => a + Number(it.qty ?? 0), 0);
  if (sum !== -wholeMoves.filter(x=>x.refOrderId===m.refOrderId).reduce((a,x)=>a+x.qty,0)) die(`${WHOLE}: ใบ ${m.refOrderId} จำนวนในใบ ${sum} ≠ ที่ตัด`);
  heirOf.set(m.id, canon[[...sizes][0]]);
}

console.log(`📦 SKU กลาง: ${SIZES.map(s=>`${s.code} (${s.key}) ยอด ${canon[s.key].balance}`).join(" · ")}`);
console.log(`\n🔗 ${TARGET}${same ? " (ผูกตรงอยู่แล้ว)" : ""}:`);
for (const c of nextOptions[tS].choices) console.log(`   ${c.name} → ${byId[c.stockItemId].code}${c.stockLinks?.length ? " + เสริม " + c.stockLinks.map(l=>byId[l.stockItemId]?.code).join(",") : ""}`);
console.log(`\n🗑 ปลด ${retire.length} SKU:`);
for (const r of retire) { console.log(`   ${r.code.padEnd(28)} ยอด ${String(r.balance).padStart(4)} · ประวัติ ${movesOf.get(r.id).length}`); for (const m of movesOf.get(r.id)) console.log(`        ${m.at.slice(0,10)} ${m.reason} ${m.qty} ${m.refOrderId} → ย้ายไป ${heirOf.get(m.id)?.code}`); }
if (!APPLY) { console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

mkdirSync(".cache/stock-fix", { recursive: true });
const bak = `.cache/stock-fix/shikishi-shared.before-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
writeFileSync(bak, JSON.stringify({ canon, retire: retire.map(r=>({ ...r, moves: movesOf.get(r.id) })), products: rows }, null, 2)); console.log("\n💾", bak);
const now = new Date().toISOString();
for (const s of SIZES) { const it = canon[s.key]; const tc = tgt.data.options[tS].choices.find(c=>sizeKey(c.name)===s.key); const aliases = [...new Set([...(it.aliases??[]), tc?.name].filter(Boolean))]; await db.collection("stockItems").doc(it.id).update({ aliases, needsReview: false, updatedAt: now }); }
if (!same) {
  await sb.from("product_revisions").insert({ product_id: TARGET, data: tgt.data, action: "save", editor: "claude", editor_name: BY }).then(r=>r.error && console.log("(ข้ามประวัติ:", r.error.message, ")"));
  const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...tgt.data, options: nextOptions, savedAt: now } }).eq("id", TARGET).select("id");
  if (e2 || !upd?.length) die("เขียนสินค้าไม่สำเร็จ: " + (e2?.message ?? "0 แถว"));
  const { data: back } = await sb.from("products").select("data").eq("id", TARGET).single();
  if (back.data.savedAt !== now || JSON.stringify(canon_(back.data.options[tS])) !== JSON.stringify(canon_(nextOptions[tS]))) die("อ่านกลับไม่ตรง — รันซ้ำ");
  console.log("✅ ผูก " + TARGET + " แล้ว (อ่านกลับตรง)");
}
for (const r of retire) {
  const mv = movesOf.get(r.id);
  if (mv.length) await db.runTransaction(async tx => {
    const fromRef = db.collection("stockItems").doc(r.id); const from = (await tx.get(fromRef)).data();
    const tos = [...new Set(mv.map(m=>heirOf.get(m.id).id))]; const toDocs = {}; for (const id of tos) toDocs[id] = (await tx.get(db.collection("stockItems").doc(id))).data();
    const run = {}; for (const id of tos) run[id] = toDocs[id].balance ?? 0;
    for (const m of mv) { const to = heirOf.get(m.id); run[to.id] += m.qty; tx.update(db.collection("stockMoves").doc(m.id), { itemId: to.id, itemName: toDocs[to.id].name, balanceAfter: run[to.id], note: [m.note, `ย้ายจาก ${r.code} (รวม SKU 30 ก.ย. 69)`].filter(Boolean).join(" · ") }); }
    const moved = mv.reduce((a,m)=>a+m.qty,0); if (moved !== (from.balance ?? 0)) throw new Error(`${r.code}: ผลรวมประวัติ ${moved} ≠ ยอด ${from.balance}`);
    for (const id of tos) tx.update(db.collection("stockItems").doc(id), { balance: run[id], updatedAt: now });
    tx.update(fromRef, { balance: 0, updatedAt: now });
  });
  await db.collection("stockItems").doc(r.id).update({ productIds: [], active: false, deletedAt: now, deletedBy: BY, updatedAt: now });
  console.log(`✅ ปลด ${r.code}${mv.length ? ` (ยอด ${r.balance} + ประวัติ ${mv.length} → ${[...new Set(mv.map(m=>heirOf.get(m.id).code))].join(",")})` : ""}`);
}
console.log("\n✅ เสร็จ"); process.exit(0);
