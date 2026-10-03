/**
 * 🤖 อ่านรูปสลิปเก่าที่ไม่มี QR ด้วย AI ย้อนหลัง (3 ต.ค. 69 · ดู src/lib/server/slip-ocr.ts)
 *   สลิปที่แนบก่อนมีระบบไม่มี verify.ocr → สลิปใหม่ที่ซ้ำกับใบเก่าจะไม่ถูกเตือน
 *
 *   npx tsx --require <shim server-only> scripts/backfill-slip-ocr.mts            → ดูเฉย ๆ (เรียก AI แต่ไม่เขียนฐาน) + รายงานคู่ที่น่าจะซ้ำ
 *   npx tsx --require <shim server-only> scripts/backfill-slip-ocr.mts --apply    → เขียน verify.ocr (+ transRef ถ้าอ่านเลขอ้างอิงได้และยังไม่มี)
 *
 * เลือกเฉพาะสลิปที่: มีไฟล์ · ไม่มี transRef (SlipOK อ่าน QR ไม่ได้) · ยังไม่มี ocr · ใบไม่ถูกยกเลิก
 * ⚠️ เขียนผ่าน updateOrder (ประตูเดียว) · ไม่แตะยอดเงิน/สถานะ · คำเตือน lookalike ไม่ย้อนเติม (เกิดกับสลิปใหม่เท่านั้น)
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const { createClient } = await import("@supabase/supabase-js");
const { readSlipImage } = await import("../src/lib/server/slip-ocr");
const { updateOrder } = await import("../src/lib/server/order-write");
const { withLog } = await import("../src/lib/admin-data");
type Order = import("../src/lib/admin-data").Order;
type SlipOcr = import("../src/lib/admin-data").SlipOcr;

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const rows: Order[] = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await sb.from("orders").select("data").range(f, f + 999);
  if (error) throw error;
  rows.push(...data.map((r) => r.data as Order));
  if (data.length < 1000) break;
}

type Slot = { order: Order; phase: "first" | "balance" | "extra"; paymentId?: string; path: string; verify: NonNullable<Order["slipVerify"]> | undefined };
const slots: Slot[] = [];
for (const o of rows) {
  if (o.status === "ยกเลิก") continue;
  if (o.slipPath) slots.push({ order: o, phase: "first", path: o.slipPath, verify: o.slipVerify });
  if (o.deposit?.balanceSlipPath) slots.push({ order: o, phase: "balance", path: o.deposit.balanceSlipPath, verify: o.deposit.balanceVerify });
  for (const p of o.payments ?? []) if (p.path && !p.fromOrder) slots.push({ order: o, phase: "extra", paymentId: p.id, path: p.path, verify: p.verify });
}
// ⚠️ ใบที่ไม่มีผลตรวจเลย (แอดมินยืนยันเองก่อนมีระบบตรวจ) ข้าม — สร้าง verify ใหม่ให้ = ป้ายสถานะสลิปเปลี่ยน (เช่นกลายเป็น "ตก")
const todo = slots.filter((s) => s.verify && !s.verify.transRef && !s.verify.ocr);
console.log(`สลิปทั้งหมด ${slots.length} · ต้องให้ AI อ่าน ${todo.length}${APPLY ? " (จะเขียนลงฐาน)" : " (ดูเฉย ๆ)"}`);

const read: { s: Slot; ocr: SlipOcr }[] = [];
for (const s of todo) {
  const dl = await sb.storage.from("payment-slips-private").download(s.path);
  if (dl.error || !dl.data) {
    console.log(`  ⏭ ${s.order.id} ${s.phase} — โหลดไฟล์ไม่ได้`);
    continue;
  }
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  // ปีที่ AI อ่านต้องใกล้ "วันที่แนบ" ไม่ใช่วันนี้ (ดู normalizeOcr)
  const attachedAt = s.verify?.at ?? (s.phase === "first" ? s.order.paidReportedAt : undefined) ?? new Date().toISOString();
  const ocr = await readSlipImage(bytes, dl.data.type || "image/jpeg", attachedAt);
  if (!ocr) {
    console.log(`  ⏭ ${s.order.id} ${s.phase} — AI อ่านไม่ออก`);
    continue;
  }
  read.push({ s, ocr });
  console.log(`  ✓ ${s.order.id} ${s.phase} · ${ocr.kind ?? "?"} · ฿${ocr.amount ?? "?"} · ${ocr.date ?? "?"} ${ocr.time ?? ""} · ref ${ocr.ref ?? "-"} · ${ocr.docRef ?? ""}`);
}

// ── คู่ที่น่าจะซ้ำในสลิปเก่า: เลขอ้างอิงเดียวกัน (แน่นอน) · ยอด+วัน(+เลขเอกสาร) เดียวกัน (น่าสงสัย) ──
console.log("\n── คู่ที่น่าจะซ้ำในสลิปเก่า ──");
const refOwners = new Map<string, string[]>();
for (const s of slots) if (s.verify?.transRef) refOwners.set(s.verify.transRef, [...(refOwners.get(s.verify.transRef) ?? []), `${s.order.id}/${s.phase}`]);
let pairs = 0;
for (const { s, ocr } of read) {
  const me = `${s.order.id}/${s.phase}`;
  if (ocr.ref) {
    const others = (refOwners.get(ocr.ref) ?? []).filter((x) => x !== me);
    if (others.length) (pairs++, console.log(`  ⛔ ${me} เลขอ้างอิง ${ocr.ref} ซ้ำกับ ${others.join(", ")}`));
    refOwners.set(ocr.ref, [...(refOwners.get(ocr.ref) ?? []), me]);
  }
}
for (let i = 0; i < read.length; i++)
  for (let j = i + 1; j < read.length; j++) {
    const a = read[i], b = read[j];
    if (a.s.order.id === b.s.order.id && a.s.phase === b.s.phase) continue;
    if (!a.ocr.amount || a.ocr.amount !== b.ocr.amount || !a.ocr.date || !b.ocr.date) continue;
    const days = Math.abs(Date.parse(a.ocr.date) - Date.parse(b.ocr.date)) / 86_400_000;
    const doc = !!a.ocr.docRef && a.ocr.docRef === b.ocr.docRef;
    if (days === 0 || (days <= 1 && doc))
      (pairs++, console.log(`  ⚠️ ${a.s.order.id}/${a.s.phase} ↔ ${b.s.order.id}/${b.s.phase} · ฿${a.ocr.amount} · ${a.ocr.date}/${b.ocr.date}${doc ? ` · ${a.ocr.docRef}` : ""}`));
  }
if (!pairs) console.log("  ไม่พบ");

if (!APPLY) {
  console.log("\nยังไม่ได้เขียนลงฐาน — ใส่ --apply เพื่อบันทึกผลอ่าน");
  process.exit(0);
}

// ── เขียนลงฐาน: รวมทุกช่องของออเดอร์เดียวกันในการเขียนครั้งเดียว ──
const byOrder = new Map<string, { s: Slot; ocr: SlipOcr }[]>();
for (const r of read) byOrder.set(r.s.order.id, [...(byOrder.get(r.s.order.id) ?? []), r]);
for (const [id, list] of byOrder) {
  const { data } = await sb.from("orders").select("data").eq("id", id).single();
  let o = data!.data as Order;
  const add = (v: Order["slipVerify"], ocr: SlipOcr): Order["slipVerify"] => ({
    ...v!,
    ocr,
    ...(ocr.ref && !v?.transRef ? { transRef: ocr.ref, refFrom: "ocr" as const } : {}),
  });
  for (const { s, ocr } of list) {
    if (s.phase === "first") o = { ...o, slipVerify: add(o.slipVerify, ocr) };
    else if (s.phase === "balance" && o.deposit) o = { ...o, deposit: { ...o.deposit, balanceVerify: add(o.deposit.balanceVerify, ocr) } };
    else if (s.phase === "extra") o = { ...o, payments: (o.payments ?? []).map((p) => (p.id === s.paymentId ? { ...p, verify: add(p.verify, ocr) } : p)) };
  }
  o = withLog(o, "ระบบ (อ่านสลิปย้อนหลัง)", "🤖 AI อ่านรูปสลิปที่ไม่มี QR ย้อนหลัง", `${list.length} ใบ — ไว้กันสลิปซ้ำกับใบใหม่`);
  const { error } = await updateOrder(sb, o);
  console.log(error ? `  ✗ ${id} ${error.message}` : `  💾 ${id} (${list.length} ใบ)`);
}
process.exit(0);
