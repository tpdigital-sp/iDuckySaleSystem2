// ครั้งเดียว: กระจกถือ (mirror-hand) — ล้าง SKU ที่แยกผิดรูปแบบ (ตามสีอย่างเดียว + ซ้อนกัน) แล้วสร้างใหม่ครบคู่ ทรง × สี
// ผูกแบบเดียวกับปุ่ม "แยกตามตัวเลือก" โหมด 2 กลุ่ม: stockLinks บนค่า "สี" when ทรง = ค่านั้น · [--apply]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const PID = "mirror-hand";
const { data: row } = await sb.from("products").select("id,data").eq("id", PID).maybeSingle();
const p = row.data;
const si = p.options.findIndex(o => o.label === "ทรง" && !o.presetId), ci = p.options.findIndex(o => o.label === "สี" && !o.presetId);
const shapes = p.options[si].choices.map(c => c.name), colors = p.options[ci].choices;
console.log("ทรง:", shapes.join(" | "));
for (const o of p.options) for (const c of o.choices ?? []) if (c.stockItemId || c.stockLinks?.length) console.log(`  ผูกอยู่: ${o.label}=${c.name}`, c.stockItemId ?? "", JSON.stringify((c.stockLinks ?? []).map(l => [l.stockItemId, l.when])));
const all = (await db.collection("stockItems").get()).docs.map(d => ({ ref: d.ref, ...d.data() }));
const linked = new Set(p.options.flatMap(o => (o.choices ?? []).flatMap(c => [c.stockItemId, ...(c.stockLinks ?? []).map(l => l.stockItemId)])).filter(Boolean));
const old = all.filter(i => i.active !== false && (linked.has(i.id) || (i.productIds ?? []).includes(PID) || i.bomFor?.[PID]));
console.log("\nSKU เดิมของสินค้านี้:"); for (const i of old) console.log(`  ${i.code} | ${i.name} | ยอด ${i.balance} | pids ${JSON.stringify(i.productIds ?? [])} | bom ${JSON.stringify(i.bomFor ?? null)}`);
const moves = old.length ? await db.collection("stockMoves").where("itemId", "in", old.map(i => i.id).slice(0, 30)).limit(1).get() : { empty: true };
const toRetire = old.filter(i => !i.bomFor?.[PID]); // วัสดุแฝงไม่เกี่ยว เก็บไว้
if (toRetire.some(i => i.balance !== 0) || !moves.empty) { console.log("⛔ มียอดหรือประวัติแล้ว — หยุด ให้คนตัดสินใจ"); process.exit(1); }
const codes = new Set(all.map(i => String(i.code ?? "")));
let n = Math.max(0, ...[...codes].map(c => +(/^P-MIRROR-HAND-(\d+)$/.exec(c)?.[1] ?? 0)));
const plan = [];
for (const s of shapes) for (const c of colors) plan.push({ shape: s, color: c.name, img: c.imageSrc, code: `P-MIRROR-HAND-${++n}`, name: `กระจกถือ · ${s} · ${c.name}` });
console.log(`\nจะปิด ${toRetire.length} ตัว · สร้างใหม่ ${plan.length} ตัว:`); for (const x of plan) console.log(`  ${x.code}  ${x.name}`);
if (!APPLY) { console.log("\n(ดูอย่างเดียว — --apply)"); process.exit(0); }

mkdirSync(".cache/stock-fix", { recursive: true });
writeFileSync(".cache/stock-fix/mirror-hand.before-260919.json", JSON.stringify({ product: row, skus: old.map(({ ref, ...i }) => i) }, null, 2));
const now = new Date().toISOString();
const unit = toRetire[0]?.unit ?? "ชิ้น", family = toRetire.find(i => i.family)?.family, category = toRetire.find(i => i.category)?.category;
const ids = {};
for (const x of plan) {
  const id = `sku-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const d = { id, name: x.name, code: x.code, aliases: [`${x.shape} ${x.color}`], unit, part: "กระจกถือ", balance: 0, productIds: [], active: true, createdAt: now, updatedAt: now, ...(family ? { family } : {}), ...(category ? { category } : {}), ...(x.img ? { imageUrl: x.img } : {}) };
  await db.collection("stockItems").doc(id).set(d);
  ids[`${x.shape}|${x.color}`] = id;
}
const strip = c => Object.fromEntries(Object.entries(c).filter(([k]) => !["stockItemId", "stockQtyPer", "stockLinks"].includes(k)));
const next = { ...p, options: p.options.map((o, i) => {
  if (i === si) return { ...o, choices: o.choices.map(strip) };
  if (i === ci) return { ...o, choices: o.choices.map(c => ({ ...strip(c), stockLinks: shapes.map(s => ({ stockItemId: ids[`${s}|${c.name}`], when: [{ label: "ทรง", choices: [s] }] })) })) };
  return o;
}) };
const { error } = await sb.from("products").update({ data: next }).eq("id", PID);
if (error) { console.log("⛔ เขียนสินค้าไม่สำเร็จ:", error.message, "— SKU ใหม่ยังไม่ถูกผูก"); process.exit(1); }
for (const i of toRetire) await i.ref.update({ active: false, deletedAt: now, deletedBy: "Claude (จัดกระจกถือเป็นคู่ ทรง×สี ตามที่เจ้าของร้านขอ)", productIds: (i.productIds ?? []).filter(x => x !== PID), updatedAt: now });
console.log(`\n✅ สร้าง ${plan.length} · ปิด ${toRetire.length} · สำรองไว้ .cache/stock-fix/mirror-hand.before-260919.json`);
process.exit(0);
