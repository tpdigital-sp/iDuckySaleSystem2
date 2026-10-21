import "server-only";
import { politeName } from "@/lib/customer-name";
import {
  orderChargesTotal,
  orderDiscountTotal,
  orderSubtotal,
  orderTotal,
  orderVatAmount,
  orderWhtAmount,
  type Order,
} from "@/lib/admin-data";
import { bkkParts } from "@/lib/bangkok-time";
import { extraDocItemsBill, mainQuotationUpdatable, orderBalance, orderHasFaBill, unbilledAmount, whtCoversBalance } from "@/lib/admin-data";
import { foldSizeExtra, specEntries, specLabel, specValueLines, stripSpecUrls, tidySpec } from "@/components/SpecLines";

/**
 * 📄 ออเดอร์ในระบบ → ใบเสนอราคา FlowAccount (เฟส 1 · เจ้าของร้านสั่ง 6 ต.ค. 69)
 *
 * แบบเดียวกับที่พนักงานออกมือ (ดู QT010788 / QT010805): ราคาไม่รวม VAT + VAT 7% ท้ายบิล (isVatInclusive false)
 *   รายการสินค้า = ชื่อสินค้า + คำอธิบายสเปก (ท่าเดียวกับใบเสร็จ PDF) · ค่าส่ง/ค่าบริการเพิ่ม = รายการแยก · ส่วนลดรวม = ส่วนลดท้ายบิล
 *   หัก ณ ที่จ่าย = ติ๊กแสดงในใบ (documentWithholdingTax…) เมื่อออเดอร์ตั้ง wht ไว้
 * เจ้าของร้านเลือก "ก. บวก VAT เพิ่ม 7%" → ใบต้องตรงยอดออเดอร์ทุกบาท: ต้องเปิด VAT 7% ในออเดอร์ก่อน (ปุ่มเดิม — จัดการยอดค้าง/แจ้งลูกค้าให้)
 */

/**
 * 📄 เอกสารหลักของออเดอร์ — order.flowAccount (สร้างออเดอร์จากลิงก์ FlowAccount / ออก QT จากหน้าออเดอร์) เท่านั้น
 * เดิม (7 ต.ค. 69) นับ taxInvoice.docNo ที่วางในฟอร์ม "ใส่ข้อมูลใบกำกับภาษี" ด้วย กันออก QT ซ้ำ
 * 15 ต.ค. 69 เจ้าของร้านเคาะ: ฟอร์มนั้นเอาแค่ข้อมูลผู้ซื้อ ลิงก์ที่วางมักเป็น QT ฉบับเก่า — ห้ามถือเป็นเอกสารหลัก
 * ไม่งั้นปุ่มออกใบเสนอราคาหาย/ใบแจ้งหนี้ไปต่อจาก QT เก่า · ใบเก่าที่ยังมี docNo ค้างก็ไม่นับแล้ว
 */
export function mainDocOf(o: Order): { docNo: string; docType: string; docTypeLabel: string; grandTotal?: number; docChanged?: unknown } | null {
  return o.flowAccount ?? null;
}

export interface FaLine {
  name: string;
  description: string;
  quantity: number;
  pricePerUnit: number;
  total: number;
}

export interface QuotationDraft {
  lines: FaLine[];
  subTotal: number;
  discount: number;
  afterDiscount: number;
  vat: number;
  grandTotal: number;
  wht?: { rate: number; amount: number };
  contact: { name: string; taxId?: string; branch?: string; address?: string; person?: string; phone?: string; email?: string };
  /** ทำไมยังออกไม่ได้ (ว่าง = ออกได้) */
  problems: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 🚫 ห้ามมีคำว่า "สกรีน" ในเอกสาร FlowAccount ทุกใบ (QT/BL/INV/บิลเพิ่ม) — พนักงานบัญชีแจ้ง 21 ต.ค. 69 (OD-261021-9043 QT010967)
 * "สกรีน" = งานบริการ ลูกค้านิติบุคคลต้องหัก ณ ที่จ่าย 3% · "พิมพ์" = ขายสินค้า ไม่ต้องหัก
 * เดิมพนักงานต้องรู้เองแล้วแก้คำในแอป FlowAccount คนใหม่ไม่รู้ → ระบบแทนให้ตอนร่างทุกครั้ง
 * ใช้กับชื่อรายการ / รายละเอียด (ตัวเลือกสินค้า เช่น "งานสกรีน: สกรีน 1 ด้าน") / ชื่อค่าบริการเพิ่ม · ออเดอร์ในระบบคงคำเดิม (จอผลิตยังใช้ "สกรีน")
 */
export function faWording(s: string): string {
  return s.replace(/สกรีน/g, "พิมพ์");
}

function itemDescription(item: Order["items"][number]): string {
  const lines: string[] = [];
  const entries = foldSizeExtra(
    tidySpec(specEntries(item.sel, item.selections))
      .map(([k, v]) => [k, stripSpecUrls(v)] as [string, string])
      .filter(([, v]) => v)
  );
  for (const [k, v] of entries) {
    const parts = specValueLines(v).map((x) => x.trim()).filter(Boolean);
    if (k) lines.push(`- ${specLabel(k)}: ${parts.join(", ")}`);
    // ข้อความอิสระ (ใบที่มาจาก FlowAccount/พิมพ์เอง) — คงบรรทัดเดิม ใส่ "- " เฉพาะบรรทัดที่ยังไม่มีขีดนำ
    else for (const x of parts) lines.push(/^[-*•(]/.test(x) ? x : `- ${x}`);
  }
  // บรรทัดสรุปจำนวน/ราคาแบบที่พนักงานพิมพ์ — มีอยู่แล้วในสเปกก็ไม่ซ้ำ
  if (!lines.some((l) => /จำนวน\s*[\d,]+/.test(l)))
    lines.push(`จำนวน ${item.qty.toLocaleString("th-TH")} ชิ้น ชิ้นละ ${item.unitPrice.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`);
  return faWording(lines.join("\n")).slice(0, 2000);
}

export function quotationDraft(o: Order): QuotationDraft {
  const problems: string[] = [];
  const main0 = mainDocOf(o);
  if (main0) problems.push(`ออเดอร์นี้ผูกเอกสาร FlowAccount ${main0.docNo} แล้ว`);
  if (!o.taxInvoice?.company) problems.push("ยังไม่ได้ใส่ข้อมูลใบกำกับภาษี (ชื่อบริษัท/เลขผู้เสียภาษี/ที่อยู่) — กด 🧾 ใส่ข้อมูลใบกำกับภาษี ก่อน");
  if (!(orderVatAmount(o) > 0)) problems.push("ยังไม่ได้เปิด VAT 7% — กด “＋ เปิด VAT 7%” ในกล่องยอดเงินก่อน (ยอดออเดอร์จะเท่ากับยอดในใบ)");
  if (o.status === "ยกเลิก") problems.push("ออเดอร์ถูกยกเลิกแล้ว");

  // 🧾➕ รายการของบิลเพิ่ม (extraDoc) อยู่ในใบอื่นแล้ว — ใบหลักไม่นับ ทั้งรายการ ค่าส่งในใบนั้น และ VAT/หัก ณ ที่จ่ายของใบนั้น
  const ex = extraDocItemsBill(o);
  const exSub = r2(o.items.filter((it) => it.extraDoc).reduce((s, it) => s + it.qty * it.unitPrice, 0));
  const lines: FaLine[] = o.items.filter((it) => !it.extraDoc).map(lineOf);
  const ship = r2((o.shippingCost ?? 0) - ex.ship);
  if (ship > 0) lines.push({ name: "ค่าส่ง", description: "", quantity: 1, pricePerUnit: ship, total: ship });
  for (const c of o.charges ?? []) {
    const amt = Math.max(0, Number(c.amount) || 0);
    if (amt > 0) lines.push({ name: faWording(c.label || "ค่าบริการเพิ่ม").slice(0, 250), description: "", quantity: 1, pricePerUnit: amt, total: r2(amt) });
  }
  const subTotal = r2(lines.reduce((s, l) => s + l.total, 0));
  const discount = r2(orderDiscountTotal(o));
  const afterDiscount = r2(subTotal - discount);
  const vat = r2(afterDiscount * 0.07);
  const grandTotal = r2(afterDiscount + vat);

  // ใบต้องเท่ายอดออเดอร์ทุกบาท — ไม่ตรง = มีอะไรที่ใบยังไม่รู้จัก ห้ามออก
  const expectBase = r2(orderSubtotal(o) - exSub + (o.shippingCost ?? 0) - ex.ship + orderChargesTotal(o) - orderDiscountTotal(o));
  const orderVat = r2(orderVatAmount(o) - ex.vat);
  const orderGrand = r2(orderTotal(o) - ex.total);
  if (Math.abs(expectBase - afterDiscount) > 0.01) problems.push(`ยอดก่อน VAT ไม่ตรงออเดอร์ (ใบ ${afterDiscount} · ออเดอร์ ${expectBase})`);
  if (orderVat > 0 && Math.abs(orderVat - vat) > 0.05)
    problems.push(`VAT ในออเดอร์ (${orderVat}) ไม่ใช่ 7% ของยอดก่อน VAT (${vat}) — แก้ VAT ในออเดอร์ก่อน`);
  if (orderVat > 0 && Math.abs(orderGrand - grandTotal) > 0.05) problems.push(`ยอดรวมไม่ตรงออเดอร์ (ใบ ${grandTotal} · ออเดอร์ ${orderGrand})`);

  const whtAmt = r2(orderWhtAmount(o) - ex.wht);
  return {
    lines,
    subTotal,
    discount,
    afterDiscount,
    vat,
    grandTotal,
    ...(whtAmt > 0 ? { wht: { rate: o.wht?.rate ?? 3, amount: whtAmt } } : {}),
    contact: contactOf(o),
    problems,
  };
}

function lineOf(it: Order["items"][number]): FaLine {
  return {
    name: faWording(it.name || "สินค้า").slice(0, 250),
    description: itemDescription(it),
    quantity: it.qty,
    pricePerUnit: it.unitPrice,
    total: r2(it.qty * it.unitPrice),
  };
}

function contactOf(o: Order): QuotationDraft["contact"] {
  const t = o.taxInvoice;
  return {
    name: (t?.company ?? o.customer ?? "").trim(),
    taxId: t?.taxId?.replace(/\D/g, "") || undefined,
    branch: t?.branch || undefined,
    address: t?.address || o.address || undefined,
    // 🙏 ช่อง "ผู้ติดต่อ" เติม "คุณ" (เจ้าของร้านขอ 7 ต.ค. 69) · contactName ด้านบนคงชื่อเดิม — FlowAccount ผูกสมุดผู้ติดต่อด้วยชื่อนั้น
    person: politeName(o.customer) || undefined,
    phone: o.phone || undefined,
    email: o.email || undefined,
  };
}

/* ── 📄➕ ใบเสนอราคา "เฉพาะรายการที่สั่งเพิ่ม" (บิลเพิ่ม · เจ้าของร้านสั่ง 16 ต.ค. 69 OD-261002-9030) ─────────────────
 * ลูกค้าบิลบริษัทสั่งเพิ่มหลังออกใบเสร็จไปแล้ว — รายการเพิ่มอยู่ในออเดอร์ + เก็บเงินแล้ว แต่ยังไม่มีเอกสาร FlowAccount
 * ปุ่มออก QT เดิมเอาทุกรายการ (ซ้ำบิลเดิม) → ใบนี้เอาเฉพาะรายการที่เลือก ราคาไม่รวม VAT + VAT 7% ท้ายบิล (+ หัก ณ ที่จ่ายเรตเดียวกับออเดอร์)
 * สร้างแล้ว = บิลเพิ่มใน order.flowAccountExtras (items = จำนวนรายการ) + ติด extraDoc ให้รายการ — ไม่เปลี่ยนยอด/ไม่แจ้งลูกค้า
 */
export interface ExtraQuotationDraft extends QuotationDraft {
  /** index รายการใน o.items ที่อยู่ในใบ */
  items: number[];
  /** ยอดที่ยังไม่มีบิล (orderTotal − บิลที่ออกแล้ว) · null = ไม่รู้ */
  unbilled: number | null;
  /** เตือนแต่ไม่ห้าม (ยอดไม่ตรงยอดที่ยังไม่มีบิล ฯลฯ) */
  warnings: string[];
}

/** ลายนิ้วมือรายการ — หน้าจอส่งมาคู่กับ index กันออเดอร์ถูกแก้ระหว่างเลือก (ลบ/สลับแถว) แล้วออกใบผิดรายการ */
export const itemPrint = (it: Order["items"][number]) => `${it.name}|${it.qty}|${it.unitPrice}`;

export function extraQuotationDraft(o: Order, picks: { idx: number; print?: string }[]): ExtraQuotationDraft {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (o.status === "ยกเลิก") problems.push("ออเดอร์ถูกยกเลิกแล้ว");
  if (!orderHasFaBill(o)) problems.push("ออเดอร์นี้ยังไม่มีบิล FlowAccount — ใช้ปุ่ม “ออกใบเสนอราคาใน FlowAccount” ออกทั้งใบแทน");
  else if (mainQuotationUpdatable(o)) problems.push(`${o.flowAccount!.docNo} ยังไม่ออกใบกำกับ/ใบเสร็จ — ใช้ “🔄 อัปเดตใบเสนอราคาใน FlowAccount” ใส่รายการเพิ่มในใบเดิมแทน`);
  if (!o.taxInvoice?.company) problems.push("ยังไม่ได้ใส่ข้อมูลใบกำกับภาษี (ชื่อบริษัท/เลขผู้เสียภาษี/ที่อยู่)");
  if (!(orderVatAmount(o) > 0)) problems.push("ออเดอร์นี้ไม่มี VAT 7% — บิลเพิ่มต้องมี VAT เหมือนบิลหลัก");
  const idxs = [...new Set(picks.map((p) => p.idx))].sort((a, b) => a - b);
  if (!idxs.length) problems.push("ยังไม่ได้เลือกรายการ");
  for (const p of picks) {
    const it = o.items[p.idx];
    if (!it) problems.push(`ไม่พบรายการลำดับที่ ${p.idx + 1} — รีเฟรชหน้าแล้วเลือกใหม่`);
    else if (p.print != null && p.print !== itemPrint(it)) problems.push(`รายการลำดับที่ ${p.idx + 1} ถูกแก้ระหว่างเลือก — รีเฟรชหน้าแล้วเลือกใหม่`);
    else if (it.extraDoc) problems.push(`“${it.name}” อยู่ในบิลเพิ่ม ${it.extraDoc} แล้ว`);
    else if (!(it.qty > 0) || !(it.unitPrice > 0)) problems.push(`“${it.name}” ไม่มีจำนวน/ราคา`);
  }
  const lines = idxs.map((i) => o.items[i]).filter(Boolean).map(lineOf);
  const subTotal = r2(lines.reduce((s, l) => s + l.total, 0));
  const vat = r2(subTotal * 0.07);
  const grandTotal = r2(subTotal + vat);
  const whtRate = (o.wht?.amount ?? 0) > 0 ? o.wht?.rate ?? 3 : 0;
  const unbilled = unbilledAmount(o);
  if (unbilled != null && Math.abs(unbilled - grandTotal) > 0.05)
    warnings.push(
      unbilled <= 0.05
        ? `ยอดออเดอร์มีบิลครบแล้ว (ไม่มียอดที่ยังไม่ออกบิล) — ใบนี้ ${grandTotal} จะซ้ำกับบิลเดิมหรือเปล่า`
        : `ยอดใบนี้ ${grandTotal} ไม่เท่ายอดที่ยังไม่มีบิล ${unbilled} — เลือกรายการครบไหม / มีส่วนลดหรือค่าส่งของรายการเพิ่มหรือเปล่า`
    );
  // ส่วนลดของออเดอร์ไม่ลงใบเพิ่ม — เตือนเฉพาะตอนยอดไม่ยืนยันกันเอง (ยอดตรงยอดที่ยังไม่มีบิล = ไม่ต้องเตือน)
  if (orderDiscountTotal(o) > 0 && (unbilled == null || warnings.length)) warnings.push("ออเดอร์นี้มีส่วนลด — ใบเพิ่มไม่ใส่ส่วนลด ตรวจยอดกับที่ลูกค้าโอนอีกที");
  return {
    lines,
    subTotal,
    discount: 0,
    afterDiscount: subTotal,
    vat,
    grandTotal,
    ...(whtRate ? { wht: { rate: whtRate, amount: r2((subTotal * whtRate) / 100) } } : {}),
    contact: contactOf(o),
    problems,
    items: idxs,
    unbilled,
    warnings,
  };
}

/** ร่าง → body ของ POST /quotations (Simple document · ภาษีแยกท้ายบิล) */
export const SALES_NAME = "พนักงาน";

export function quotationBody(o: Order, d: QuotationDraft, _salesName?: string): Record<string, unknown> {
  const p = bkkParts(new Date());
  const today = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  return {
    contactName: d.contact.name,
    ...(d.contact.taxId ? { contactTaxId: d.contact.taxId } : {}),
    ...(d.contact.branch ? { contactBranch: d.contact.branch } : {}),
    ...(d.contact.address ? { contactAddress: d.contact.address } : {}),
    ...(d.contact.person ? { contactPerson: d.contact.person } : {}),
    ...(d.contact.phone ? { contactNumber: d.contact.phone } : {}),
    ...(d.contact.email ? { contactEmail: d.contact.email } : {}),
    publishedOn: today,
    dueDate: today,
    creditType: 1,
    creditDays: 0,
    // ผู้ขาย = "พนักงาน" เสมอ แบบที่พนักงานออกมือใน FlowAccount (เจ้าของร้านสั่ง 7 ต.ค. 69 · ชื่อคนกดมีอีโมจิ เช่น "Pang 🐰" PDF ของ FlowAccount แสดงเป็น □)
    // คนกดจริงอยู่ในประวัติออเดอร์แล้ว (withLog) · พารามิเตอร์ _salesName ไม่ใช้แล้ว (คงไว้ให้ผู้เรียกเดิม)
    salesName: SALES_NAME,
    // ไม่ใส่ reference (ช่อง "อ้างอิง" บนเอกสาร) — เจ้าของร้านขอเอาเลข OD ออก 7 ต.ค. 69 · เลข OD ยังอยู่ใน internalNotes (ลูกค้าไม่เห็น)
    // ใบวางบิล/ใบกำกับ (upgradeBody) ยังอ้างเลขใบเสนอราคาเหมือนเดิม
    reference: "",
    internalNotes: `สร้างจากระบบ iDucky ออเดอร์ ${o.id}`,
    isVatInclusive: false,
    isVat: true,
    discountType: 3,
    discountAmount: d.discount,
    items: d.lines.map((l) => ({ type: 1, name: l.name, description: l.description, quantity: l.quantity, unitName: "", pricePerUnit: l.pricePerUnit, total: l.total })),
    subTotal: d.subTotal,
    totalAfterDiscount: d.afterDiscount,
    vatAmount: d.vat,
    grandTotal: d.grandTotal,
    ...(d.wht ? { documentShowWithholdingTax: true, documentWithholdingTaxPercentage: d.wht.rate, documentWithholdingTaxAmount: d.wht.amount } : {}),
  };
}

/* ── เฟส 2–3: ใบแจ้งหนี้ + ใบกำกับภาษี/ใบเสร็จรับเงิน ต่อจากเอกสารหลัก (7 ต.ค. 69) ───────────────── */

export type FaDocKind = "qt" | "bl" | "inv";

export const FA_KIND_LABEL: Record<FaDocKind, string> = {
  qt: "ใบเสนอราคา",
  bl: "ใบแจ้งหนี้",
  inv: "ใบกำกับภาษี/ใบเสร็จรับเงิน",
};

/** ชนิดเอกสารต้นทางตามสเปก UpgradeDocument: Quotations = 3 · Billing Notes = 5 · Tax Invoices = 7 */
const REF_TYPE: Record<string, number> = { qt: 3, bl: 5, inv: 7 };

/** เอกสารที่ใบใหม่จะอ้างอิง (อัปเกรดต่อ) — ใบแจ้งหนี้ล่าสุดใน faChain ก่อน แล้วค่อยเอกสารหลัก */
export function upgradeSource(o: Order, kind: FaDocKind): { docNo: string; type: number } | null {
  if (kind === "inv") {
    const bl = [...(o.faChain ?? [])].reverse().find((d) => d.kind === "bl");
    if (bl) return { docNo: bl.docNo, type: REF_TYPE.bl };
  }
  const m = mainDocOf(o);
  if (m && REF_TYPE[m.docType]) return { docNo: m.docNo, type: REF_TYPE[m.docType] };
  return null;
}

/** วันที่รับเงิน (YYYY-MM-DD เวลาไทย) — เวลาโอนบนสลิปใบล่าสุด · ไม่มี = เวลาแนบ · ไม่มี = เวลาที่ใบเข้าขั้นชำระแล้ว (paidAt) · ไม่มีเลย = วันนี้ */
export function paymentDateOf(o: Order): string {
  const times = [...(o.payments ?? []).map((p) => p.verify?.transAt || p.at), o.slipVerify?.transAt].filter((x): x is string => !!x).sort();
  const at = times.at(-1) || o.paidAt;
  const p = bkkParts(at ? new Date(at) : new Date());
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** ร่างใบแจ้งหนี้/ใบกำกับภาษี — รายการ/ยอดเหมือนใบเสนอราคา + เงื่อนไขของแต่ละขั้น */
export function draftFor(o: Order, kind: FaDocKind): QuotationDraft & { source?: { docNo: string; type: number }; paymentDate?: string } {
  if (kind === "qt") return quotationDraft(o);
  // ร่างรายการ/ยอดแบบใบเสนอราคา โดยไม่นับว่า "มีเอกสารหลักแล้ว" (ข้อห้ามนั้นใช้กับ QT อย่างเดียว)
  const base = quotationDraft({ ...o, flowAccount: undefined, ...(o.taxInvoice ? { taxInvoice: { ...o.taxInvoice, docNo: undefined } } : {}) });
  const problems = base.problems.slice();
  const src = upgradeSource(o, kind);
  const main = mainDocOf(o);
  if (!main) problems.unshift("ยังไม่มีเอกสาร FlowAccount หลัก — ออกใบเสนอราคาก่อน");
  else if (!src) problems.push(`เอกสารหลัก ${main.docNo} อัปเกรดต่อไม่ได้ (ชนิด ${main.docTypeLabel})`);
  if (o.deposit || o.flowAccount?.deposit) problems.push("ใบมัดจำ — ออกใบแจ้งหนี้/ใบกำกับใน FlowAccount เอง (ยังไม่รองรับมัดจำ)");
  if (main?.grandTotal != null && Math.abs(main.grandTotal - base.grandTotal) > 0.05)
    problems.push(`ยอดออเดอร์ (${base.grandTotal}) ไม่ตรง ${main.docTypeLabel} ${main.docNo} (${main.grandTotal}) — แก้ให้ตรงก่อน`);
  if (main?.docChanged) problems.push(`${main.docNo} ถูกแก้ใน FlowAccount หลังเปิดออเดอร์ — กด 🔄 เทียบกับเอกสารล่าสุด ก่อน`);
  const chain = o.faChain ?? [];
  if (kind === "bl") {
    if (main && main.docType !== "qt") problems.push(`เอกสารหลักเป็น ${main.docTypeLabel} อยู่แล้ว — ไม่ต้องออกใบแจ้งหนี้`);
    if (chain.some((d) => d.kind === "bl")) problems.push(`ออกใบแจ้งหนี้แล้ว (${chain.find((d) => d.kind === "bl")!.docNo})`);
    if (chain.some((d) => d.kind === "inv") || (o.faInvoices ?? []).length)
      problems.push(`ออกใบกำกับภาษีแล้ว (${[...chain.filter((d) => d.kind === "inv").map((d) => d.docNo), ...(o.faInvoices ?? []).map((v) => v.docNo)].filter((v, i, a) => a.indexOf(v) === i).join(", ")}) — ไม่ต้องออกใบแจ้งหนี้`);
  }
  if (kind === "inv") {
    if (chain.some((d) => d.kind === "inv")) problems.push(`ออกใบกำกับภาษี/ใบเสร็จรับเงินแล้ว (${chain.find((d) => d.kind === "inv")!.docNo})`);
    if (!(orderBalance(o) <= 0.5 || whtCoversBalance(o))) problems.push(`ยังเก็บเงินไม่ครบ (ค้าง ${orderBalance(o).toLocaleString("th-TH")} บาท) — ใบเสร็จออกได้เมื่อรับเงินครบ`);
  }
  return { ...base, problems, ...(src ? { source: src } : {}), ...(kind === "inv" ? { paymentDate: paymentDateOf(o) } : {}) };
}

/**
 * 🧾➕ ร่างใบกำกับภาษี/ใบเสร็จรับเงิน ต่อจากใบเสนอราคา "บิลเพิ่ม" (เจ้าของร้านสั่ง 16 ต.ค. 69 · OD-261002-9030 QT010927)
 * รายการ = รายการในออเดอร์ที่ติด extraDoc ของใบนั้น (+ ค่าส่งในใบ) ต้องรวมได้เท่ายอดใบ · วันที่ = วันโอน · รับเงินครบแล้วเท่านั้น
 * ใบที่แนบแบบเก็บเพิ่ม/อ้างอิง (ไม่ได้ใส่เป็นรายการ) ระบบไม่รู้รายการ → ออกในแอป FlowAccount เอง
 */
export function extraInvoiceDraft(o: Order, docNo: string): QuotationDraft & { source?: { docNo: string; type: number }; paymentDate?: string } {
  const problems: string[] = [];
  const x = (o.flowAccountExtras ?? []).find((d) => d.docNo === docNo);
  const its = o.items.filter((it) => it.extraDoc === docNo);
  const lines = its.map(lineOf);
  if (x?.ship && x.ship > 0) lines.push({ name: "ค่าส่ง", description: "", quantity: 1, pricePerUnit: x.ship, total: r2(x.ship) });
  const subTotal = r2(lines.reduce((s, l) => s + l.total, 0));
  const vat = r2(subTotal * 0.07);
  const grandTotal = r2(subTotal + vat);
  if (!x) problems.push(`ไม่พบบิลเพิ่ม ${docNo} ในออเดอร์นี้`);
  else {
    if (x.docType !== "qt") problems.push(`${docNo} เป็น${x.docTypeLabel} — ออกใบกำกับต่อได้เฉพาะใบเสนอราคา`);
    if (!its.length) problems.push(`${docNo} แนบแบบไม่ใส่รายการ ระบบไม่รู้รายการในใบ — ออกใบกำกับในแอป FlowAccount เอง`);
    else if (Math.abs(grandTotal - x.grandTotal) > 0.05) problems.push(`รายการในออเดอร์รวม ${grandTotal} ไม่เท่ายอด ${docNo} (${x.grandTotal}) — แก้ให้ตรงก่อน`);
    const inv = x.inv?.docNo ?? (o.faInvoices ?? []).find((v) => (v.ref ?? "").toUpperCase() === docNo.toUpperCase())?.docNo;
    if (inv) problems.push(`ออกใบกำกับภาษี/ใบเสร็จของ ${docNo} แล้ว (${inv})`);
  }
  if (!o.taxInvoice?.company) problems.push("ยังไม่ได้ใส่ข้อมูลใบกำกับภาษี (ชื่อบริษัท/เลขผู้เสียภาษี/ที่อยู่)");
  if (o.deposit || o.flowAccount?.deposit) problems.push("ใบมัดจำ — ออกใบกำกับใน FlowAccount เอง (ยังไม่รองรับมัดจำ)");
  if (o.status === "ยกเลิก") problems.push("ออเดอร์ถูกยกเลิกแล้ว");
  if (!(orderBalance(o) <= 0.5 || whtCoversBalance(o))) problems.push(`ยังเก็บเงินไม่ครบ (ค้าง ${orderBalance(o).toLocaleString("th-TH")} บาท) — ใบเสร็จออกได้เมื่อรับเงินครบ`);
  const whtAmt = r2(x?.wht ?? 0);
  return {
    lines,
    subTotal,
    discount: 0,
    afterDiscount: subTotal,
    vat,
    grandTotal,
    ...(whtAmt > 0 ? { wht: { rate: o.wht?.rate ?? 3, amount: whtAmt } } : {}),
    contact: contactOf(o),
    problems,
    source: { docNo, type: REF_TYPE.qt },
    paymentDate: paymentDateOf(o),
  };
}

/**
 * body ของใบแจ้งหนี้ / ใบกำกับภาษี — อ้างอิงเอกสารต้นทาง (documentReference = อัปเกรด: ต้นทางกลายเป็น "ดำเนินการแล้ว")
 * ⚠️ ใบกำกับต้องสร้างผ่าน POST /tax-invoices (ไม่ใช่ /with-payment — ตัวนั้นไม่ผูกอัปเกรด) แล้วค่อย receiveTransferPayment
 *    + creditType 3 (เงินสด) ไม่งั้นรับเงินไม่ได้ (ทดสอบ sandbox 7 ต.ค. 69)
 */
export function upgradeBody(o: Order, d: ReturnType<typeof draftFor>, kind: "bl" | "inv", salesName: string, sourceRecordId: number): Record<string, unknown> {
  const body = quotationBody(o, d, salesName);
  body.documentReference = [{ recordId: sourceRecordId, referenceDocumentSerial: d.source!.docNo, referenceDocumentType: d.source!.type }];
  body.reference = d.source!.docNo;
  if (kind === "inv") {
    body.creditType = 3;
    // 🧾 วันที่ใบกำกับภาษี/ใบเสร็จ = วันที่โอนเงิน ไม่ใช่วันที่กดสร้าง (เจ้าของร้านแจ้ง OD-261006-2644 · 8 ต.ค. 69)
    if (d.paymentDate) body.publishedOn = body.dueDate = d.paymentDate;
  }
  return body;
}

/** ยอดรับเงินสุทธิ (ยอดรวม − หัก ณ ที่จ่าย) */
export function netCollected(d: QuotationDraft): number {
  return r2(d.grandTotal - (d.wht?.amount ?? 0));
}

/* ── 🔄 อัปเดตใบเสนอราคาเดิมให้ตรงออเดอร์ (7 ต.ค. 69) ─────────────────────────────────────── */

/** ร่างอัปเดต QT — รายการ/ยอดล่าสุดของออเดอร์ (ไม่นับข้อห้าม "มีเอกสารหลักแล้ว" เพราะกำลังแก้ใบนั้นเอง) */
export function quotationUpdateDraft(o: Order): QuotationDraft & { source?: { docNo: string; type: number } } {
  const d = quotationDraft({ ...o, flowAccount: undefined, ...(o.taxInvoice ? { taxInvoice: { ...o.taxInvoice, docNo: undefined } } : {}) });
  const main = mainDocOf(o);
  const problems = d.problems.slice();
  if (!main) problems.unshift("ยังไม่มีใบเสนอราคาใน FlowAccount — ออกใบเสนอราคาก่อน");
  else if (main.docType !== "qt") problems.unshift(`เอกสารหลักเป็น ${main.docTypeLabel} ${main.docNo} — แก้ได้เฉพาะใบเสนอราคา`);
  if ((o.faChain ?? []).length || (o.faInvoices ?? []).length) problems.push("ออกใบแจ้งหนี้/ใบกำกับต่อจากใบเสนอราคาแล้ว — แก้ในแอป FlowAccount");
  if (o.deposit || o.flowAccount?.deposit) problems.push("ใบมัดจำ — แก้ในแอป FlowAccount");
  return { ...d, problems, ...(main ? { source: { docNo: main.docNo, type: REF_TYPE.qt } } : {}) };
}

/**
 * body ของ PUT /quotations/{id} — แบบ Simple (UpdateSimpleDocument) เหมือนตอนออกใบ: VAT 7% ท้ายบิล + ส่วนลดท้ายบิล
 * ⚠️ เดิมส่ง UpdateInlineDocument (useInlineVat) → ใบที่กด 🔄 มีคอลัมน์ "ภาษี 7%" ต่อรายการ (QT010841) เจ้าของร้านไม่เอา (9 ต.ค. 69)
 *    สเปก swagger developers.flowaccount.com/swagger.yml รองรับ UpdateSimpleDocument · ใบที่เป็น inline ไปแล้ว กด 🔄 อีกรอบ = กลับเป็นแบบ simple
 */
export function quotationUpdateBody(o: Order, d: QuotationDraft, salesName: string, recordId: number): Record<string, unknown> {
  return {
    ...quotationBody(o, d, salesName),
    documentStructureType: "UpdateSimpleDocument",
    recordId,
    useInlineVat: false,
    useInlineDiscount: false,
    documentShowWithholdingTax: !!d.wht,
    documentWithholdingTaxPercentage: d.wht?.rate ?? 0,
    documentWithholdingTaxAmount: d.wht?.amount ?? 0,
  };
}
