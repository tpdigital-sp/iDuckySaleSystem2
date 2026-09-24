/**
 * 🧾➕ OD-260921-1879 — แนบ QT010743 เป็น "บิลเพิ่ม" ผูกกับรายการเก็บเพิ่มที่ทำไปแล้ว + ให้ใบเป็น "รอชำระเงิน" ตามกติกาใหม่
 * (เจ้าของร้าน 24 ก.ย. 69: "มียอดส่วนต่าง ทำไมไม่เป็นสถานะรอชำระเงิน" + "บิลบริษัทต้องมี 2 บิล ฝั่งแพ็คต้องรู้")
 *   node --conditions=react-server --import tsx scripts/od-1879-attach-extra-bill.mts [--apply]
 * ไม่ยิงไลน์ (ลูกค้าได้การ์ดเก็บเพิ่มไปแล้วตอน 16:43)
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchFlowAccountDoc } from "../src/lib/server/flowaccount";
import { updateOrder } from "../src/lib/server/order-write";
import { syncItemsToTP } from "../src/lib/server/tp-report";
import { orderBalance, orderTotal, flowAccountGap, taxInvoiceDocNos, withLog, type FlowAccountExtraDoc, type Order } from "../src/lib/admin-data";

const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v as string;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const apply = process.argv.includes("--apply");
const ID = "OD-260921-1879";
const URL = "https://share.flowaccount.com/qt/th/rw1czxlvfemuuzxgv3l2hw";
const BY = "Claude (เจ้าของร้านสั่ง)";
const thb = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });

const { data: row } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
const prev = row?.data as Order;
if (!prev) throw new Error("ไม่พบออเดอร์");
if (prev.flowAccountExtras?.some((x) => x.docNo === "QT010743")) throw new Error("แนบไปแล้ว");
const charge = (prev.charges ?? []).find((c) => c.note?.includes("QT010743"));
if (!charge) throw new Error("ไม่พบรายการเก็บเพิ่ม QT010743");
const doc = await fetchFlowAccountDoc(URL);
const extra: FlowAccountExtraDoc = {
  url: URL, docType: doc.docType, docTypeLabel: doc.docTypeLabel, docNo: doc.docNo, date: doc.date,
  subtotal: doc.subtotal, vat: doc.vat, grandTotal: Math.round(Number(doc.grandTotal ?? 0) * 100) / 100, wht: doc.wht, net: doc.net,
  lines: doc.items.slice(0, 6).map((it) => `${it.name} ×${it.qty} @${it.unitPrice}`),
  chargeId: charge.id, by: BY, at: new Date().toISOString(),
};
let next: Order = withLog(
  { ...prev, flowAccountExtras: [...(prev.flowAccountExtras ?? []), extra] },
  BY, `แนบบิลเพิ่ม ${doc.docTypeLabel} ${doc.docNo}`,
  `${thb(extra.grandTotal)} บาท · ผูกกับรายการเก็บเพิ่มเดิม (${charge.label}) · ฝ่ายแพ็คต้องใส่ใบกำกับ 2 ใบ: ${taxInvoiceDocNos({ ...prev, flowAccountExtras: [extra] })}`
);
if (next.status === "กำลังผลิต" && orderBalance(next) > 0) {
  next = withLog(
    { ...next, status: "รอชำระเงิน", reopenedFrom: "กำลังผลิต" },
    BY, "ยอดรวมเพิ่มขึ้น — กลับไปรอชำระเงิน",
    `ค้างอีก ${thb(orderBalance(next))} บาท (จ่ายมาแล้ว ${thb(next.paidTotal ?? 0)} จาก ${thb(orderTotal(next))}) · จำขั้น "กำลังผลิต" ไว้ เงินครบกลับเอง · คิวปริ้น/แพ็คยังเห็นใบนี้`
  );
}
console.log("extra:", JSON.stringify(extra, null, 1));
console.log("status", prev.status, "→", next.status, "· reopenedFrom", next.reopenedFrom, "· bal", orderBalance(next), "· gap", flowAccountGap(next), "· docs", taxInvoiceDocNos(next));
if (!apply) { console.log("(dry-run)"); process.exit(0); }
const r = await updateOrder(sb, next, { prev, by: BY });
if (r.error) throw r.error;
await syncItemsToTP(next).catch((e) => console.log("TP sync:", e?.message));
console.log("✅ เขียนแล้ว");
