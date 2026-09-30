// ครั้งเดียว (30 ก.ย. 69): กระเป๋าผ้าแคนวาส (flex-print) ใช้ถุงผ้าชุดเดียวกับ กระเป๋าผ้าแคนวาส งานปัก (clothbag-4)
//   - SKU กลาง = ชุดของงานปัก P-CLOTHBAG-4-1..14 (สีผ้าดิบ/สีดำ × 7 ขนาด) + สีขาว 7 ขนาด + สีดำมีกระเป๋าใบน้อย (ยืมของ flex-print ที่มีอยู่แล้ว)
//   - เขียน choice.stockLinks ของกลุ่ม "ขนาด" ใน flex-print ให้ชี้ SKU กลาง (เงื่อนไขสีจากกลุ่ม "สีกระเป๋างานซับ" / "สีกระเป๋างาน DTF / Flex")
//   - SKU ซ้ำของ flex-print ที่มีประวัติขาย → ย้ายแถว ledger "ขาย" ไป SKU กลาง + โอนยอด แล้วปลด (soft delete)
//   - SKU รวมทั้งตัว P-FLEX-PRINT-36 ตัดซ้อนกับ SKU รายตัวเลือกอยู่ (-15 = -3-11-1) → ปรับยอดกลับ 0 แล้วปลด · P-CLOTHBAG-4 (ยอด 0) ปลด
//   - ขนาดที่ 5 งานปักเคยพิมพ์ "45x35x10cm" — เจ้าของร้านยืนยัน 45x35x15cm ถูก แก้แล้วด้วย scripts/clothbag-4-size-45x35x15.mjs
//   - สีดำ+กระเป๋าใบน้อย (P-FLEX-PRINT-30) เจ้าของร้านยืนยันไม่มีของ — ถอดแล้วด้วย scripts/flex-print-drop-black-pocket.mjs (สคริปต์นี้จึงรันซ้ำไม่ได้แล้ว เก็บไว้เป็นบันทึก)
// ใช้: node scripts/stock-canvas-bag-shared.mjs            (ดูอย่างเดียว)
//      node scripts/stock-canvas-bag-shared.mjs --apply    (เขียนจริง + สำรองที่ .cache/stock-fix/)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const die = (m) => { console.log("⛔", m); process.exit(1); };

const FAMILY = "กระเป๋าผ้าแคนวาส";
const BY = "Claude (รวมถุงผ้าแคนวาสใช้ร่วม 2 สินค้า ตามที่เจ้าของร้านขอ 30 ก.ย. 69)";
const REF = "clothbag-4";   // งานปัก — ผูกครบอยู่แล้ว ใช้เป็นแม่แบบ
const TARGET = "flex-print"; // กระเป๋าผ้าแคนวาส — ต้องเปลี่ยนไปใช้ชุดกลาง
const SIZE_LABEL = "ขนาด";
const SUB_LABEL = "สีกระเป๋างานซับ";
const DTF_LABEL = "สีกระเป๋างาน DTF / Flex";

/** ขนาดใน flex-print (ตามลำดับ) → ชื่อขนาดในงานปัก + SKU กลางแต่ละสี */
const SIZES = [
  { flex: "35x40 cm",                                                     ref: "35x40cm",                                                   raw: "P-CLOTHBAG-4-1", black: "P-CLOTHBAG-4-8",  white: "P-FLEX-PRINT-22" },
  { flex: "35x40 cm (มีกระเป๋าใบน้อยด้านใน+ กระดุมแม่เหล็กปิดกระเป๋า)", ref: "35x40cm (มีกระเป๋าใบน้อยด้านใน+ กระดุมแม่เหล็กปิดกระเป๋า)", raw: "P-CLOTHBAG-4-2", black: "P-FLEX-PRINT-30", white: "P-FLEX-PRINT-23" },
  { flex: "27x22x8cm",                                                    ref: "27x22x8cm",                                                 raw: "P-CLOTHBAG-4-3", black: "P-CLOTHBAG-4-10", white: "P-FLEX-PRINT-24" },
  { flex: "40x30x10cm",                                                   ref: "40x30x10cm",                                                raw: "P-CLOTHBAG-4-4", black: "P-CLOTHBAG-4-11", white: "P-FLEX-PRINT-25" },
  { flex: "45x35x15cm",                                                   ref: "45x35x15cm",                                                raw: "P-CLOTHBAG-4-5", black: "P-CLOTHBAG-4-12", white: "P-FLEX-PRINT-26" }, // เดิมงานปักพิมพ์ 45x35x10cm — แก้แล้ว (scripts/clothbag-4-size-45x35x15.mjs)
  { flex: "35x40x10cm",                                                   ref: "35x40x10cm",                                                raw: "P-CLOTHBAG-4-6", black: "P-CLOTHBAG-4-13", white: "P-FLEX-PRINT-27" },
  { flex: "46x37x12cm",                                                   ref: "46x37x12cm",                                                raw: "P-CLOTHBAG-4-7", black: "P-CLOTHBAG-4-14", white: "P-FLEX-PRINT-28" },
];
/** SKU กลางที่ต้องเปลี่ยนชื่อให้สะกดแบบเดียวกับชุดงานปัก (ชื่อเดิมเก็บเป็น alias) */
const RENAME = {
  "P-FLEX-PRINT-22": "กระเป๋าผ้าแคนวาส · สีขาว · 35x40cm",
  "P-FLEX-PRINT-23": "กระเป๋าผ้าแคนวาส · สีขาว · 35x40cm (มีกระเป๋าใบน้อยด้านใน+ กระดุมแม่เหล็กปิดกระเป๋า)",
  "P-FLEX-PRINT-30": "กระเป๋าผ้าแคนวาส · สีดำ · 35x40cm (มีกระเป๋าใบน้อยด้านใน+ กระดุมแม่เหล็กปิดกระเป๋า)",
};
/** SKU รวมทั้งตัว — ปลดกันตัด 2 เด้ง */
const WHOLE = ["P-FLEX-PRINT-36", "P-CLOTHBAG-4"];

const all = (await db.collection("stockItems").get()).docs.map(d=>({ id: d.id, ...d.data() }));
const byCode = Object.fromEntries(all.filter(i=>i.active!==false).map(i=>[i.code, i]));
const byId = Object.fromEntries(all.map(i=>[i.id, i]));
const need = (code) => byCode[code] ?? die(`ไม่พบ SKU ${code} (หรือถูกลบไปแล้ว)`);
const canonCodes = [...new Set(SIZES.flatMap(s=>[s.raw, s.black, s.white]))];
const canon = canonCodes.map(need);

// ---------- สินค้า ----------
const { data: rows, error } = await sb.from("products").select("id,data").in("id", [REF, TARGET]);
if (error) die("อ่านสินค้าไม่ได้: " + error.message);
const ref = rows.find(r=>r.id===REF) ?? die("ไม่พบ " + REF);
const tgt = rows.find(r=>r.id===TARGET) ?? die("ไม่พบ " + TARGET);
const groupIdx = (row, label) => { const ix = (row.data.options??[]).map((o,i)=>[o,i]).filter(([o])=>o.label===label && !o.presetId).map(([,i])=>i); if (ix.length!==1) die(`${row.id}: กลุ่ม "${label}" มี ${ix.length} กลุ่ม (ต้องมี 1)`); return ix[0]; };
const tSize = groupIdx(tgt, SIZE_LABEL), tSub = groupIdx(tgt, SUB_LABEL), tDtf = groupIdx(tgt, DTF_LABEL);
const rSize = groupIdx(ref, "ขนาดกระเป๋า");
const names = (row, i) => (row.data.options[i].choices??[]).map(c=>c.name);
for (const s of SIZES) {
  if (!names(tgt, tSize).includes(s.flex)) die(`${TARGET}: กลุ่มขนาดไม่มี "${s.flex}" (มี: ${names(tgt,tSize).join(" / ")})`);
  if (!names(ref, rSize).includes(s.ref)) die(`${REF}: กลุ่มขนาดกระเป๋าไม่มี "${s.ref}"`);
}
for (const [i, want] of [[tSub, ["สีผ้าดิบ","สีขาว"]], [tDtf, ["สีผ้าดิบ","สีขาว","สีดำ"]]]) for (const w of want) if (!names(tgt,i).includes(w)) die(`${TARGET}: กลุ่ม "${tgt.data.options[i].label}" ไม่มีค่า ${w}`);
// งานปักต้องผูก SKU กลางสีผ้าดิบ/สีดำ ครบตามที่คิดไว้ (ยืนยันว่าแม่แบบยังเหมือนตอนวางแผน)
for (const s of SIZES) {
  const c = ref.data.options[rSize].choices.find(c=>c.name===s.ref);
  const has = (code) => (c.stockLinks??[]).some(l=>l.stockItemId===byCode[code].id);
  if (!has(s.raw)) die(`${REF}: "${s.ref}" ไม่ได้ผูก ${s.raw}`);
  if (s.black.startsWith("P-CLOTHBAG") && !has(s.black)) die(`${REF}: "${s.ref}" ไม่ได้ผูก ${s.black}`);
}

// ---------- ลิงก์ใหม่ของ flex-print ----------
const link = (code, label, choice) => ({ stockItemId: byCode[code].id, when: [{ label, choices: [choice] }] });
const nextOptions = tgt.data.options.map((o,i) => i!==tSize ? o : { ...o, choices: o.choices.map(c => {
  const s = SIZES.find(s=>s.flex===c.name); if (!s) return c;
  const { stockItemId, stockQtyPer, ...rest } = c; // ไม่มี SKU หลักของขนาดเอง (สีเป็นตัวตัดสิน) — เหมือนโครงเดิม
  return { ...rest, stockLinks: [
    link(s.raw, SUB_LABEL, "สีผ้าดิบ"), link(s.white, SUB_LABEL, "สีขาว"),
    link(s.raw, DTF_LABEL, "สีผ้าดิบ"), link(s.white, DTF_LABEL, "สีขาว"), link(s.black, DTF_LABEL, "สีดำ"),
  ] };
}) });
const oldLinkIds = new Set(tgt.data.options[tSize].choices.flatMap(c=>[c.stockItemId, ...(c.stockLinks??[]).map(l=>l.stockItemId)]).filter(Boolean));
const newLinkIds = new Set(nextOptions[tSize].choices.flatMap(c=>(c.stockLinks??[]).map(l=>l.stockItemId)));
const canonIds = new Set(canon.map(i=>i.id));

// ---------- SKU ที่จะปลด: ทุก SKU ของ 2 สินค้านี้ที่ไม่ใช่ตัวกลาง (หาจากรหัส ไม่ใช่จากลิงก์เดิม — รันซ้ำได้หลังรอบที่เขียนสินค้าไปแล้ว) ----------
const retire = all.filter(i => i.active!==false && !canonIds.has(i.id) && /^P-(FLEX-PRINT|CLOTHBAG-4)(-\d+)?$/.test(i.code));
for (const code of WHOLE) if (!byCode[code]) console.log(`(ℹ️ ${code} ไม่พบ/ถูกลบไปแล้ว — ข้าม)`);
// ห้ามปลดถ้ามีสินค้าอื่นอ้างถึงอยู่ (productIds / stockItemId / stockLinks ในสินค้าตัวอื่น)
const { data: allProducts, error: e3 } = await sb.from("products").select("id,data");
if (e3) die("อ่านสินค้าทั้งหมดไม่ได้: " + e3.message);
const retireIds = new Set(retire.map(r=>r.id));
for (const p of allProducts) {
  if (p.id === TARGET) continue;
  const refs = [];
  for (const o of p.data.options??[]) for (const c of o.choices??[]) { if (retireIds.has(c.stockItemId)) refs.push(c.name); for (const l of c.stockLinks??[]) if (retireIds.has(l.stockItemId)) refs.push(c.name); }
  for (const r of p.data.priceRates??[]) { if (retireIds.has(r.stockItemId)) refs.push("เรท " + r.name); for (const l of r.stockLinks??[]) if (retireIds.has(l.stockItemId)) refs.push("เรท " + r.name); }
  if (refs.length) die(`สินค้า ${p.id} ยังอ้าง SKU ที่จะปลด: ${refs.join(", ")} — ให้คนตัดสินใจ`);
}
for (const r of retire) { const others = (r.productIds??[]).filter(x=>x!==TARGET && x!==REF); if (others.length) die(`${r.code} ผูกทั้งตัวกับสินค้าอื่น ${JSON.stringify(others)} — ปลดไม่ได้`); }

// ---------- ประวัติ/ยอดของ SKU ที่จะปลด ----------
const movesOf = new Map();
const ids = retire.map(r=>r.id);
for (let k=0;k<ids.length;k+=10) { const m = await db.collection("stockMoves").where("itemId","in",ids.slice(k,k+10)).get(); for (const d of m.docs) { const x=d.data(); (movesOf.get(x.itemId) ?? movesOf.set(x.itemId, []).get(x.itemId)).push({ id: d.id, ...x }); } }
/** SKU เก่า → SKU กลางที่รับยอด/ประวัติแทน — อ่านสี/ขนาดจากชื่อ "กระเป๋าผ้าแคนวาส · สี · ขนาด" */
const heir = new Map();
for (const r of retire) {
  if (WHOLE.includes(r.code)) continue;
  const m = /^กระเป๋าผ้าแคนวาส · (สีผ้าดิบ|สีขาว|สีดำ) · (.+)$/.exec(r.name ?? "");
  if (!m) die(`${r.code} "${r.name}" อ่านสี/ขนาดจากชื่อไม่ออก`);
  const s = SIZES.find(s => s.flex===m[2] || s.ref===m[2]);
  if (!s) die(`${r.code} ขนาด "${m[2]}" ไม่อยู่ในตาราง`);
  heir.set(r.id, byCode[m[1]==="สีผ้าดิบ" ? s.raw : m[1]==="สีขาว" ? s.white : s.black]);
}
const plan = retire.map(r => {
  const mv = (movesOf.get(r.id) ?? []).sort((a,b)=>a.at.localeCompare(b.at));
  const whole = WHOLE.includes(r.code);
  const to = whole ? null : heir.get(r.id);
  if (!whole && (mv.length || r.balance) && !to) die(`${r.code} มียอด/ประวัติ แต่หาตัวรับแทนไม่ได้`);
  if (whole && mv.some(m=>m.reason!=="ขาย")) die(`${r.code} มีประวัติที่ไม่ใช่ "ขาย" — ให้คนดู`);
  if (!whole && mv.some(m=>m.reason!=="ขาย")) die(`${r.code} มีประวัติที่ไม่ใช่ "ขาย" — ให้คนดู`);
  return { r, mv, whole, to };
});
// SKU รวมทั้งตัว: ทุกใบที่ตัดต้องมี SKU รายตัวเลือกตัดคู่กันอยู่แล้ว (ถึงจะเรียกว่าซ้ำ)
const choiceOrderIds = new Set(plan.filter(p=>!p.whole).flatMap(p=>p.mv.map(m=>m.refOrderId)));
const canonMoves = await (async()=>{ const out=[]; const cid=[...canonIds]; for (let k=0;k<cid.length;k+=10){ const m=await db.collection("stockMoves").where("itemId","in",cid.slice(k,k+10)).get(); out.push(...m.docs.map(d=>d.data())); } return out; })();
for (const m of canonMoves) if (m.refOrderId) choiceOrderIds.add(m.refOrderId);
for (const p of plan) if (p.whole && p.r.code==="P-FLEX-PRINT-36") for (const m of p.mv) if (!choiceOrderIds.has(m.refOrderId)) die(`${p.r.code}: ใบ ${m.refOrderId} ไม่มี SKU รายตัวเลือกตัดคู่ — ไม่ใช่ยอดซ้ำ ให้คนดู`);

// ---------- รายงาน ----------
console.log("📦 SKU กลาง (ตระกูล → " + FAMILY + "):");
for (const i of canon) console.log(`  ${i.code.padEnd(18)} "${i.name}"${RENAME[i.code] ? ` → "${RENAME[i.code]}"` : ""}  ยอด ${i.balance}`);
console.log(`\n🔗 ${TARGET} | ${tgt.data.name} | กลุ่ม [${tSize}] ${SIZE_LABEL} → ลิงก์ใหม่:`);
for (const c of nextOptions[tSize].choices) console.log(`   ${c.name}\n      ${(c.stockLinks??[]).map(l=>`${byId[l.stockItemId].code} เมื่อ ${l.when[0].label}=${l.when[0].choices[0]}`).join("\n      ")}`);
console.log(`\n🗑 ปลด ${plan.length} SKU:`);
for (const p of plan) {
  const bal = p.r.balance ?? 0;
  console.log(`   ${p.r.code.padEnd(18)} ยอด ${String(bal).padStart(4)} · ประวัติ ${p.mv.length}${p.whole ? "  (SKU รวมทั้งตัว — ตัดซ้อน)" : p.to ? `  → ย้ายไป ${p.to.code}` : ""}`);
  for (const m of p.mv) console.log(`        ${m.at.slice(0,10)} ${m.reason} ${m.qty} ${m.refOrderId??""}`);
}
console.log(`\nℹ️ ${REF} ไม่แตะ (ผูกครบอยู่แล้ว) · สีดำ+กระเป๋าใบน้อย ของงานปักไม่เติมกลับ (champ ลบไป 2 รอบ 21 ก.ย.) · ขนาดที่ 5: "${SIZES[4].ref}" (งานปัก) = "${SIZES[4].flex}" (flex-print) ถือเป็นใบเดียวกัน`);
if (!APPLY) { console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

// ---------- เขียนจริง ----------
mkdirSync(".cache/stock-fix", { recursive: true });
const bak = `.cache/stock-fix/canvas-bag-shared.before-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
writeFileSync(bak, JSON.stringify({ canon, retire: plan.map(p=>({ ...p.r, moves: p.mv })), products: rows }, null, 2));
console.log("\n💾 สำรองที่", bak);
const now = new Date().toISOString();

// 1) SKU กลาง: ชื่อ/ตระกูล/alias
for (const i of canon) {
  const s = SIZES.find(s=>[s.raw,s.black,s.white].includes(i.code));
  const name = RENAME[i.code] ?? i.name;
  const aliases = [...new Set([...(i.aliases??[]), i.name, s.flex, s.ref].filter(a=>a && a!==name))];
  await db.collection("stockItems").doc(i.id).update({ name, aliases, family: FAMILY, needsReview: false, updatedAt: now });
}
console.log("✅ SKU กลาง " + canon.length + " ตัว");

// 2) สินค้า flex-print (ข้ามถ้าลิงก์ตรงอยู่แล้ว — รอบก่อนเขียนลงแล้วแต่ด่านอ่านกลับเทียบผิดเพราะ jsonb เรียงคีย์ใหม่)
const canon_ = (v) => Array.isArray(v) ? v.map(canon_) : v && typeof v==="object" ? Object.fromEntries(Object.keys(v).sort().map(k=>[k, canon_(v[k])])) : v;
const same = JSON.stringify(canon_(tgt.data.options[tSize])) === JSON.stringify(canon_(nextOptions[tSize]));
if (same) console.log("✅ " + TARGET + " ผูกตรงอยู่แล้ว (ข้าม)"); else {
await sb.from("product_revisions").insert({ product_id: tgt.id, data: tgt.data, action: "save", editor: "claude", editor_name: BY }).then(r=>r.error && console.log("(ข้ามประวัติ:", r.error.message, ")"));
const nextData = { ...tgt.data, options: nextOptions, savedAt: now };
const { data: upd, error: e2 } = await sb.from("products").update({ data: nextData }).eq("id", tgt.id).select("data");
if (e2 || !upd?.length) die("เขียนสินค้าไม่สำเร็จ: " + (e2?.message ?? "0 แถว"));
const { data: back } = await sb.from("products").select("data").eq("id", tgt.id).single();
if (back.data.savedAt !== now || JSON.stringify(canon_(back.data.options[tSize])) !== JSON.stringify(canon_(nextOptions[tSize]))) die("อ่านกลับไม่ตรงที่เขียน — รันซ้ำ");
console.log("✅ ผูก " + TARGET + " แล้ว (อ่านกลับตรง)");
}

// 3) ย้ายประวัติ + โอนยอด แล้วปลด
for (const p of plan) {
  const bal = p.r.balance ?? 0;
  if (p.whole) {
    if (bal !== 0) await db.runTransaction(async tx => {
      const ref = db.collection("stockItems").doc(p.r.id); const cur = (await tx.get(ref)).data();
      tx.set(db.collection("stockMoves").doc(), { itemId: p.r.id, itemName: cur.name, qty: -cur.balance, reason: "อื่นๆ", note: `ปรับยอดกลับ 0 — ตัดซ้อนกับ SKU รายตัวเลือก (รวมถุงผ้าแคนวาสใช้ร่วม 30 ก.ย. 69)`, by: BY, source: "iducky", at: now, balanceAfter: 0 });
      tx.update(ref, { balance: 0, updatedAt: now });
    });
  } else if (p.to && (bal !== 0 || p.mv.length)) {
    await db.runTransaction(async tx => {
      const fromRef = db.collection("stockItems").doc(p.r.id), toRef = db.collection("stockItems").doc(p.to.id);
      const from = (await tx.get(fromRef)).data(), to = (await tx.get(toRef)).data();
      let run = to.balance ?? 0;
      for (const m of p.mv) { run += m.qty; tx.update(db.collection("stockMoves").doc(m.id), { itemId: p.to.id, itemName: to.name, balanceAfter: run, note: [m.note, `ย้ายจาก ${p.r.code} (รวม SKU 30 ก.ย. 69)`].filter(Boolean).join(" · ") }); }
      if (run !== (to.balance ?? 0) + (from.balance ?? 0)) throw new Error(`${p.r.code}: ผลรวมประวัติ ${run - (to.balance??0)} ≠ ยอด ${from.balance}`);
      tx.update(toRef, { balance: run, updatedAt: now });
      tx.update(fromRef, { balance: 0, updatedAt: now });
    });
  }
  await db.collection("stockItems").doc(p.r.id).update({ productIds: [], active: false, deletedAt: now, deletedBy: BY, updatedAt: now });
  console.log(`✅ ปลด ${p.r.code}${p.to && (bal||p.mv.length) ? ` (ยอด ${bal} + ประวัติ ${p.mv.length} → ${p.to.code})` : ""}`);
}
console.log("\n✅ เสร็จ");
process.exit(0);
