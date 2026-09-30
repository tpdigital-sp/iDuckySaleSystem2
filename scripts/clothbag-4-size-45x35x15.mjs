// ครั้งเดียว (30 ก.ย. 69): กระเป๋าผ้าแคนวาส งานปัก (clothbag-4) ขนาดที่ 5 พิมพ์ผิดเป็น "45x35x10cm" — ตัวจริงคือ "45x35x15cm" (เจ้าของร้านยืนยัน)
//   ลากชื่อใหม่ไปทุกที่ที่อ้างชื่อตัวเลือก (แบบเดียวกับ retargetChoiceName ในหน้าแก้ไข + คีย์ตารางราคา + rules + FAQ)
//   และเปลี่ยนชื่อ SKU กลาง P-CLOTHBAG-4-5 / -12 ให้ตรง (ชื่อเดิมเก็บเป็น alias)
// ใช้: node scripts/clothbag-4-size-45x35x15.mjs [--apply]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const die = (m) => { console.log("⛔", m); process.exit(1); };
const ID = "clothbag-4", GROUP = "ขนาดกระเป๋า", OLD = "45x35x10cm", NEW = "45x35x15cm";
const SKUS = ["P-CLOTHBAG-4-5", "P-CLOTHBAG-4-12"];

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) die(error.message);
const d = row.data;
const gi = d.options.findIndex(o => o.label === GROUP && !o.presetId);
if (gi < 0) die(`ไม่พบกลุ่ม ${GROUP}`);
const names = d.options[gi].choices.map(c => c.name);
if (names.includes(NEW)) console.log(`(ℹ️ กลุ่มมี "${NEW}" อยู่แล้ว)`);
if (!names.includes(OLD) && names.includes(NEW)) { console.log("✅ เปลี่ยนไปแล้ว — ไม่มีอะไรทำฝั่งสินค้า"); }
else if (!names.includes(OLD)) die(`กลุ่ม ${GROUP} ไม่มี "${OLD}" (มี: ${names.join(" / ")})`);

const log = [];
const ren = (s) => (typeof s === "string" && s.trim() === OLD ? NEW : s);
const renList = (list, where) => list?.map((v, i) => { const n = ren(v); if (n !== v) log.push(`${where}[${i}]`); return n; });
const cond = (c, where) => (c?.label ?? "").trim() === GROUP ? { ...c, choices: renList(c.choices, where + ".choices") } : c;
/** คีย์ตารางราคา = ชื่อตัวเลือกของ driverLabels ต่อกันด้วย "│" — เปลี่ยนเฉพาะช่องที่ตรงตำแหน่งแกน GROUP */
const renCells = (pricing, where) => {
  if (!pricing?.cells) return pricing;
  const drivers = pricing.driverLabels ?? [];
  const pos = drivers.indexOf(GROUP);
  if (pos < 0) return pricing;
  const cells = Object.fromEntries(Object.entries(pricing.cells).map(([k, v]) => {
    const parts = k.split("│"); if (parts[pos]?.trim() !== OLD) return [k, v];
    parts[pos] = NEW; log.push(`${where}.cells["${k}"] → "${parts.join("│")}"`); return [parts.join("│"), v];
  }));
  return { ...pricing, cells };
};
const options = d.options.map((o, oi) => {
  const n = { ...o }, w = `options[${oi}]`;
  const mine = (l) => (l ?? "").trim() === GROUP;
  if (mine(n.showWhenLabel)) n.showWhenChoices = renList(n.showWhenChoices, w + ".showWhenChoices");
  if (mine(n.showWhenAlsoLabel)) n.showWhenAlsoChoices = renList(n.showWhenAlsoChoices, w + ".showWhenAlsoChoices");
  if (n.showWhenAll) n.showWhenAll = n.showWhenAll.map((c, i) => cond(c, `${w}.showWhenAll[${i}]`));
  if (n.showWhenAny) n.showWhenAny = n.showWhenAny.map((c, i) => cond(c, `${w}.showWhenAny[${i}]`));
  if (mine(n.smallWhenLabel)) n.smallWhenChoices = renList(n.smallWhenChoices, w + ".smallWhenChoices");
  if (mine(n.freeWhenLabel)) n.freeWhenChoices = renList(n.freeWhenChoices, w + ".freeWhenChoices");
  for (const k of ["defaultBy", "labelBy"]) if (mine(n[k]?.label)) n[k] = { ...n[k], map: Object.fromEntries(Object.entries(n[k].map).map(([a, b]) => { const r = ren(a); if (r !== a) log.push(`${w}.${k}.map`); return [r, b]; })) };
  if (mine(n.label)) {
    if (n.freeChoices) n.freeChoices = renList(n.freeChoices, w + ".freeChoices");
    if (n.smallFree) n.smallFree = renList(n.smallFree, w + ".smallFree");
    if (n.sizeInput?.choice?.trim() === OLD) { n.sizeInput = { ...n.sizeInput, choice: NEW }; log.push(w + ".sizeInput.choice"); }
  }
  n.choices = o.choices.map((c, ci) => {
    const cw = `${w}.choices[${ci}]`;
    let x = c;
    if (mine(o.label) && c.name.trim() === OLD) { x = { ...x, name: NEW }; log.push(cw + ".name"); }
    if (x.imageWhen) x = { ...x, imageWhen: x.imageWhen.map((iw, i) => ({ ...iw, when: (iw.when ?? []).map((q, j) => cond(q, `${cw}.imageWhen[${i}].when[${j}]`)) })) };
    if (x.stockLinks) x = { ...x, stockLinks: x.stockLinks.map((l, i) => (l.when ? { ...l, when: l.when.map((q, j) => cond(q, `${cw}.stockLinks[${i}].when[${j}]`)) } : l)) };
    return x;
  });
  return n;
});
const pricing = renCells(d.pricing, "pricing");
const priceRates = (d.priceRates ?? []).map((r, i) => ({ ...r, pricing: renCells(r.pricing, `priceRates[${i}].pricing`),
  ...(r.showWhenAll ? { showWhenAll: r.showWhenAll.map((c, j) => cond(c, `priceRates[${i}].showWhenAll[${j}]`)) } : {}),
  ...(r.showWhenAny ? { showWhenAny: r.showWhenAny.map((c, j) => cond(c, `priceRates[${i}].showWhenAny[${j}]`)) } : {}) }));
const rules = (d.rules ?? []).map((r, i) => ({ ...r, ...(r.when ? { when: cond(r.when, `rules[${i}].when`) } : {}), ...(r.then ? { then: cond(r.then, `rules[${i}].then`) } : {}),
  ...(Array.isArray(r.whenAll) ? { whenAll: r.whenAll.map((c, j) => cond(c, `rules[${i}].whenAll[${j}]`)) } : {}) }));
const seo = d.seo?.faqs ? { ...d.seo, faqs: d.seo.faqs.map((f, i) => { const a = f.a?.includes(OLD) ? f.a.split(OLD).join(NEW) : f.a; if (a !== f.a) log.push(`seo.faqs[${i}].a`); const q = f.q?.includes(OLD) ? f.q.split(OLD).join(NEW) : f.q; return { ...f, q, a }; }) } : d.seo;
const next = { ...d, options, pricing, priceRates, rules, ...(seo ? { seo } : {}) };
const leftover = []; (function walk(v, p) { if (typeof v === "string") { if (v.includes(OLD)) leftover.push(p); return; } if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k.includes(OLD)) leftover.push(p + "." + k + " (key)"); walk(x, p + "." + k); } })(next, "data");

console.log(`🔁 ${ID}: "${OLD}" → "${NEW}"`); for (const l of log) console.log("   ", l);
console.log("   ยังเหลือชื่อเดิมที่ไม่แตะ:", leftover.length ? leftover.join(", ") : "-", "(URL รูป = ปล่อยไว้ได้)");
const skus = []; for (const code of SKUS) { const s = await db.collection("stockItems").where("code", "==", code).get(); if (s.empty) die("ไม่พบ " + code); const it = { id: s.docs[0].id, ...s.docs[0].data() }; if (it.active === false) die(code + " ถูกลบ"); skus.push(it); console.log(`📦 ${code} "${it.name}" → "${it.name.split(OLD).join(NEW)}"`); }
if (!APPLY) { console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

mkdirSync(".cache/stock-fix", { recursive: true });
const bak = `.cache/stock-fix/clothbag-4-size-45x35x15.before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(bak, JSON.stringify({ product: row, skus }, null, 2)); console.log("💾", bak);
const now = new Date().toISOString();
if (log.length) {
  await sb.from("product_revisions").insert({ product_id: ID, data: d, action: "save", editor: "claude", editor_name: "Claude (แก้ขนาด 45x35x15cm ตามเจ้าของร้าน 30 ก.ย. 69)" }).then(r => r.error && console.log("(ข้ามประวัติ:", r.error.message, ")"));
  const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...next, savedAt: now } }).eq("id", ID).select("id");
  if (e2 || !upd?.length) die("เขียนไม่สำเร็จ: " + (e2?.message ?? "0 แถว"));
  const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
  if (back.data.savedAt !== now || JSON.stringify(canon(back.data.options)) !== JSON.stringify(canon(next.options)) || JSON.stringify(canon(back.data.pricing)) !== JSON.stringify(canon(next.pricing))) die("อ่านกลับไม่ตรง — รันซ้ำ");
  console.log("✅ สินค้าเขียนแล้ว (อ่านกลับตรง)");
}
for (const it of skus) {
  const name = it.name.split(OLD).join(NEW);
  const aliases = [...new Set([...(it.aliases ?? []), it.name, OLD].filter(a => a && a !== name))];
  await db.collection("stockItems").doc(it.id).update({ name, aliases, updatedAt: now });
  console.log(`✅ ${it.code} → "${name}"`);
}
console.log("✅ เสร็จ"); process.exit(0);
