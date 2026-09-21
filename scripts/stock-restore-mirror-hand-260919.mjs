import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"))) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const docs = (await db.collection("stockItems").get()).docs.filter(d => /^P-MIRROR-HAND/.test(d.data().code || ""));
// ชุดในภาพล่าสุด = ลบระหว่าง 08:50:30–08:51:05 UTC
const back = docs.filter(d => { const t = d.data().deletedAt ?? ""; return d.data().active === false && t >= "2026-09-19T08:50:30" && t <= "2026-09-19T08:51:05"; });
for (const d of back) console.log(d.data().code.padEnd(18), d.data().name, "| part:", d.data().part ?? "-");
const byName = Object.fromEntries(back.map(d => [d.data().name, d.id]));
const { data: row } = await sb.from("products").select("id,data").eq("id","mirror-hand").maybeSingle();
const p = row.data;
const shapes = p.options.find(o => o.label === "ทรง").choices.map(c => c.name);
const next = { ...p, options: p.options.map(o => o.label !== "สี" ? o : { ...o, choices: o.choices.map(c => {
  const main = byName[`กระจกถือ · ${c.name}`], extra = byName[`ทรง ${c.name} (กระจกถือ)`];
  return { ...c, ...(main ? { stockItemId: main } : {}), ...(extra ? { stockLinks: [{ stockItemId: extra, when: [{ label: "ทรง", choices: shapes }] }] } : {}) };
}) }) };
for (const c of next.options.find(o => o.label === "สี").choices) console.log(" สี=" + c.name, "→", c.stockItemId ? "หลัก ✓" : "", c.stockLinks ? "ทรง ✓" : "");
if (back.length !== 8) { console.log("⛔ ไม่ใช่ 8 ตัวตามที่คาด — หยุด"); process.exit(1); }
if (p.options.some(o => (o.choices ?? []).some(c => c.stockItemId || c.stockLinks?.length))) { console.log("⛔ มีการผูกใหม่เกิดขึ้นแล้ว — หยุด"); process.exit(1); }
if (!APPLY) process.exit(0);
mkdirSync(".cache/stock-fix", { recursive: true });
writeFileSync(".cache/stock-fix/mirror-hand.before-restore-260919.json", JSON.stringify(row, null, 2));
const now = new Date().toISOString();
for (const d of back) await d.ref.update({ active: true, deletedAt: FieldValue.delete(), deletedBy: FieldValue.delete(), updatedAt: now });
const { error } = await sb.from("products").update({ data: next }).eq("id", "mirror-hand");
console.log(error ? "⛔ " + error.message : `✅ คืน ${back.length} ตัว + ผูกกลับแล้ว`);
process.exit(0);
