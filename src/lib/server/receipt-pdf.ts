/**
 * 🧾 ใบเสร็จ (ใบรับเงิน) เป็นไฟล์ PDF จริง — ตัวที่ลูกค้ากด "บันทึก PDF" แล้วได้ไฟล์
 *
 * ทำไมต้องมี: ปุ่มเดิมสั่ง window.print() ซึ่ง "เบราว์เซอร์ในแอป" (LINE/Facebook/IG)
 * ทั้ง iPhone และ Android ไม่รองรับ — กดแล้วเงียบ ไม่มีอะไรเกิดขึ้น ลูกค้าเลยเซฟใบเสร็จไม่ได้
 * (พนักงานแจ้ง 24 ก.ย. 69) · ลูกค้าเกือบทั้งหมดเปิดลิงก์ออเดอร์จากแชท LINE = เจอปัญหานี้หมด
 *
 * เนื้อหาต้องตรงกับหน้า /order/[id]/receipt เป๊ะ ๆ — ตัวเลขทุกตัวเรียกฟังก์ชันชุดเดียวกัน
 * (orderTotal/orderVatAmount/…) และรายละเอียดตัวเลือกใช้ท่าเดียวกับ <SpecLines>
 */

import { PDFDocument, PDFPage, rgb, type RGB } from "pdf-lib";
import {
  adminDiscountAmount,
  orderEarlyPayAmount,
  orderItemDiscounts,
  orderNetTransfer,
  orderTotal,
  orderVatAmount,
  orderWhtAmount,
  type Order,
} from "@/lib/admin-data";
import { formatPrice, type Product } from "@/lib/products";
import { resolveShipLabel } from "@/lib/ship-label";
import { itemQtyText } from "@/lib/item-yield";
import { foldSizeExtra, specEntries, specLabel, specValueLines, stripSpecUrls, tidySpec, withWorkSize } from "@/components/SpecLines";
import type { ShippingMethod, ShopInfo } from "@/lib/settings-shared";
import { drawThai, embedThaiFonts, thaiWidth, wrapThai, type ThaiFont, type ThaiFonts } from "./pdf-thai";

/* กระดาษ A4 + ขอบ (หน่วยเป็นจุด 1/72 นิ้ว) */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const LEFT = 42;
const RIGHT = PAGE_W - 42;
const TOP = PAGE_H - 46;
const BOTTOM = 56;

/* คอลัมน์ตารางรายการ */
const COL_NAME_W = 296;
const SPEC_INDENT = 10;
const COL_QTY_MID = 372;
const COL_QTY_W = 64;
const COL_PRICE_R = 470;
const COL_TOTAL_R = RIGHT;

/* สี — โทนเดียวกับหน้าใบเสร็จบนเว็บ */
const INK = rgb(0.17, 0.16, 0.15);
const SOFT = rgb(0.47, 0.45, 0.43);
const FAINT = rgb(0.64, 0.62, 0.6);
const RULE = rgb(0.85, 0.84, 0.83);
const HEAD = rgb(0.27, 0.1, 0.02);
const SAVE = rgb(0.02, 0.55, 0.38);

interface Ctx {
  doc: PDFDocument;
  f: ThaiFonts;
  page: PDFPage;
  y: number;
  pages: PDFPage[];
}

function addPage(c: Ctx): void {
  c.page = c.doc.addPage([PAGE_W, PAGE_H]);
  c.pages.push(c.page);
  c.y = TOP;
}

function line(c: Ctx, y: number, color: RGB = RULE): void {
  c.page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.7, color });
}

interface TextOpts {
  font?: ThaiFont;
  size?: number;
  color?: RGB;
  align?: "left" | "right" | "center";
}

/** วาดข้อความ 1 บรรทัดที่ตำแหน่ง x (y เดินลงตามบรรทัดเอง) */
function text(c: Ctx, s: string, x: number, o: TextOpts = {}): void {
  drawThai(c.page, s, {
    font: o.font ?? c.f.reg,
    size: o.size ?? 9,
    x,
    y: c.y,
    color: o.color ?? INK,
    align: o.align,
  });
}

/* ── รายละเอียดตัวเลือกของรายการ — ท่าเดียวกับ <SpecLines stripLinks> ────────── */
interface SpecLine {
  t: string;
  /** ค่าหลายลาย (ลายที่ 1 … ลายที่ 20) ย่อหน้าเข้าไปเหมือนบนเว็บ */
  indent?: boolean;
}

function specLines(item: Order["items"][number], product?: Product): SpecLine[] {
  const entries = withWorkSize(
    foldSizeExtra(
      tidySpec(specEntries(item.sel, item.selections))
        .map(([k, v]) => [k, stripSpecUrls(v)] as [string, string])
        .filter(([, v]) => v),
    ),
    product?.workSize,
  );
  const out: SpecLine[] = [];
  for (const [k, v] of entries) {
    const parts = specValueLines(v);
    if (parts.length > 1) {
      out.push({ t: `${specLabel(k)}:` });
      for (const p of parts) out.push({ t: p, indent: true });
    } else {
      out.push({ t: k ? `${specLabel(k)}: ${parts[0] ?? v}` : (parts[0] ?? v) });
    }
  }
  return out;
}

/* ── หัวเอกสาร ───────────────────────────────────────────────────────────────── */
function drawDocHead(c: Ctx, order: Order, shop: ShopInfo): void {
  const top = c.y;
  // ซ้าย: ร้าน
  text(c, shop.name, LEFT, { font: c.f.bold, size: 13, color: HEAD });
  c.y -= 14;
  for (const s of [shop.legalName, ...wrapThai(c.f.reg, shop.address.replace(/\n+/g, " "), 7.5, COL_NAME_W), `โทร. ${shop.phone}`, shop.taxId ? `เลขผู้เสียภาษี ${shop.taxId}` : ""]) {
    if (!s) continue;
    text(c, s, LEFT, { size: 7.5, color: SOFT });
    c.y -= 10;
  }
  // ขวา: ชื่อเอกสาร + เลขออเดอร์
  let ry = top;
  const right = (s: string, o: TextOpts) => {
    drawThai(c.page, s, { font: o.font ?? c.f.reg, size: o.size ?? 8, x: RIGHT, y: ry, color: o.color ?? INK, align: "right" });
  };
  right("ใบรับเงิน", { font: c.f.bold, size: 12, color: INK });
  ry -= 15;
  right(order.id, { size: 9, color: SOFT });
  ry -= 11;
  right(order.date, { size: 8, color: FAINT });

  c.y = Math.min(c.y, ry - 12);
  line(c, c.y + 6);
  c.y -= 8;
}

/** หัวหน้าถัดไป (หน้า 2 เป็นต้นไป) — สั้น ๆ พอให้รู้ว่าเป็นใบเดียวกัน */
function drawContHead(c: Ctx, order: Order, shop: ShopInfo): void {
  text(c, `${shop.name} · ใบรับเงิน ${order.id}`, LEFT, { size: 8.5, color: SOFT });
  text(c, "(ต่อ)", RIGHT, { size: 8.5, color: FAINT, align: "right" });
  c.y -= 10;
  line(c, c.y + 4);
  c.y -= 10;
}

function drawCustomer(c: Ctx, order: Order): void {
  text(c, "ลูกค้า", LEFT, { size: 7, color: FAINT });
  c.y -= 12;
  text(c, order.customer || "—", LEFT, { font: c.f.bold, size: 10 });
  c.y -= 11;
  if (order.phone) {
    text(c, order.phone, LEFT, { size: 8, color: SOFT });
    c.y -= 10;
  }
  for (const s of wrapThai(c.f.reg, order.address ?? "", 8, RIGHT - LEFT)) {
    if (!s) continue;
    text(c, s, LEFT, { size: 8, color: SOFT });
    c.y -= 10;
  }
  c.y -= 4;
  line(c, c.y + 6, rgb(0.93, 0.92, 0.91));
  c.y -= 8;
}

function drawTableHead(c: Ctx): void {
  text(c, "รายการ", LEFT, { size: 7.5, color: FAINT });
  text(c, "จำนวน", COL_QTY_MID, { size: 7.5, color: FAINT, align: "center" });
  text(c, "ราคา", COL_PRICE_R, { size: 7.5, color: FAINT, align: "right" });
  text(c, "รวม", COL_TOTAL_R, { size: 7.5, color: FAINT, align: "right" });
  c.y -= 6;
  line(c, c.y);
  c.y -= 12;
}

/* ── ตารางรายการ ─────────────────────────────────────────────────────────────── */
function drawItems(c: Ctx, order: Order, productById: Record<string, Product>, onNewPage: () => void): void {
  drawTableHead(c);
  for (const it of order.items) {
    const product = productById[it.productId ?? ""];
    const nameLines = wrapThai(c.f.bold, it.name, 9.5, COL_NAME_W);
    const specs = specLines(it, product).flatMap((s) =>
      wrapThai(c.f.reg, s.t, 7.5, COL_NAME_W - (s.indent ? SPEC_INDENT : 0)).map((t) => ({ t, indent: s.indent })),
    );
    const qtyLines = wrapThai(c.f.reg, itemQtyText(it, product), 8, COL_QTY_W);
    const height = Math.max(nameLines.length * 12 + specs.length * 9.5, qtyLines.length * 10) + 9;

    // แถวไหนยาวเกินหน้า ขึ้นหน้าใหม่ทั้งแถว (ไม่ฉีกชื่อกับราคาคนละหน้า)
    if (c.y - height < BOTTOM) {
      addPage(c);
      onNewPage();
      drawTableHead(c);
    }

    const rowTop = c.y;
    for (const s of nameLines) {
      text(c, s, LEFT, { font: c.f.bold, size: 9.5 });
      c.y -= 12;
    }
    for (const s of specs) {
      text(c, s.t, LEFT + (s.indent ? SPEC_INDENT : 0), { size: 7.5, color: FAINT });
      c.y -= 9.5;
    }

    let qy = rowTop;
    for (const s of qtyLines) {
      drawThai(c.page, s, { font: c.f.reg, size: 8, x: COL_QTY_MID, y: qy, color: INK, align: "center" });
      qy -= 10;
    }
    drawThai(c.page, formatPrice(it.unitPrice), { font: c.f.reg, size: 9, x: COL_PRICE_R, y: rowTop, color: INK, align: "right" });
    drawThai(c.page, formatPrice(it.qty * it.unitPrice), { font: c.f.bold, size: 9, x: COL_TOTAL_R, y: rowTop, color: INK, align: "right" });

    c.y = Math.min(c.y, qy) - 3;
    line(c, c.y + 6, rgb(0.93, 0.92, 0.91));
    c.y -= 9;
  }
}

/* ── สรุปยอด ─────────────────────────────────────────────────────────────────── */
interface SumRow {
  label: string;
  value: string;
  color?: RGB;
  bold?: boolean;
  size?: number;
  rule?: boolean;
}

function summaryRows(order: Order, shipMethods: ShippingMethod[]): SumRow[] {
  const rows: SumRow[] = [];
  const subtotal = order.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  rows.push({ label: "รวมสินค้า", value: formatPrice(subtotal), color: SOFT });
  rows.push({
    label: `ค่าจัดส่ง (${resolveShipLabel(order, shipMethods)})`,
    value: order.shippingCost === 0 ? "ฟรี" : formatPrice(order.shippingCost),
    color: SOFT,
  });
  if (order.discount && order.discount.amount > 0)
    rows.push({ label: order.discount.label, value: `−${formatPrice(order.discount.amount)}`, color: SAVE, bold: true });
  if (orderEarlyPayAmount(order) > 0)
    rows.push({ label: order.earlyPay!.label, value: `−${formatPrice(orderEarlyPayAmount(order))}`, color: SAVE, bold: true });
  if (orderItemDiscounts(order) > 0)
    rows.push({ label: "ส่วนลดรายการสินค้า", value: `−${formatPrice(orderItemDiscounts(order))}`, color: SAVE, bold: true });
  if (adminDiscountAmount(order) > 0)
    rows.push({
      label: `${order.adminDiscount?.label?.trim() || "ส่วนลดพิเศษจากร้าน"}${(order.adminDiscount?.pct ?? 0) > 0 ? ` (${order.adminDiscount!.pct}%)` : ""}`,
      value: `−${formatPrice(adminDiscountAmount(order))}`,
      color: SAVE,
      bold: true,
    });
  if (orderVatAmount(order) > 0)
    rows.push({ label: `ภาษีมูลค่าเพิ่ม ${order.vat!.rate}%`, value: formatPrice(orderVatAmount(order)) });
  for (const ch of order.charges ?? []) rows.push({ label: ch.label, value: formatPrice(ch.amount), color: SOFT });
  rows.push({ label: "ยอดรวมทั้งสิ้น", value: formatPrice(orderTotal(order)), color: HEAD, bold: true, size: 11.5, rule: true });
  if (orderWhtAmount(order) > 0) {
    rows.push({ label: `หักภาษี ณ ที่จ่าย ${order.wht!.rate}%`, value: `−${formatPrice(orderWhtAmount(order))}`, color: SOFT });
    rows.push({ label: "ยอดชำระ", value: formatPrice(orderNetTransfer(order)), color: HEAD, bold: true, size: 10.5 });
  }
  if ((order.paidTotal ?? 0) > 0)
    rows.push({ label: "ชำระแล้ว", value: formatPrice(order.paidTotal ?? 0), color: SAVE, size: 8.5 });
  return rows;
}

function drawSummary(c: Ctx, rows: SumRow[], onNewPage: () => void): void {
  const height = rows.reduce((s, r) => s + (r.rule ? 8 : 0) + (r.size ?? 9) + 5, 0) + 10;
  if (c.y - height < BOTTOM) {
    addPage(c);
    onNewPage();
  }
  for (const r of rows) {
    if (r.rule) {
      c.y -= 4;
      line(c, c.y + 6);
      c.y -= 5;
    }
    const size = r.size ?? 9;
    const font = r.bold ? c.f.bold : c.f.reg;
    // ป้ายซ้ายยาวเกินก็ให้ตัดท้าย ไม่ให้ทับตัวเลข
    const maxLabel = RIGHT - LEFT - 110;
    let label = r.label;
    while (label.length > 4 && thaiWidth(font, label, size) > maxLabel) label = `${label.slice(0, -2)}…`;
    text(c, label, LEFT + 110, { font, size, color: r.color ?? INK });
    text(c, r.value, RIGHT, { font, size, color: r.color ?? INK, align: "right" });
    c.y -= size + 5;
  }
}

/* ── ท้ายหน้า ────────────────────────────────────────────────────────────────── */
function drawFooters(c: Ctx, shop: ShopInfo): void {
  const n = c.pages.length;
  c.pages.forEach((p, i) => {
    if (i === n - 1)
      drawThai(p, `เอกสารนี้ออกโดยระบบอัตโนมัติ · ขอบคุณที่อุดหนุน ${shop.name}`, {
        font: c.f.reg,
        size: 7.5,
        x: PAGE_W / 2,
        y: BOTTOM - 22,
        color: FAINT,
        align: "center",
      });
    if (n > 1)
      drawThai(p, `หน้า ${i + 1}/${n}`, { font: c.f.reg, size: 7.5, x: RIGHT, y: BOTTOM - 22, color: FAINT, align: "right" });
  });
}

export interface ReceiptPdfInput {
  order: Order;
  shop: ShopInfo;
  shipMethods: ShippingMethod[];
  productById?: Record<string, Product>;
}

/** สร้างไฟล์ PDF ใบเสร็จ 1 ใบ */
export async function buildReceiptPdf({ order, shop, shipMethods, productById = {} }: ReceiptPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const f = await embedThaiFonts(doc);
  doc.setTitle(`ใบรับเงิน ${order.id}`);
  doc.setSubject(`ใบรับเงิน/ใบเสร็จ ${order.id} — ${shop.name}`);
  doc.setAuthor(shop.legalName || shop.name);
  doc.setProducer(shop.name);
  doc.setCreationDate(new Date());

  const c: Ctx = { doc, f, page: null as unknown as PDFPage, y: TOP, pages: [] };
  addPage(c);
  drawDocHead(c, order, shop);
  drawCustomer(c, order);
  const contHead = () => drawContHead(c, order, shop);
  drawItems(c, order, productById, contHead);
  c.y -= 4;
  drawSummary(c, summaryRows(order, shipMethods), contHead);
  drawFooters(c, shop);
  return doc.save();
}

/** ชื่อไฟล์ที่ลูกค้าจะเห็นตอนเซฟ */
export function receiptFileName(order: Order): string {
  return `receipt-${order.id}.pdf`;
}
