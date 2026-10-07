import "server-only";
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
import { orderBalance, whtCoversBalance } from "@/lib/admin-data";
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
 * 📄 เอกสารหลักของออเดอร์ — order.flowAccount (สร้างออเดอร์จากลิงก์ FlowAccount)
 * หรือ taxInvoice.docNo (วางลิงก์ QT/BL ในฟอร์ม "ใส่ข้อมูลใบกำกับภาษี" — OD-261006-2644 QT010830 · 7 ต.ค. 69)
 * ต้องดูทั้ง 2 ที่ ไม่งั้นปุ่มออกใบเสนอราคาขึ้นทั้งที่มี QT แล้ว = QT ซ้ำใน FlowAccount
 */
export function mainDocOf(o: Order): { docNo: string; docType: string; docTypeLabel: string; grandTotal?: number; docChanged?: unknown } | null {
  if (o.flowAccount) return o.flowAccount;
  const no = o.taxInvoice?.docNo?.trim();
  if (!no) return null;
  const docType = /^QT/i.test(no) ? "qt" : /^BL/i.test(no) ? "bl" : /^INV/i.test(no) ? "inv" : "";
  return { docNo: no, docType, docTypeLabel: o.taxInvoice?.docTypeLabel ?? "เอกสาร" };
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
  return lines.join("\n").slice(0, 2000);
}

export function quotationDraft(o: Order): QuotationDraft {
  const problems: string[] = [];
  const main0 = mainDocOf(o);
  if (main0) problems.push(`ออเดอร์นี้ผูกเอกสาร FlowAccount ${main0.docNo} แล้ว`);
  if (!o.taxInvoice?.company) problems.push("ยังไม่ได้ใส่ข้อมูลใบกำกับภาษี (ชื่อบริษัท/เลขผู้เสียภาษี/ที่อยู่) — กด 🧾 ใส่ข้อมูลใบกำกับภาษี ก่อน");
  if (!(orderVatAmount(o) > 0)) problems.push("ยังไม่ได้เปิด VAT 7% — กด “＋ เปิด VAT 7%” ในกล่องยอดเงินก่อน (ยอดออเดอร์จะเท่ากับยอดในใบ)");
  if (o.status === "ยกเลิก") problems.push("ออเดอร์ถูกยกเลิกแล้ว");

  const lines: FaLine[] = o.items.map((it) => ({
    name: (it.name || "สินค้า").slice(0, 250),
    description: itemDescription(it),
    quantity: it.qty,
    pricePerUnit: it.unitPrice,
    total: r2(it.qty * it.unitPrice),
  }));
  if ((o.shippingCost ?? 0) > 0) lines.push({ name: "ค่าส่ง", description: "", quantity: 1, pricePerUnit: o.shippingCost!, total: r2(o.shippingCost!) });
  for (const c of o.charges ?? []) {
    const amt = Math.max(0, Number(c.amount) || 0);
    if (amt > 0) lines.push({ name: (c.label || "ค่าบริการเพิ่ม").slice(0, 250), description: "", quantity: 1, pricePerUnit: amt, total: r2(amt) });
  }
  const subTotal = r2(lines.reduce((s, l) => s + l.total, 0));
  const discount = r2(orderDiscountTotal(o));
  const afterDiscount = r2(subTotal - discount);
  const vat = r2(afterDiscount * 0.07);
  const grandTotal = r2(afterDiscount + vat);

  // ใบต้องเท่ายอดออเดอร์ทุกบาท — ไม่ตรง = มีอะไรที่ใบยังไม่รู้จัก ห้ามออก
  const expectBase = r2(orderSubtotal(o) + (o.shippingCost ?? 0) + orderChargesTotal(o) - orderDiscountTotal(o));
  if (Math.abs(expectBase - afterDiscount) > 0.01) problems.push(`ยอดก่อน VAT ไม่ตรงออเดอร์ (ใบ ${afterDiscount} · ออเดอร์ ${expectBase})`);
  if (orderVatAmount(o) > 0 && Math.abs(orderVatAmount(o) - vat) > 0.05)
    problems.push(`VAT ในออเดอร์ (${orderVatAmount(o)}) ไม่ใช่ 7% ของยอดก่อน VAT (${vat}) — แก้ VAT ในออเดอร์ก่อน`);
  if (orderVatAmount(o) > 0 && Math.abs(orderTotal(o) - grandTotal) > 0.05) problems.push(`ยอดรวมไม่ตรงออเดอร์ (ใบ ${grandTotal} · ออเดอร์ ${orderTotal(o)})`);

  const whtAmt = orderWhtAmount(o);
  const t = o.taxInvoice;
  return {
    lines,
    subTotal,
    discount,
    afterDiscount,
    vat,
    grandTotal,
    ...(whtAmt > 0 ? { wht: { rate: o.wht?.rate ?? 3, amount: whtAmt } } : {}),
    contact: {
      name: (t?.company ?? o.customer ?? "").trim(),
      taxId: t?.taxId?.replace(/\D/g, "") || undefined,
      branch: t?.branch || undefined,
      address: t?.address || o.address || undefined,
      person: o.customer || undefined,
      phone: o.phone || undefined,
      email: o.email || undefined,
    },
    problems,
  };
}

/** ร่าง → body ของ POST /quotations (Simple document · ภาษีแยกท้ายบิล) */
export function quotationBody(o: Order, d: QuotationDraft, salesName: string): Record<string, unknown> {
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
    salesName: salesName.slice(0, 100) || "พนักงาน",
    reference: o.id,
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

/** วันที่รับเงิน (YYYY-MM-DD เวลาไทย) — เวลาโอนบนสลิปใบล่าสุด · ไม่มี = เวลาแนบ · ไม่มีเลย = วันนี้ */
export function paymentDateOf(o: Order): string {
  const times = [...(o.payments ?? []).map((p) => p.verify?.transAt || p.at), o.slipVerify?.transAt].filter((x): x is string => !!x).sort();
  const at = times.at(-1);
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
 * body ของใบแจ้งหนี้ / ใบกำกับภาษี — อ้างอิงเอกสารต้นทาง (documentReference = อัปเกรด: ต้นทางกลายเป็น "ดำเนินการแล้ว")
 * ⚠️ ใบกำกับต้องสร้างผ่าน POST /tax-invoices (ไม่ใช่ /with-payment — ตัวนั้นไม่ผูกอัปเกรด) แล้วค่อย receiveTransferPayment
 *    + creditType 3 (เงินสด) ไม่งั้นรับเงินไม่ได้ (ทดสอบ sandbox 7 ต.ค. 69)
 */
export function upgradeBody(o: Order, d: ReturnType<typeof draftFor>, kind: "bl" | "inv", salesName: string, sourceRecordId: number): Record<string, unknown> {
  const body = quotationBody(o, d, salesName);
  body.documentReference = [{ recordId: sourceRecordId, referenceDocumentSerial: d.source!.docNo, referenceDocumentType: d.source!.type }];
  body.reference = d.source!.docNo;
  if (kind === "inv") body.creditType = 3;
  return body;
}

/** ยอดรับเงินสุทธิ (ยอดรวม − หัก ณ ที่จ่าย) */
export function netCollected(d: QuotationDraft): number {
  return r2(d.grandTotal - (d.wht?.amount ?? 0));
}
