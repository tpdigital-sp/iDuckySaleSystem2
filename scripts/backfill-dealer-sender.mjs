// เติม "ผู้ส่งบนกล่อง" (Order.sender) ให้ออเดอร์ตัวแทนที่ยังไม่มี โดยใช้ผู้ส่งประจำที่ตัวแทนตั้งไว้เองในหน้าบัญชี
//   node scripts/backfill-dealer-sender.mjs                 → dry-run โชว์ว่าจะเติมใบไหน
//   node scripts/backfill-dealer-sender.mjs --apply         → เขียนจริง (สำรองแถวเดิมลง backups/ ก่อน · รันซ้ำได้)
//   node scripts/backfill-dealer-sender.mjs --only=OD-xxx   → เจาะใบเดียว
// ที่มา (15 ก.ย. 69 · OD-260915-3447): ตัวแทนตั้งชื่อร้านตัวเองไว้แล้ว แต่ใบที่สั่งมา "ก่อนตั้ง" หรือสั่งตอนไม่ได้ล็อกอิน
// ยังขึ้นชื่อร้าน iDucky บนใบปะหน้า — ระบบเติม sender ให้เฉพาะตอนสร้างใบ/ตอนกดปุ่ม 🤝 เท่านั้น
// จับเจ้าของใบแบบเดียวกับ resolveDealerUid ใน src/lib/server/dealer-sender.ts (customerId → LINE → อีเมล → เบอร์)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const APPLY = process.argv.includes("--apply");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);

const t = (v) => (typeof v === "string" ? v.trim() : "");
const clean = (s) => {
  const o = {};
  if (t(s?.name)) o.name = t(s.name).slice(0, 120);
  if (t(s?.phone)) o.phone = t(s.phone).slice(0, 40);
  if (t(s?.address)) o.address = t(s.address).slice(0, 400);
  return Object.keys(o).length ? o : undefined;
};

// ── ทะเบียนตัวแทน + ผู้ส่งประจำของแต่ละคน ──
const { data: dl } = await sb.from("products").select("data").eq("id", "__dealers__").maybeSingle();
const uids = Object.keys(dl?.data?.users ?? {});
const dealers = [];
for (const uid of uids) {
  const { data: u } = await sb.auth.admin.getUserById(uid);
  const m = u?.user?.user_metadata ?? {};
  const sender = clean(m.dealerSender);
  if (!sender) continue;
  dealers.push({ uid, email: (u.user.email ?? "").toLowerCase(), line: t(m.line_user_id), phone: t(m.phone).replace(/\D/g, ""), sender });
}
console.log(`ตัวแทนในทะเบียน ${uids.length} ราย · ตั้งผู้ส่งประจำไว้แล้ว ${dealers.length} ราย`);
if (!dealers.length) { console.log("ยังไม่มีใครตั้งผู้ส่งประจำ — ไม่มีอะไรให้เติม"); process.exit(0); }

const ownerOf = (d) => {
  if (d.customerId) { const hit = dealers.find((x) => x.uid === d.customerId); if (hit) return hit; }
  const line = t(d.lineUserId), email = t(d.email).toLowerCase(), phone = t(d.phone).replace(/\D/g, "");
  return dealers.find((x) => (line && x.line === line) || (email && x.email === email) || (phone.length >= 9 && x.phone === phone));
};

const { data: rows, error } = await sb.from("orders").select("id,data");
if (error) throw error;
const plan = [];
const orphan = [];
for (const r of rows) {
  const d = r.data ?? {};
  if (!d.dealer) continue;
  if (ONLY.length && !ONLY.includes(r.id)) continue;
  if (clean(d.sender)) continue; // ตั้งไว้แล้ว ไม่ทับ
  const owner = ownerOf(d);
  if (!owner) { orphan.push(`${r.id} (${d.customer ?? ""})`); continue; }
  plan.push({ id: r.id, row: r, sender: owner.sender, who: owner.email, printed: !!d.printedAt });
}
console.log(`\nใบตัวแทนที่ยังไม่มีผู้ส่ง · จะเติม ${plan.length} ใบ`);
for (const p of plan) console.log(` ${p.id} → "${p.sender.name ?? ""}" ${p.sender.phone ?? ""} (${p.who})${p.printed ? "  ⚠️ ปริ้นใบงานไปแล้ว" : ""}`);
if (orphan.length) console.log(`\nหาเจ้าของไม่เจอ (ไม่แตะ) ${orphan.length} ใบ: ${orphan.join(" · ")}`);
if (!APPLY || !plan.length) { console.log(APPLY ? "\nไม่มีอะไรต้องเติม" : "\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

mkdirSync("backups", { recursive: true });
const f = `backups/orders-before-dealer-sender-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
writeFileSync(f, JSON.stringify(plan.map((p) => p.row), null, 1));
console.log("\nสำรองแถวเดิม →", f);

let ok = 0;
for (const p of plan) {
  const d = p.row.data;
  const log = [...(d.log ?? []), {
    at: new Date().toISOString(), by: "ระบบ", action: "ตั้งผู้ส่งบนใบปะหน้า",
    detail: `${[p.sender.name, p.sender.phone, p.sender.address].filter(Boolean).join(" · ")} (ผู้ส่งประจำที่ตัวแทนตั้งไว้)`,
  }];
  const next = { ...d, sender: p.sender, log, savedAt: new Date().toISOString() };
  const { error: e } = await sb.from("orders").update({ data: next }).eq("id", p.id);
  if (e) console.error(" ✗", p.id, e.message);
  else { ok++; console.log(" ✓", p.id); }
}
console.log(`\nเติมแล้ว ${ok}/${plan.length} ใบ`);
