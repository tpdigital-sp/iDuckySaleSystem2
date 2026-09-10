/**
 * 📄 อ่านเอกสารจากลิงก์แชร์ FlowAccount (share.flowaccount.com/qt/th/xxxx)
 *
 * ทำไมต้องมี: ลูกค้าที่ขอใบกำกับภาษี ร้านออกใบเสนอราคา/ใบแจ้งหนี้ใน FlowAccount อยู่แล้ว
 * แต่ต้องมาคีย์ออเดอร์ซ้ำในระบบนี้อีกรอบ (ที่อยู่ + รายการ) เพื่อให้กราฟฟิกทำแบบ
 * → วางลิงก์แชร์ แล้วระบบดึงชื่อบริษัท/เลขผู้เสียภาษี/ที่อยู่/รายการ/ยอด มาสร้างออเดอร์ให้เอง
 *
 * วิธีทำงาน (ไม่ต้องมี API key ของ FlowAccount) — 2 ทาง:
 *   1) ท่าเดียวกับหน้าเว็บแชร์: POST csrf-token/share-document → ได้โทเคน+คุกกี้ → POST generate-pdf
 *      พร้อมหัว RequestVerificationToken → ได้ **JSON** โมเดลเอกสารทั้งใบ (pdfDynamoModel.originalString)
 *      ชื่อ/ที่อยู่/เลขผู้เสียภาษี/รายการ/ส่วนลด/VAT/หัก ณ ที่จ่าย/หมายเหตุ เป็นฟิลด์ตรง ๆ แม่นที่สุด
 *   2) สำรอง (ทาง 1 ล้ม): GET generate-pdf ได้ HTML ที่ฝัง PDF base64 → อ่านข้อความด้วย pdf.js ทีละแถว
 *      → แยกหัวเอกสาร / บล็อกลูกค้า / ตารางรายการ (ใช้ตำแหน่ง x ของหัวคอลัมน์) / ยอดรวม / หมายเหตุ
 *
 * ⚠️ ฟอนต์ในไฟล์ของ FlowAccount ส่ง "า" (สระอา) ออกมาเป็นตัวควบคุม U+0003 — ต้องแทนกลับก่อนใช้
 * ⚠️ เป็นการอ่านจากเลย์เอาต์ PDF ไม่ใช่ข้อมูลดิบ — เทมเพลตเอกสารเปลี่ยนมาก ๆ อาจอ่านไม่ครบ
 *    หน้าจอจึงให้แอดมินตรวจ/แก้ก่อนกดสร้างเสมอ
 */

export interface FlowAccountItem {
  /** ชื่อรายการ (บรรทัดแรกของช่องรายละเอียด) */
  name: string;
  /** บรรทัดถัด ๆ มาในช่องรายละเอียด (คั่นด้วยขึ้นบรรทัดใหม่) */
  detail: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface FlowAccountDoc {
  url: string;
  /** qt · bl · inv · re · ca · cn · dn (ตามตัวย่อในลิงก์) */
  docType: string;
  docTypeLabel: string;
  docNo: string;
  /** วันที่ตามเอกสาร เช่น 02/09/2026 */
  date?: string;
  customer: {
    name: string;
    /** "สำนักงานใหญ่" หรือ "สาขา 00002" */
    branch?: string;
    address: string;
    taxId?: string;
    phone?: string;
    /** ที่อยู่จัดส่งที่ระบุแยกในเอกสาร (มีเฉพาะทาง JSON) */
    shippingAddress?: string;
  };
  /** อ่านมาจากทางไหน — json = โมเดลเอกสาร (แม่น) · pdf = อ่านจากเลย์เอาต์ (สำรอง) */
  source?: "json" | "pdf";
  items: FlowAccountItem[];
  subtotal?: number;
  discount?: number;
  vatRate?: number;
  vat?: number;
  grandTotal?: number;
  whtRate?: number;
  wht?: number;
  /** ยอดชำระหลังหัก ณ ที่จ่าย */
  net?: number;
  note?: string;
  /** ชื่อชนิดเอกสารตามหัวใบจริง เช่น "ใบวางบิล/ใบแจ้งหนี้" (มีเฉพาะทาง JSON) */
  title?: string;
  /** ➗ ใบที่เกี่ยวกับมัดจำ — ใบแจ้งหนี้มัดจำ (ไม่มีรายการสินค้า) หรือใบยอดคงเหลือที่หักมัดจำแล้ว */
  deposit?: FlowAccountDeposit;
  /** รายการสินค้าดึงมาจากเอกสารอีกใบ (ใบมัดจำไม่มีรายการ → วางลิงก์ใบเสนอราคา/ใบยอดคงเหลือเพิ่ม) */
  itemsFrom?: { url: string; docNo: string; docTypeLabel: string };
  /** ข้อความทั้งหมดที่อ่านได้ (ไว้ดูตอนอ่านพลาด) */
  rawText: string;
}

/**
 * ➗ ข้อมูลมัดจำที่อ่านจากเอกสาร (เจ้าของร้านขอ 10 ก.ย. 69 — ใบแจ้งหนี้มัดจำ 50% อ่านไม่ได้)
 * FlowAccount ออกใบมัดจำเป็น 2 ใบ:
 *   1) ใบแจ้งหนี้มัดจำ (BL002072): รายการเดียว "รับมัดจำ · ใบเสนอราคาเลขที่ QT010613 มูลค่า 125,190 บาท" ยอด 58,500 + VAT
 *      → ไม่ใช่งานผลิต ต้องตัดออกจากรายการ และรู้มูลค่างานเต็มจากบรรทัดนั้น
 *   2) ใบยอดคงเหลือ (BL002073): รายการสินค้าเต็ม 117,000 แต่ท้ายใบ "หักเงินมัดจำ BL002072 58,500" (ก่อน VAT)
 *      แล้วคิด VAT จากส่วนที่เหลือ → รวมทั้งสิ้น 62,595 ไม่ใช่ยอดงานเต็ม
 * ออเดอร์ในระบบต้องเป็น "ยอดเต็ม" + โหมดมัดจำ (Order.deposit.amount = งวดแรกรวม VAT) ทั้งสองกรณี
 */
export interface FlowAccountDeposit {
  /** deposit = ใบแจ้งหนี้มัดจำ · balance = ใบยอดคงเหลือที่หักมัดจำแล้ว */
  kind: "deposit" | "balance";
  /** เลขเอกสารที่อ้างถึง — ใบมัดจำ: ใบเสนอราคาต้นทาง (QT…) · ใบยอดคงเหลือ: ใบมัดจำที่ถูกหัก (BL…) */
  refDocNo?: string;
  /** ยอดมัดจำก่อน VAT (บาท) */
  amountBeforeVat: number;
  /** ยอดมัดจำรวม VAT (บาท) = งวดแรกที่ลูกค้าต้องโอน (ก่อนหัก ณ ที่จ่าย) */
  amount: number;
  /** มูลค่างานเต็มทั้งใบ เท่าที่เอกสารบอก (ก่อน VAT / VAT / รวม VAT / หัก ณ ที่จ่ายทั้งใบ) */
  fullSubtotal?: number;
  fullVat?: number;
  fullGrandTotal?: number;
  fullWht?: number;
  /** ยอดคงเหลืองวดหลัง (รวม VAT) */
  remaining?: number;
}

type Parsed = Omit<FlowAccountDoc, "url" | "docType" | "docTypeLabel">;

/** ตัวย่อในลิงก์ → ชื่อชนิดเอกสารที่ doc-api ใช้ (ถอดจากบันเดิลของหน้าแชร์) */
const DOC_TYPES: Record<string, { api: string; label: string }> = {
  qt: { api: "quotation", label: "ใบเสนอราคา" },
  bl: { api: "billingnote", label: "ใบวางบิล" },
  inv: { api: "taxinvoice", label: "ใบแจ้งหนี้/ใบกำกับภาษี" },
  re: { api: "receipt", label: "ใบเสร็จรับเงิน" },
  ca: { api: "cashinvoice", label: "ใบกำกับภาษี (เงินสด)" },
  cn: { api: "creditnote", label: "ใบลดหนี้" },
  dn: { api: "debitnote", label: "ใบเพิ่มหนี้" },
};

const DOC_API = "https://doc-api-canary.flowaccount.com/api/";

export interface ShareRef {
  docType: string;
  culture: string;
  hash: string;
}

/** แยกส่วนจากลิงก์แชร์ — คืน null ถ้าไม่ใช่ลิงก์ FlowAccount */
export function parseFlowAccountUrl(input: string): ShareRef | null {
  const s = (input || "").trim();
  const m = s.match(/share\.flowaccount\.com\/([a-z]{2,3})\/([a-z]{2})\/([a-z0-9]+)/i);
  if (!m) return null;
  const docType = m[1].toLowerCase();
  if (!DOC_TYPES[docType]) return null;
  return { docType, culture: m[2].toLowerCase(), hash: m[3] };
}

export function flowAccountDocLabel(docType: string): string {
  return DOC_TYPES[docType]?.label ?? "เอกสาร FlowAccount";
}

/* ────────────────────────────── ทาง 1: JSON โมเดลเอกสาร ────────────────────────────── */

interface LV {
  label?: string | null;
  value?: unknown;
}
export interface ShareModel {
  header: Record<string, LV>;
  body: {
    productItem?: { value?: Record<string, unknown>[] };
    summary?: Record<string, LV>;
    remark?: LV;
    shippingAddress?: LV;
  };
}

const SHARE_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/plain, */*",
  origin: "https://share.flowaccount.com",
  referer: "https://share.flowaccount.com/",
};

/** ขอโทเคน CSRF แล้วยิง generate-pdf แบบเดียวกับหน้าเว็บ — คืน null ถ้าท่านี้ใช้ไม่ได้ (จะไปใช้ทาง PDF แทน) */
async function fetchShareModel(ref: ShareRef): Promise<{ model: ShareModel; serial?: string } | null> {
  try {
    const base = `${DOC_API}${DOC_TYPES[ref.docType].api}`;
    const r1 = await fetch(`${base}/csrf-token/share-document/${ref.culture}/${ref.hash}`, {
      method: "POST",
      cache: "no-store",
      headers: SHARE_HEADERS,
      body: "{}",
    });
    if (!r1.ok) return null;
    const j1 = (await r1.json().catch(() => null)) as { data?: string } | null;
    const token = j1?.data;
    if (!token) return null;
    const h1 = r1.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = h1.getSetCookie?.() ?? (r1.headers.get("set-cookie") ? [r1.headers.get("set-cookie")!] : []);
    const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
    const r2 = await fetch(`${base}/share/generate-pdf/${ref.culture}/${ref.hash}`, {
      method: "POST",
      cache: "no-store",
      headers: { ...SHARE_HEADERS, RequestVerificationToken: token, ...(cookie ? { cookie } : {}) },
      body: "{}",
    });
    const text = await r2.text();
    if (!r2.ok || !text.trim().startsWith("{")) return null;
    const j2 = JSON.parse(text) as { data?: { documentSerial?: string; pdfDynamoModel?: { originalString?: ShareModel } } };
    const model = j2.data?.pdfDynamoModel?.originalString;
    if (!model?.header || !model.body) return null;
    return { model, serial: j2.data?.documentSerial };
  } catch {
    return null;
  }
}

const money = (v: unknown): number | undefined => {
  const s = String(v ?? "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!s || !/\d/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
const str = (lv: LV | undefined): string => String(lv?.value ?? "").trim();

export function parseShareModel(m: ShareModel, serial?: string): Parsed {
  const h = m.header;
  const out: Parsed = {
    docNo: str(h.documentSerial) || serial || "",
    date: str(h.publishedOn) || undefined,
    customer: { name: "", address: "" },
    items: [],
    rawText: "",
    source: "json",
  };
  const title = str(h.title);
  if (title) out.title = title;

  // บล็อกลูกค้า: บรรทัดแรก = ชื่อ (+สาขาในวงเล็บ) · บรรทัดถัดไป = ที่อยู่ · บรรทัด "เลขประจำตัวผู้เสียภาษี …" = เลข 13 หลัก
  const lines = str(h.contact)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const addr: string[] = [];
  for (const [i, line] of lines.entries()) {
    if (i === 0) {
      setCustomerName(out, line);
      continue;
    }
    if (/^(เลขประจำตัวผู้เสียภาษี|Tax\s*ID)/i.test(line)) {
      const d = line.replace(/\D/g, "");
      if (d.length >= 10) out.customer.taxId = d;
      continue;
    }
    if (/^(โทร|เบอร์|Tel|Phone)/i.test(line)) {
      const d = line.replace(/\D/g, "");
      if (d.length >= 9) out.customer.phone = d;
      continue;
    }
    addr.push(line);
  }
  if (!out.customer.name) out.customer.name = str(h.contactName);
  out.customer.address = addr.join(" ").replace(/\s+/g, " ").trim() || str(h.contactAddress);
  const phone = str(h.contactNumber).replace(/\D/g, "");
  if (phone.length >= 9) out.customer.phone = phone;
  const ship = str(h.contactShippingAddress) || str(m.body.shippingAddress) || str(h.shippingAddress);
  if (ship) out.customer.shippingAddress = ship.replace(/\s+/g, " ").trim();

  const depHints: DepositHints = {};
  for (const it of m.body.productItem?.value ?? []) {
    const name = String(it.name ?? "").trim();
    if (!name) continue;
    // บรรทัด "รับมัดจำ" ทาง JSON บอกใบเสนอราคาที่อ้าง + มูลค่างานเต็มเป็นฟิลด์ตรง ๆ (แม่นกว่าอ่านจากข้อความ)
    if (DEPOSIT_LINE_RE.test(name)) {
      if (!depHints.refDocNo && typeof it.documentSerial === "string" && it.documentSerial.trim()) depHints.refDocNo = it.documentSerial.trim();
      const g = money(it.documentGrandTotal);
      if (g && g > 0) depHints.fullGrandTotal = g;
      const sub = money(it.documentTotalWithOutVat);
      if (sub && sub > 0) depHints.fullSubtotal = sub;
      const w = money(it.withHeldPerItemValue);
      if (w && w > 0 && !/ไม่หัก/.test(String(it.withHeldPerItem ?? ""))) depHints.fullWht = w;
    }
    const qty = money(it.quantity) ?? 1;
    const unitPrice = money(it.pricePerUnit) ?? 0;
    const lineDiscount = money(it.discountPerItemValue) ?? 0;
    out.items.push({
      name,
      detail: String(it.description ?? "")
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n"),
      qty,
      unitPrice: lineDiscount > 0 && qty ? Math.round(((qty * unitPrice - lineDiscount) / qty) * 100) / 100 : unitPrice,
      amount: money(it.total) ?? qty * unitPrice,
    });
  }

  const s = m.body.summary ?? {};
  const pos = (lv?: LV) => {
    const n = money(lv?.value);
    return n != null && n > 0 ? n : undefined;
  };
  out.subtotal = money(s.total?.value);
  out.discount = pos(s.discount);
  out.vat = pos(s.vatRateValue);
  if (out.vat != null) out.vatRate = pctIn(String(s.vatRateValue?.label ?? "")) ?? 7;
  out.grandTotal = money(s.grandTotal?.value);
  out.wht = pos(s.withHeldValue);
  if (out.wht != null) out.whtRate = pctIn(String(s.withHeldValue?.label ?? ""));
  out.net = money(s.paymentValue?.value) ?? (out.grandTotal != null ? out.grandTotal - (out.wht ?? 0) : undefined);
  const remark = str(m.body.remark);
  if (remark) out.note = remark;
  out.rawText = [str(h.contact), ...out.items.map((i) => `${i.name} ×${i.qty} @${i.unitPrice}\n${i.detail}`), remark].join("\n---\n");
  // ท้ายใบยอดคงเหลือ: "หักเงินมัดจำ BL002072" + "จำนวนเงินหลังหักมัดจำ"
  depHints.deducted = pos(s.depositAmount);
  depHints.deductedLabel = String(s.depositAmount?.label ?? "");
  depHints.afterDeposit = money(s.totalAfterDeposit?.value);
  finalizeDeposit(out, depHints);
  return out;
}

/* ────────────────────────────── ➗ มัดจำ ────────────────────────────── */

const round2 = (n: number) => Math.round(n * 100) / 100;
/** บรรทัดรายการที่เป็น "รับมัดจำ" — ไม่ใช่งานผลิต */
const DEPOSIT_LINE_RE = /^(รับ)?(เงิน)?มัดจำ|^deposit/i;
const DOC_NO_RE = /([A-Z]{1,6}\d{3,}[\w-]*)/;

interface DepositHints {
  /** ยอด "หักเงินมัดจำ" ท้ายใบ + ป้าย (มีเลขใบมัดจำ) + "จำนวนเงินหลังหักมัดจำ" */
  deducted?: number;
  deductedLabel?: string;
  afterDeposit?: number;
  /** จากฟิลด์โครงสร้างของบรรทัด "รับมัดจำ" (ทาง JSON): ใบเสนอราคาที่อ้าง + มูลค่างานเต็ม + หัก ณ ที่จ่ายทั้งใบ */
  refDocNo?: string;
  fullGrandTotal?: number;
  fullSubtotal?: number;
  fullWht?: number;
}

/**
 * ตัดสินว่าเอกสารเป็นใบมัดจำแบบไหน แล้วเติม out.deposit (ไม่ใช่ใบมัดจำ = ไม่ทำอะไร)
 * เรียกหลังอ่านรายการ/สรุปยอดครบแล้ว ทั้งทาง JSON และทาง PDF
 */
function finalizeDeposit(out: Parsed, hints: DepositHints) {
  const vatRate = out.vatRate ?? (out.vat ? 7 : 0);
  const vatMul = 1 + vatRate / 100;
  const whtOf = (base: number | undefined) => (base != null && out.whtRate ? round2((base * out.whtRate) / 100) : undefined);

  const depLines = out.items.filter((it) => DEPOSIT_LINE_RE.test(it.name));
  if (depLines.length) {
    // ใบแจ้งหนี้มัดจำ — "รับมัดจำ · ใบเสนอราคาเลขที่ QT010613 มูลค่า 125,190.00 บาท" ตัดออกจากรายการงาน
    out.items = out.items.filter((it) => !DEPOSIT_LINE_RE.test(it.name));
    const text = depLines.map((l) => `${l.name} ${l.detail}`).join(" ");
    const amountBeforeVat = round2(depLines.reduce((s, l) => s + l.amount, 0));
    // ใบที่มีแต่บรรทัดมัดจำ: ยอดรวมทั้งสิ้นของใบ = มัดจำรวม VAT พอดี (กันปัดเศษต่างจากเอกสาร)
    const amount = !out.items.length && out.grandTotal != null ? out.grandTotal : round2(amountBeforeVat * vatMul);
    const refDocNo =
      hints.refDocNo ||
      text.match(/(?:ใบเสนอราคา|ใบแจ้งหนี้|ใบวางบิล|เลขที่|quotation|invoice)\s*(?:เลขที่)?\s*#?\s*([A-Z]{1,6}\d{3,}[\w-]*)/i)?.[1];
    const fullGrandTotal = hints.fullGrandTotal ?? money(text.match(/มูลค่า\s*([\d,]+(?:\.\d+)?)/)?.[1]);
    const fullSubtotal = hints.fullSubtotal ?? (fullGrandTotal != null ? round2(fullGrandTotal / vatMul) : undefined);
    const fullVat = fullGrandTotal != null && fullSubtotal != null ? round2(fullGrandTotal - fullSubtotal) : undefined;
    out.deposit = {
      kind: "deposit",
      ...(refDocNo ? { refDocNo } : {}),
      amountBeforeVat,
      amount,
      ...(fullSubtotal != null ? { fullSubtotal } : {}),
      ...(fullVat != null ? { fullVat } : {}),
      ...(fullGrandTotal != null ? { fullGrandTotal } : {}),
      ...((hints.fullWht ?? whtOf(fullSubtotal)) != null ? { fullWht: hints.fullWht ?? whtOf(fullSubtotal) } : {}),
      ...(fullGrandTotal != null ? { remaining: round2(Math.max(0, fullGrandTotal - amount)) } : {}),
    };
    return;
  }

  if (hints.deducted && hints.deducted > 0) {
    // ใบยอดคงเหลือ — รายการสินค้าเต็ม แต่ท้ายใบหักมัดจำก่อนคิด VAT (VAT ในใบ = เฉพาะส่วนที่เหลือ)
    const itemsSum = round2(out.items.reduce((s, it) => s + it.amount, 0));
    const base = round2((out.subtotal ?? itemsSum) - (out.discount ?? 0));
    const beforeVat =
      hints.afterDeposit != null
        ? Math.abs(base - hints.deducted - hints.afterDeposit) < 0.01
        : out.vat == null || Math.abs(round2(((base - hints.deducted) * vatRate) / 100) - out.vat) < 0.01;
    const amountBeforeVat = beforeVat ? hints.deducted : round2(hints.deducted / vatMul);
    const amount = round2(amountBeforeVat * vatMul);
    const fullVat = vatRate ? round2((base * vatRate) / 100) : 0;
    const fullGrandTotal = round2(base + fullVat);
    const fullWht = whtOf(base);
    out.deposit = {
      kind: "balance",
      ...(hints.deductedLabel?.match(DOC_NO_RE)?.[1] ? { refDocNo: hints.deductedLabel.match(DOC_NO_RE)![1] } : {}),
      amountBeforeVat,
      amount,
      fullSubtotal: base,
      fullVat,
      fullGrandTotal,
      ...(fullWht != null ? { fullWht } : {}),
      remaining: out.grandTotal ?? round2(Math.max(0, fullGrandTotal - amount)),
    };
  }
}

/**
 * รวมเอกสารหลายใบเป็นใบเดียวไว้สร้างออเดอร์ — ใบมัดจำไม่มีรายการสินค้า ให้แอดมินวางลิงก์ใบเสนอราคา/ใบยอดคงเหลือเพิ่ม
 * ใบหลัก (flowAccount ของออเดอร์) = ใบมัดจำ (ลูกค้าชำระใบนี้ก่อน) · รายการ/ส่วนลด/มูลค่าเต็ม = จากใบที่มีรายการ
 */
export function mergeFlowAccountDocs(docs: FlowAccountDoc[]): FlowAccountDoc {
  const main = docs.find((d) => d.deposit?.kind === "deposit") ?? docs[0];
  const itemsDoc = docs.find((d) => d.items.length) ?? main;
  if (itemsDoc === main) return main;
  const dep = main.deposit;
  const full = itemsDoc.deposit; // ใบยอดคงเหลือรู้มูลค่าเต็มอยู่แล้ว · ใบเสนอราคา = ยอดเต็มของใบนั้นเอง
  const itemsDisc = itemsDoc.discount ?? 0;
  const fullSubtotal = dep?.fullSubtotal ?? full?.fullSubtotal ?? (itemsDoc.subtotal != null ? round2(itemsDoc.subtotal - itemsDisc) : undefined);
  const fullVat = dep?.fullVat ?? full?.fullVat ?? itemsDoc.vat;
  const fullGrandTotal = dep?.fullGrandTotal ?? full?.fullGrandTotal ?? itemsDoc.grandTotal;
  const fullWht = dep?.fullWht ?? full?.fullWht ?? itemsDoc.wht;
  const cust = Object.fromEntries(Object.entries(main.customer).filter(([, v]) => v)) as Partial<FlowAccountDoc["customer"]>;
  return {
    ...main,
    customer: { ...itemsDoc.customer, ...cust },
    items: itemsDoc.items,
    discount: dep?.kind === "deposit" ? itemsDoc.discount : main.discount,
    note: main.note || itemsDoc.note,
    itemsFrom: { url: itemsDoc.url, docNo: itemsDoc.docNo, docTypeLabel: itemsDoc.docTypeLabel },
    ...(dep
      ? {
          deposit: {
            ...dep,
            ...(fullSubtotal != null ? { fullSubtotal } : {}),
            ...(fullVat != null ? { fullVat } : {}),
            ...(fullGrandTotal != null ? { fullGrandTotal } : {}),
            ...(fullWht != null ? { fullWht } : {}),
            ...(fullGrandTotal != null ? { remaining: round2(Math.max(0, fullGrandTotal - dep.amount)) } : {}),
          },
        }
      : {}),
    rawText: `${main.rawText}\n=====\n${itemsDoc.rawText}`,
  };
}

/* ────────────────────────────── ทาง 2 (สำรอง): PDF ────────────────────────────── */

async function fetchSharePdf(ref: ShareRef): Promise<Buffer> {
  const url = `${DOC_API}${DOC_TYPES[ref.docType].api}/share/generate-pdf/${ref.culture}/${ref.hash}`;
  let res = await fetch(url, { cache: "no-store", headers: { accept: "text/html,*/*" } });
  // หน้าแชร์จริงยิงเป็น POST body ว่าง — ถ้า GET ไม่ผ่านลองท่าเดียวกับหน้าเว็บ
  if (!res.ok)
    res = await fetch(url, { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: "{}" });
  if (!res.ok) throw new Error(`FlowAccount ตอบ ${res.status} — ลิงก์อาจหมดอายุหรือถูกปิดแชร์`);
  const html = await res.text();
  const m = html.match(/data:application\/pdf;base64,([A-Za-z0-9+/=]+)/);
  if (!m) throw new Error("อ่านเอกสารจากลิงก์ไม่ได้ (ไม่พบไฟล์ PDF ในหน้าแชร์)");
  return Buffer.from(m[1], "base64");
}

/* ────────────────────────────── อ่านข้อความ ────────────────────────────── */

interface Tok {
  x: number;
  /** ความกว้างของโทเคน (pt) — ไว้ตัดสินว่าโทเคนถัดไปห่างพอเป็นช่องว่างจริงไหม */
  w: number;
  s: string;
}
export interface Row {
  page: number;
  y: number;
  toks: Tok[];
}

/**
 * สระอาหายเป็น U+0003 ในฟอนต์ของ FlowAccount · ตัวควบคุมอื่นทิ้ง
 * "ำ" (สระอำ) ฟอนต์แตกเป็น นิคหิต + สระอา → ได้ "ำ"+U+0003 (หรือ "ํ"+U+0003) ต้องยุบกลับเป็น "ำ" ก่อน
 */
function fixThai(s: string): string {
  return s
    .replace(/[ำ\u0e4d]\u0003/g, "ำ")
    .replace(/\u0003/g, "า")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

async function pdfRows(buf: Buffer): Promise<Row[]> {
  // legacy build ใช้ใน Node ได้โดยไม่ต้องมี canvas/worker (next.config ตั้ง serverExternalPackages ไว้แล้ว)
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;
  const rows: Row[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const byY: { y: number; toks: Tok[] }[] = [];
      for (const it of tc.items) {
        if (!("str" in it)) continue;
        const y = it.transform[5];
        const x = it.transform[4];
        let row = byY.find((r) => Math.abs(r.y - y) <= 2.5);
        if (!row) {
          row = { y, toks: [] };
          byY.push(row);
        }
        row.toks.push({ x, w: it.width, s: fixThai(it.str) });
      }
      byY.sort((a, b) => b.y - a.y); // บนลงล่าง
      for (const r of byY) {
        r.toks.sort((a, b) => a.x - b.x);
        rows.push({ page: p, y: r.y, toks: r.toks });
      }
    }
  } finally {
    void doc.destroy();
  }
  return rows;
}

/**
 * ต่อโทเคนเป็นข้อความ — เว้นวรรคเมื่อ "ระยะห่างจริง" ระหว่างโทเคนกว้างพอ (≥ 1.5pt · ช่องว่างจริงกว้าง ~2.5pt)
 * pdf ของ FlowAccount ใส่ช่องว่างปลอมไว้หน้าโทเคน (" เคลือบ" ทั้งที่ x ต่อจาก "ไม่" พอดี) ถ้าเชื่อตัวอักษรจะได้ "ไม่ เคลือบ"
 * จึงตัดช่องว่างในโทเคนทิ้ง แล้วดูจากตำแหน่ง x + ความกว้างอย่างเดียว
 */
function text(toks: Tok[]): string {
  let out = "";
  let end = -Infinity; // ขอบขวาของโทเคนที่มีตัวอักษรล่าสุด
  for (const t of toks) {
    const s = t.s.trim();
    if (!s) continue;
    if (out && t.x - end >= 1.5) out += " ";
    out += s;
    end = t.x + (t.w || 0);
  }
  return out.replace(/\s+/g, " ").trim();
}
/** ข้อความแบบไม่มีช่องว่างเลย — ไว้เทียบคีย์เวิร์ด (pdf ตัดคำไม่แน่นอน) */
const squash = (s: string) => s.replace(/\s+/g, "");
const NUM_RE = /^-?[\d,]*\d(?:\.\d+)?$/;
const toNum = (s: string) => Number(s.replace(/,/g, ""));
/** ตัวเลขตัวสุดท้ายในแถว (ยอดเงินอยู่ขวาสุดเสมอ) */
function lastNumber(toks: Tok[]): number | undefined {
  for (let i = toks.length - 1; i >= 0; i--) {
    const s = toks[i].s.trim();
    if (NUM_RE.test(s) && /\d/.test(s)) return toNum(s);
  }
  return undefined;
}
function pctIn(s: string): number | undefined {
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : undefined;
}

/* ────────────────────────────── แยกโครงเอกสาร ────────────────────────────── */

interface Cols {
  /** ขอบขวาของคอลัมน์ลำดับ (#) — โทเคนซ้ายกว่านี้ = เลขลำดับรายการ */
  idxEnd: number;
  qtyStart: number;
  priceStart: number;
  amountStart: number;
}

/**
 * แถวหัวตาราง: มี "จำนวน" + "ราคา"/"ยอด" — คืนขอบคอลัมน์
 * หัวคอลัมน์ของ FlowAccount จัดกึ่งกลาง แต่ตัวเลขชิดขวา → ใช้ "ตำแหน่งหัว − 25" เป็นขอบซ้ายของแต่ละคอลัมน์
 */
function tableHeader(toks: Tok[]): Cols | null {
  const joined = squash(text(toks));
  const hasTh = /จำนวน/.test(joined) && /(ราคา|ยอดรวม|จำนวนเงิน)/.test(joined) && /(รายละเอียด|รายการ)/.test(joined);
  const hasEn = /quantity|qty/i.test(joined) && /(unitprice|price)/i.test(joined) && /(description|item)/i.test(joined);
  if (!hasTh && !hasEn) return null;
  const find = (re: RegExp) => toks.find((t) => re.test(t.s.trim()))?.x;
  const idx = find(/^(#|ลำดับ|No\.?)$/i);
  const desc = find(/^(ราย|Desc|Item)/i);
  const qty = find(/^(จำนวน|Qty|Quantity)/i);
  const price = find(/^(ราคา|Unit|Price)/i);
  const amount = find(/^(ยอด|Amount|Total)/i);
  if (desc == null || qty == null || price == null || amount == null) return null;
  return { idxEnd: idx != null ? idx + 12 : desc - 100, qtyStart: qty - 25, priceStart: price - 25, amountStart: amount - 25 };
}

const TOTAL_KEYS =
  /^(รวมเป็นเงิน|ส่วนลด|ภาษีมูลค่าเพิ่ม|จำนวนเงินรวมทั้งสิ้น|รวมทั้งสิ้น|ยอดรวมทั้งสิ้น|หักภาษี|หักณ|หักเงินมัดจำ|หักมัดจำ|จำนวนเงินหลังหัก|ยอดชำระ|Subtotal|Discount|VAT|GrandTotal|Total|Withholding|NetAmount|Amountdue)/i;

/** ชื่อลูกค้า + แยก "(สำนักงานใหญ่)" / "(สาขา 00002)" ออกเป็น branch */
function setCustomerName(out: { customer: FlowAccountDoc["customer"] }, line: string) {
  let name = line.trim();
  const m = name.match(/\(\s*(สำนักงานใหญ่|Head\s*Office|สาขา\s*[\w\d]+|Branch\s*[\w\d]+)\s*\)\s*$/i);
  if (m) {
    out.customer.branch = m[1].replace(/\s+/g, " ").trim();
    name = name.slice(0, m.index).trim();
  }
  out.customer.name = name;
}

export function parseRows(rows: Row[]): Parsed {
  const raw = rows.map((r) => text(r.toks)).join("\n");
  const out: Parsed = {
    docNo: "",
    customer: { name: "", address: "" },
    items: [],
    rawText: raw,
  };
  const depHints: DepositHints = {};

  type Phase = "head" | "customer" | "items" | "totals" | "note" | "done";
  let phase: Phase = "head";
  let cols: Cols | null = null;
  let cur: { lines: string[]; qty?: number; unitPrice?: number; amount?: number } | null = null;
  const addrLines: string[] = [];
  const noteLines: string[] = [];

  const flushItem = () => {
    if (!cur) return;
    const [name, ...rest] = cur.lines;
    const qty = cur.qty ?? 1;
    const unitPrice = cur.unitPrice ?? (cur.amount != null && qty ? cur.amount / qty : 0);
    out.items.push({
      name: (name ?? "").trim(),
      detail: rest.map((l) => l.trim()).filter(Boolean).join("\n"),
      qty,
      unitPrice,
      amount: cur.amount ?? qty * unitPrice,
    });
    cur = null;
  };

  for (const r of rows) {
    const left = r.toks.filter((t) => t.x < 300);
    const right = r.toks.filter((t) => t.x >= 300);
    const full = text(r.toks);
    const fullSq = squash(full);
    const leftSq = squash(text(left));
    const rightTx = text(right);

    // หัวเอกสาร (คอลัมน์ขวา) — อ่านได้ทุกเฟส เผื่อหน้า 2 ซ้ำหัว
    if (!out.docNo) {
      const m =
        rightTx.match(/(?:เลขที่|No\.?)\s*:?\s*([A-Za-z]{1,6}[-\d/]+)/i) ||
        squash(rightTx).match(/(?:เลขที่|No\.?)([A-Za-z]{1,6}[-\d/]+)/i);
      if (m) out.docNo = m[1];
    }
    if (!out.date) {
      const m = rightTx.match(/(?:วันที่|Date)\s*:?\s*(\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{2,4})/i);
      if (m) out.date = m[1].replace(/\s+/g, "");
    }

    // หัวตาราง — เริ่ม (หรือเริ่มใหม่ในหน้าถัดไป) เฟสรายการ
    const hdr = tableHeader(r.toks);
    if (hdr && (phase === "head" || phase === "customer" || phase === "items")) {
      cols = hdr;
      if (phase !== "items") phase = "items";
      continue;
    }

    if (phase === "head") {
      if (/^(ลูกค้า|Customer|BillTo)/i.test(leftSq)) {
        phase = "customer";
        // บางเทมเพลตชื่อลูกค้าอยู่แถวเดียวกับหัว "ลูกค้า"
        const rest = text(left)
          .replace(/^(ลูกค้า|Customer|Bill\s*To)\s*:?\s*/i, "")
          .trim();
        if (rest) setCustomerName(out, rest);
      }
      continue;
    }

    if (phase === "customer") {
      const lt = text(left);
      if (!lt) continue;
      if (/^(เลขประจำตัวผู้เสียภาษี|TaxID)/i.test(leftSq)) {
        const d = lt.replace(/\D/g, "");
        if (d.length >= 10) out.customer.taxId = d;
        continue;
      }
      if (/^(โทร|เบอร์|Tel|Phone|Mobile)/i.test(leftSq)) {
        const d = lt.replace(/\D/g, "");
        if (d.length >= 9 && !out.customer.phone) out.customer.phone = d;
        continue;
      }
      if (/^(ผู้ติดต่อ|Contact|อีเมล|Email|Fax|โทรสาร)/i.test(leftSq)) continue;
      if (!out.customer.name) setCustomerName(out, lt);
      else addrLines.push(lt);
      continue;
    }

    if (phase === "items" && cols) {
      if (TOTAL_KEYS.test(fullSq) && right.length && lastNumber(r.toks) != null) {
        flushItem();
        phase = "totals";
        // ตกลงไปอ่านแถวนี้เป็นยอดรวมด้วย
      } else {
        const c = cols;
        const idxToks = r.toks.filter((t) => t.x < c.idxEnd && t.s.trim());
        const descToks = r.toks.filter((t) => t.x >= c.idxEnd && t.x < c.qtyStart);
        const qtyToks = r.toks.filter((t) => t.x >= c.qtyStart && t.x < c.priceStart);
        const priceToks = r.toks.filter((t) => t.x >= c.priceStart && t.x < c.amountStart);
        const amtToks = r.toks.filter((t) => t.x >= c.amountStart);
        const idxText = text(idxToks);
        const isNewItem = /^\d{1,3}\.?$/.test(idxText) || (lastNumber(amtToks) != null && !cur);
        if (isNewItem) {
          flushItem();
          cur = { lines: [] };
        }
        if (!cur) continue; // ข้อความก่อนรายการแรก (เช่น หัวข้อกลุ่ม)
        const d = text(descToks);
        if (d) cur.lines.push(d);
        const q = lastNumber(qtyToks);
        const p = lastNumber(priceToks);
        const a = lastNumber(amtToks);
        if (q != null && cur.qty == null) cur.qty = q;
        if (p != null && cur.unitPrice == null) cur.unitPrice = p;
        if (a != null && cur.amount == null) cur.amount = a;
        continue;
      }
    }

    if (phase === "totals") {
      const n = lastNumber(r.toks);
      if (/^(หมายเหตุ|Remark|Note)/i.test(leftSq)) {
        phase = "note";
        const rest = text(left)
          .replace(/^(หมายเหตุ|Remarks?|Notes?)\s*:?\s*/i, "")
          .trim();
        if (rest) noteLines.push(rest);
        continue;
      }
      if (n == null) continue;
      // ➗ ใบมัดจำ: "จำนวนเงินหลังหักมัดจำ" ต้องมาก่อน "หักเงินมัดจำ" (คำซ้อนกัน) · "ยอดชำระคงเหลือ" ซ้ำกับรวมทั้งสิ้น ข้ามไป
      if (/หลังหักมัดจำ/.test(fullSq)) {
        depHints.afterDeposit ??= n;
        continue;
      }
      if (/หักเงินมัดจำ|หักมัดจำ/.test(fullSq)) {
        depHints.deducted ??= n;
        depHints.deductedLabel ??= full;
        continue;
      }
      if (/คงเหลือ/.test(fullSq)) continue;
      if (/รวมเป็นเงิน|^Subtotal/i.test(fullSq)) out.subtotal ??= n;
      else if (/ส่วนลด|Discount/i.test(fullSq)) out.discount ??= n;
      else if (/ภาษีมูลค่าเพิ่ม|VAT/i.test(fullSq)) {
        out.vat ??= n;
        out.vatRate ??= pctIn(full);
      } else if (/รวมทั้งสิ้น|GrandTotal|^Total/i.test(fullSq)) out.grandTotal ??= n;
      else if (/หักภาษี|หักณ|Withholding|WHT/i.test(fullSq)) {
        out.wht ??= n;
        out.whtRate ??= pctIn(full);
      } else if (/ยอดชำระ|NetAmount|Amountdue|ยอดสุทธิ/i.test(fullSq)) out.net ??= n;
      continue;
    }

    if (phase === "note") {
      // ลงท้ายเอกสาร = ช่องเซ็น "ในนาม …" / "ผู้สั่งซื้อ" / "ผู้อนุมัติ"
      if (/^(ในนาม|ผู้สั่งซื้อ|ผู้อนุมัติ|ผู้รับ|Authorized|Customer|Approved)/i.test(leftSq) || r.y < 60) {
        phase = "done";
        continue;
      }
      const lt = text(left);
      if (lt) noteLines.push(lt);
      continue;
    }
  }
  flushItem();

  out.customer.address = addrLines.join(" ").replace(/\s+/g, " ").trim();
  if (noteLines.length) out.note = noteLines.join("\n");
  // ใบไม่มี VAT/หัก ณ ที่จ่าย → ยอดรวมทั้งสิ้น = ยอดชำระ
  if (out.grandTotal == null && out.subtotal != null) out.grandTotal = out.subtotal - (out.discount ?? 0) + (out.vat ?? 0);
  if (out.net == null && out.grandTotal != null) out.net = out.grandTotal - (out.wht ?? 0);
  finalizeDeposit(out, depHints);
  return out;
}

/** ดึง + อ่านเอกสารจากลิงก์แชร์ — โยน Error พร้อมข้อความภาษาไทยเมื่อไม่สำเร็จ */
export async function fetchFlowAccountDoc(url: string): Promise<FlowAccountDoc> {
  const ref = parseFlowAccountUrl(url);
  if (!ref) throw new Error("ไม่ใช่ลิงก์แชร์ของ FlowAccount (ต้องขึ้นต้นด้วย share.flowaccount.com/…)");
  // ทาง 1: JSON (แม่น) → ไม่ได้ค่อยอ่านจาก PDF
  let parsed: Parsed | null = null;
  const share = await fetchShareModel(ref);
  if (share) {
    const p = parseShareModel(share.model, share.serial);
    if (p.items.length || p.customer.name || p.deposit) parsed = p;
  }
  if (!parsed) {
    const pdf = await fetchSharePdf(ref);
    const rows = await pdfRows(pdf);
    parsed = { ...parseRows(rows), source: "pdf" };
  }
  if (!parsed.items.length && !parsed.customer.name && !parsed.deposit)
    throw new Error("อ่านเอกสารได้แต่ไม่พบรายการ/ชื่อลูกค้า — เทมเพลตอาจต่างจากที่ระบบรู้จัก");
  return {
    url: `https://share.flowaccount.com/${ref.docType}/${ref.culture}/${ref.hash}`,
    docType: ref.docType,
    // ชื่อตามหัวใบจริง ("ใบวางบิล/ใบแจ้งหนี้") ถ้าอ่านได้ — ตัวย่อในลิงก์ (bl) บอกแค่หมวด
    docTypeLabel: parsed.title || flowAccountDocLabel(ref.docType),
    ...parsed,
  };
}
