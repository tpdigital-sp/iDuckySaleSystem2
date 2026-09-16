/**
 * 💰 ซ่อมใบที่ "เงินเข้าแล้วแต่ถูกหน้าจอค้างบันทึกทับจนหาย"
 *   node scripts/fix-wiped-payment.mjs            → สแกนทั้งตาราง บอกว่าใบไหนเข้าข่าย (ไม่เขียนอะไร)
 *   node scripts/fix-wiped-payment.mjs OD-xxxxx   → ดูว่าจะซ่อมอะไรบ้างในใบนั้น (ไม่เขียนอะไร)
 *   node scripts/fix-wiped-payment.mjs OD-xxxxx --apply   → ซ่อมจริง
 *
 * ซ่อมจาก "ประวัติของใบเอง" เท่านั้น — เอาเลขจาก log ที่ SlipOK เคยยืนยันไว้ (ยอด/อ้างอิง/เวลา)
 * ไม่เดาตัวเลขเอง · รันซ้ำได้ (ใบที่ครบแล้วไม่แตะ) · ไม่ยิงไลน์/ไม่แตะ msVerify (ตอนเงินเข้าจริงยิงไปแล้ว)
 *
 * ต้นตอที่ทำให้เกิด (แก้ที่โค้ดแล้ว 16 ก.ย. 69): src/lib/server/order-money-guard.ts + savedAt ที่ประตูเขียนออเดอร์
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "application/json" };

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const id = args.find((a) => a.startsWith("OD-"));

/** ผลตรวจสลิปที่ "ผ่าน" ครั้งล่าสุดจากประวัติของใบ (ยอด · เลขอ้างอิง · เวลา) */
function passFromLog(o) {
  const e = [...(o.log ?? [])].reverse().find((x) => (x.action || "").includes("ยืนยันการชำระเงินอัตโนมัติ"));
  if (!e) return null;
  const amount = Number((e.detail || "").match(/ยอด\s*([\d,.]+)/)?.[1]?.replace(/,/g, ""));
  const transRef = (e.detail || "").match(/อ้างอิง\s*(\S+)/)?.[1];
  return Number.isFinite(amount) ? { amount, transRef, at: e.at } : null;
}

/** ส่วนลดโอนไวเคยถูกล็อกไว้ตอนไหน (จากประวัติ) */
function lockFromLog(o) {
  const e = (o.log ?? []).find((x) => (x.action || "").includes("ล็อกส่วนลดโอนไว"));
  return e ? { at: e.at, by: e.by || "ลูกค้า" } : null;
}

/** สิ่งที่หายไปจากใบนี้เทียบกับที่ประวัติบอก */
function planFor(o) {
  const pass = passFromLog(o);
  const lock = lockFromLog(o);
  const fixes = [];
  const next = { ...o };
  if (lock && o.earlyPay && !o.earlyPay.lockedAt && !o.earlyPay.waivedAt) {
    next.earlyPay = { ...o.earlyPay, lockedAt: lock.at, lockedBy: lock.by };
    fixes.push(`ล็อกส่วนลดโอนไวคืน (−${o.earlyPay.amount} บาท · ล็อกไว้ตั้งแต่ ${lock.at})`);
  }
  if (pass && o.paidTotal == null && !o.deposit) {
    next.paidTotal = pass.amount;
    fixes.push(`ยอดที่รับแล้ว = ${pass.amount} บาท (ตามสลิปที่ SlipOK ผ่านเมื่อ ${pass.at})`);
  }
  if (pass && o.slipVerify?.status !== "pass") {
    next.slipVerify = { status: "pass", amount: pass.amount, transRef: pass.transRef, at: pass.at };
    fixes.push(`ผลตรวจสลิป = ผ่าน (อ้างอิง ${pass.transRef})`);
  }
  if (pass && ["รอชำระเงิน", "รอตรวจสอบ"].includes(o.status)) {
    next.status = "ชำระแล้ว";
    fixes.push(`สถานะ "${o.status}" → "ชำระแล้ว"`);
  }
  return { fixes, next, pass };
}

async function getOrder(orderId) {
  const r = await fetch(`${URL_}/rest/v1/orders?id=eq.${orderId}&select=data`, { headers: H });
  return (await r.json())[0]?.data ?? null;
}

async function allOrders() {
  const out = [];
  for (let from = 0; ; ) {
    const r = await fetch(`${URL_}/rest/v1/orders?select=id,data&order=created_at.desc&limit=1000&offset=${from}`, { headers: H });
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows);
    from += rows.length;
    if (rows.length < 1000) break;
  }
  return out;
}

if (!id) {
  const rows = await allOrders();
  const hits = rows.map(({ id, data }) => ({ id, data, ...planFor(data) })).filter((x) => x.fixes.length);
  console.log(`สแกน ${rows.length} ใบ · เข้าข่ายถูกทับ ${hits.length} ใบ`);
  for (const x of hits) console.log(`  ${x.id} · ${x.data.date} · ${x.data.customer}\n     ${x.fixes.join("\n     ")}`);
  if (hits.length) console.log(`\nซ่อมทีละใบ: node scripts/fix-wiped-payment.mjs ${hits[0].id} --apply`);
  process.exit(0);
}

const o = await getOrder(id);
if (!o) {
  console.error(`ไม่พบออเดอร์ ${id}`);
  process.exit(1);
}
const { fixes, next } = planFor(o);
console.log(`${id} · ${o.customer} · สถานะ "${o.status}" · รับแล้ว ${o.paidTotal ?? "—"}`);
if (!fixes.length) {
  console.log("ครบแล้ว ไม่มีอะไรต้องซ่อม");
  process.exit(0);
}
console.log("จะแก้:");
for (const f of fixes) console.log(`  • ${f}`);
if (!apply) {
  console.log(`\n(ยังไม่เขียนอะไร — ใส่ --apply ถ้าจะซ่อมจริง)`);
  process.exit(0);
}

const at = new Date().toISOString();
const saved = {
  ...next,
  savedAt: at,
  log: [...(next.log ?? []), { at, by: "ระบบ", action: "ซ่อมข้อมูลการเงินที่ถูกหน้าจอค้างทับ", detail: fixes.join(" · ") }],
};
const r = await fetch(`${URL_}/rest/v1/orders?id=eq.${id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ data: saved }) });
if (!r.ok) {
  console.error("เขียนไม่สำเร็จ:", r.status, await r.text());
  process.exit(1);
}
console.log("\n✅ ซ่อมแล้ว");
