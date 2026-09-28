/**
 * 🚚 ซ่อม OD-260921-3212 รอบแบ่งส่งรอบที่ 2 — ช่องเลขพัสดุเก็บลิงก์ QR ใบงาน (คนแพ็คจ่อกล้องผิดจุด 25 ก.ย. 69)
 * แทนด้วยเลขพัสดุจริง + ลง log + ส่งการ์ดไลน์ "จัดส่งบางส่วน รอบที่ 2" ใบใหม่ให้ลูกค้า (ผ่าน notifyCustomerLogged
 * → โควตา LINE หมดก็ปักธง lineQuotaMissed ให้ cron ส่งย้อนหลังเอง)
 *
 *   tsx --conditions=react-server --env-file=.env.local scripts/fix-3212-round2-tracking.mts EQ123456789TH          → ดูเฉย ๆ
 *   tsx --conditions=react-server --env-file=.env.local scripts/fix-3212-round2-tracking.mts EQ123456789TH --apply  → บันทึกจริง + แจ้งลูกค้า
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { getSupabaseAdmin } from "../src/lib/server/supabase-admin.ts";
import { notifyCustomerLogged, orderLink, orderNotice } from "../src/lib/server/notify.ts";
import { updateOrder } from "../src/lib/server/order-write.ts";
import { shipToText, shipmentQty, withLog, type Order } from "../src/lib/admin-data.ts";
import { trackingScanProblem } from "../src/lib/scan-code.ts";

const ID = "OD-260921-3212";
const ROUND = 2;
const APPLY = process.argv.includes("--apply");
const NUM = (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "").trim().toUpperCase();
if (!NUM) { console.error("ใส่เลขพัสดุจริงของรอบที่ 2 เป็นอาร์กิวเมนต์แรก"); process.exit(1); }
const bad = trackingScanProblem(NUM);
if (bad) { console.error("เลขที่ให้มาใช้ไม่ได้:", bad); process.exit(1); }
// 🚫 เลขตัวอย่าง/เลขปลอม (28 ก.ย. 69 เจ้าของร้านกดรันคำสั่งตัวอย่าง EQ000000000TH ทั้งดุ้น → ลูกค้าได้การ์ดเลขปลอม)
if (/^[A-Z]{2}(\d)\1{8}TH$/.test(NUM) || /^[A-Z]{2}(0123456789|123456789)TH$/.test(NUM)) {
  console.error("นี่คือเลขตัวอย่าง ไม่ใช่เลขพัสดุจริง:", NUM, "— ดูเลขจริงจากใบเสร็จไปรษณีย์แล้วใส่แทน"); process.exit(1);
}

const sb = getSupabaseAdmin();
const { data, error } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
if (error) throw error;
const o = data!.data as Order;
const sh = o.shipments?.[ROUND - 1];
if (!sh) { console.log("ไม่มีรอบที่", ROUND); process.exit(1); }
// ค่าที่ยอมให้ทับ: ลิงก์ QR ใบงาน (ต้นเหตุ) หรือเลขตัวอย่างที่เผลอบันทึกไป — เลขจริงอื่นไม่ทับ
const PLACEHOLDER = /^[A-Z]{2}(\d)\1{8}TH$/i;
if (!/^https?:\/\//i.test(sh.tracking) && !PLACEHOLDER.test(sh.tracking.trim())) {
  console.log("รอบที่ 2 มีเลขจริงอยู่แล้ว:", sh.tracking, "— ไม่ทับ (ถ้าเลขนั้นผิดจริง แจ้งก่อน)"); process.exit(0);
}
if ((o.shipments ?? []).some((s, i) => i !== ROUND - 1 && s.tracking.trim() === NUM) || (o.tracking ?? "").trim() === NUM) {
  console.error("เลขนี้อยู่ในใบนี้แล้ว (รอบอื่น/ช่องหลัก)"); process.exit(1);
}
console.log("ก่อนแก้ : รอบที่", ROUND, "·", sh.tracking, "· ส่งไป", shipToText(sh.shipTo), "·", shipmentQty(sh), "ชิ้น");
console.log("หลังแก้ : รอบที่", ROUND, "·", NUM);

const shipments = o.shipments!.map((s, i) => (i === ROUND - 1 ? { ...s, tracking: NUM } : s));
const next = withLog(
  { ...o, shipments },
  "ระบบ (แก้ย้อนหลัง)",
  `🚚 แก้เลขพัสดุรอบที่ ${ROUND}`,
  `${sh.tracking} → ${NUM} · ${/^https?:/i.test(sh.tracking) ? "ของเดิมเป็นลิงก์ QR ใบงานที่สแกนผิดจุด (25 ก.ย. 69)" : "ของเดิมเป็นเลขตัวอย่างที่เผลอบันทึก (28 ก.ย. 69)"} · แจ้งการ์ดรอบที่ ${ROUND} ให้ลูกค้าใหม่`
);

if (!APPLY) { console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง + แจ้งลูกค้า)"); process.exit(0); }

mkdirSync("backups", { recursive: true });
const bak = `backups/${ID}-before-round2-tracking-fix-${Date.now()}.json`;
writeFileSync(bak, JSON.stringify(o, null, 1));
console.log("สำรองไว้ที่", bak);
const wr = await updateOrder(sb, next, { prev: o, by: "ระบบ (แก้ย้อนหลัง)" });
if (wr.error) { console.error("บันทึกไม่สำเร็จ:", wr.error.message); process.exit(1); }
console.log("บันทึกแล้ว");

// การ์ดเดียวกับที่ API ยิงตอนบันทึกรอบ (route.ts "🚚 แบ่งส่ง") — ใส่เลขจริงคราวนี้
const saved = wr.order;
const fixed = saved.shipments![ROUND - 1];
const link = orderLink("https://iduckystore.com", saved);
const qty = shipmentQty(fixed);
const bullets = fixed.proofs.map(
  (p) =>
    `${p.itemName ?? saved.items[p.item]?.name ?? "รายการ"} รูปที่ ${p.proof + 1}${
      p.qty ? ` × ${p.qty.toLocaleString("th-TH")}${p.ofQty && p.ofQty > p.qty ? `/${p.ofQty.toLocaleString("th-TH")}` : ""} ${p.unit || "ชิ้น"}` : ""
    }`
);
const rows: { label: string; value: string; bold?: boolean }[] = [{ label: "รอบที่", value: String(ROUND), bold: true }];
if (qty) rows.push({ label: "จำนวนรอบนี้", value: `${qty.toLocaleString("th-TH")} ชิ้น`, bold: true });
rows.push({ label: "เลขพัสดุรอบนี้", value: NUM, bold: true });
if (fixed.shipTo) rows.push({ label: "📍 ส่งไปที่", value: shipToText(fixed.shipTo) });
const r = await notifyCustomerLogged(
  sb,
  saved,
  orderNotice(saved, link, {
    tone: "shipRound",
    head: `จัดส่งบางส่วน (รอบที่ ${ROUND}) — แก้เลขพัสดุ`,
    headline: "ขออภัยครับ ข้อความก่อนหน้าเลขพัสดุผิด — ใช้เลขนี้ตรวจสอบพัสดุรอบที่ 2 แทนครับ",
    rows,
    bullets,
    note: "ส่วนที่เหลือจะจัดส่งในรอบถัดไป แล้วแจ้งเลขพัสดุอีกครั้งครับ",
    alt: `🚚 ออเดอร์ ${ID} แก้เลขพัสดุรอบที่ ${ROUND} ครับ\nเลขพัสดุ: ${NUM}\nรอบนี้ ${qty} ชิ้น\n${bullets.map((b) => `• ${b}`).join("\n")}\n${link}`,
  }),
  `แจ้งเลขพัสดุรอบที่ ${ROUND} ที่แก้แล้ว · ${NUM}`,
  "key"
);
console.log("แจ้งลูกค้า:", r.ok ? "ส่งแล้ว" : `ไม่สำเร็จ — ${r.reason}`);
