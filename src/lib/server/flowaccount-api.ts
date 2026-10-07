import "server-only";
import { getChatFirestore } from "@/lib/server/firebase-admin";

/**
 * 🔌 FlowAccount Open API (Client Credentials) — ดึงใบกำกับภาษีรายเดือนให้หน้า /admin/wht
 *
 * รหัส: env FLOWACCOUNT_CLIENT_ID · FLOWACCOUNT_CLIENT_SECRET · FLOWACCOUNT_API_BASE (ไม่ใส่ = production /v1 · sandbox = /test)
 *   ไม่มีใน env → อ่าน Firestore settings/flowaccount-api (ฐาน ordersure — ที่เดียวกับคุกกี้ OA Manager)
 *   ⚠️ เว็บจริงใช้ Firestore: env บน Netlify เต็มเพดาน Lambda 4KB แล้ว (3,982 bytes · 6 ต.ค. 69) ใส่รหัสเพิ่มไม่ได้
 *   เปลี่ยนรหัส = แก้ .env.local แล้วรัน node scripts/flowaccount-creds-save.mjs
 * token อายุ 24 ชม. → แคชในหน่วยความจำ (ฟังก์ชันเย็นแล้วขอใหม่ก็ไม่เป็นไร)
 * เพดาน 100 คำขอ/นาที (ประกาศ 8 ก.ค. 69) → 1 เดือน ~165 ใบ = 2 หน้า · เจอ 429 พักแล้วลองใหม่
 *
 * ⭐ จุดที่ไฟล์ Excel รายงานยอดขายไม่มี: payments.withheldAmount/withheldPercentage = ลูกค้าหัก ณ ที่จ่ายตอนรับชำระ
 *    (ทดสอบบัญชีจริง ก.ย. 69: หัก 69 · ไม่หัก 95 · ยกเลิก 1 — ยอดตรง 3% ของมูลค่าก่อน VAT ทุกใบ)
 */

/** ใบกำกับภาษี 1 ใบจาก FlowAccount (ทรงที่ importSalesRows ใช้) */
export interface SalesReportRow {
  docNo: string;
  date: string;
  company: string;
  taxId?: string;
  branch?: string;
  /** มูลค่าก่อน VAT (totalWithoutVat — ตรงคอลัมน์ "มูลค่า" ในรายงานยอดขาย 165/165 ใบ) */
  base: number;
  vat: number;
  total: number;
  refDoc?: string;
  refNo?: string;
  depositRef?: string;
  status?: string;
  /** recordId ของใบใน FlowAccount — ใช้ขอลิงก์แชร์เปิดดูเอกสาร */
  faId?: number;
  /** หัก ณ ที่จ่าย — sure = จากการรับชำระจริง (รู้แน่ว่าหัก/ไม่หัก) · sure false = ยังไม่รับชำระ แต่ตั้งหักไว้ในใบ */
  wht?: { amount: number; rate: number; sure: boolean };
}

interface Creds {
  clientId: string;
  clientSecret: string;
  base: string;
}

let credsCache: { at: number; creds: Creds | null } | null = null;

/** รหัส FlowAccount — env ก่อน (เครื่อง dev) แล้วค่อย Firestore (เว็บจริง) · แคช 5 นาที */
async function creds(): Promise<Creds | null> {
  const envId = process.env.FLOWACCOUNT_CLIENT_ID;
  const envSecret = process.env.FLOWACCOUNT_CLIENT_SECRET;
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret, base: process.env.FLOWACCOUNT_API_BASE || "https://openapi.flowaccount.com/v1" };
  if (credsCache && Date.now() - credsCache.at < 5 * 60_000) return credsCache.creds;
  let c: Creds | null = null;
  try {
    const snap = await getChatFirestore()?.collection("settings").doc("flowaccount-api").get();
    if (snap?.exists && snap.get("clientId") && snap.get("clientSecret"))
      c = { clientId: String(snap.get("clientId")), clientSecret: String(snap.get("clientSecret")), base: String(snap.get("base") || "https://openapi.flowaccount.com/v1") };
  } catch {
    c = credsCache?.creds ?? null;
  }
  credsCache = { at: Date.now(), creds: c };
  return c;
}

export async function flowAccountApiReady(): Promise<boolean> {
  return !!(await creds());
}

const baseOf = (c: Creds) => c.base.replace(/\/+$/, "");

let cached: { token: string; until: number; key: string } | null = null;

async function token(): Promise<{ token: string; base: string }> {
  const c = await creds();
  if (!c) throw new Error("ยังไม่ได้ใส่รหัส FlowAccount Open API");
  const base = baseOf(c);
  const key = `${base}|${c.clientId}|${c.clientSecret.slice(-6)}`;
  if (cached && cached.key === key && Date.now() < cached.until) return { token: cached.token, base };
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: "flowaccount-api", client_id: c.clientId, client_secret: c.clientSecret });
  const r = await fetch(`${base}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
  if (!r.ok || !j?.access_token) throw new Error(`ขอ token FlowAccount ไม่ผ่าน (${r.status}${j?.error ? ` · ${j.error}` : ""}) — เช็ครหัส`);
  cached = { token: j.access_token, until: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 300) * 1000, key };
  return { token: j.access_token, base };
}

async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const t = await token();
    const r = await fetch(`${t.base}${path}`, { headers: { Authorization: `Bearer ${t.token}` }, signal: AbortSignal.timeout(20_000) });
    if (r.status === 429 && attempt < 3) {
      await new Promise((ok) => setTimeout(ok, 2_000 * 2 ** attempt));
      continue;
    }
    if (r.status === 401 && attempt === 0) {
      cached = null; // token หมดอายุก่อนกำหนด → ขอใหม่ครั้งเดียว
      continue;
    }
    const j = (await r.json().catch(() => null)) as { status?: boolean; message?: string; data?: unknown } | null;
    if (!r.ok || j?.status === false) throw new Error(`FlowAccount ตอบ ${r.status}${j?.message ? ` · ${j.message}` : ""}`);
    return j?.data as T;
  }
}

interface FaTaxInvoice {
  recordId?: number | string;
  documentSerial: string;
  publishedOn: string;
  contactName?: string;
  contactTaxId?: string;
  contactBranch?: string;
  totalWithoutVat?: string | number;
  vatAmount?: string | number;
  grandTotal?: string | number;
  reference?: string;
  statusString?: string;
  documentWithholdingTaxAmount?: number | string;
  documentWithholdingTaxPercentage?: number | string;
  payments?: { withheldAmount?: string | number; withheldPercentage?: string | number; paymentDate?: string } | { withheldAmount?: string | number; withheldPercentage?: string | number }[] | null;
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return isFinite(n) ? n : 0;
};

/** สถานะใน FlowAccount → คำไทยแบบในแอป FlowAccount (หน้าเว็บ/กติกา "ยกเลิก" ใช้ชุดเดียวกัน) */
const STATUS_TH: Record<string, string> = {
  awaiting: "รอดำเนินการ",
  approved: "อนุมัติแล้ว",
  invoiceDelivered: "รอเก็บเงิน",
  paid: "เก็บเงินแล้ว",
  void: "ยกเลิก",
};

/** แถวจาก API → SalesReportRow + ข้อมูลหัก ณ ที่จ่ายจริงจากการรับชำระ */
function toRow(x: FaTaxInvoice): SalesReportRow {
  const pays = Array.isArray(x.payments) ? x.payments : x.payments ? [x.payments] : [];
  const payWht = pays.reduce((s, p) => s + num(p.withheldAmount), 0);
  const payPct = pays.map((p) => num(p.withheldPercentage)).find((n) => n > 0);
  const docWht = num(x.documentWithholdingTaxAmount);
  const paid = x.statusString === "paid";
  // รับชำระแล้ว = รู้แน่ (หัก/ไม่หัก) · ยังไม่รับชำระแต่ตั้งหักไว้ในใบ = น่าจะหัก · นอกนั้นไม่รู้
  const wht = paid ? { amount: payWht, rate: payPct ?? (payWht > 0 ? 3 : 0), sure: true } : docWht > 0 ? { amount: docWht, rate: num(x.documentWithholdingTaxPercentage) || 3, sure: false } : undefined;
  return {
    docNo: x.documentSerial.toUpperCase(),
    date: (x.publishedOn ?? "").slice(0, 10),
    company: (x.contactName ?? "").trim(),
    taxId: x.contactTaxId?.trim() || undefined,
    branch: x.contactBranch?.trim() || undefined,
    base: num(x.totalWithoutVat),
    vat: num(x.vatAmount),
    total: num(x.grandTotal),
    refDoc: x.reference?.trim() || undefined,
    status: STATUS_TH[x.statusString ?? ""] ?? x.statusString,
    faId: Number(x.recordId) || undefined,
    wht,
  };
}

/** ใบกำกับภาษีตั้งแต่ต้นเดือน fromMonth (YYYY-MM) ถึงล่าสุด — ไล่หน้าใหม่→เก่าจนเลยต้นเดือนนั้น (1 เดือน ~2 หน้า) */
export async function fetchTaxInvoicesSince(fromMonth: string): Promise<SalesReportRow[]> {
  const out: FaTaxInvoice[] = [];
  const sort = encodeURIComponent("[{'name':'publishedOn','sortOrder':'desc'}]");
  for (let page = 1; page <= 40; page++) {
    const d = await get<{ list?: FaTaxInvoice[]; totalDocument?: number }>(`/tax-invoices?currentPage=${page}&pageSize=100&sortBy=${sort}`);
    const list = d?.list ?? [];
    out.push(...list.filter((x) => (x.publishedOn ?? "").slice(0, 7) >= fromMonth));
    if (!list.length || list.some((x) => (x.publishedOn ?? "").slice(0, 7) < fromMonth)) break;
  }
  return out.map(toRow);
}

/** ใบกำกับภาษีทั้งเดือน (YYYY-MM) */
export async function fetchTaxInvoicesOfMonth(month: string): Promise<SalesReportRow[]> {
  const all = await fetchTaxInvoicesSince(month);
  return all.filter((r) => r.date.slice(0, 7) === month);
}

/** recordId ของใบจากเลข INV (กรณีใบเก่าที่ยังไม่ได้เก็บ faId) */
export async function findTaxInvoiceId(serial: string): Promise<number | null> {
  const filter = encodeURIComponent(JSON.stringify([{ columnName: "DocumentSerial", columnValue: serial, columnPredicateOperator: "And" }]).replace(/"/g, "'"));
  const d = await get<{ list?: FaTaxInvoice[] }>(`/tax-invoices?currentPage=1&pageSize=5&filter=${filter}`);
  const hit = (d?.list ?? []).find((x) => x.documentSerial === serial);
  return hit ? Number(hit.recordId) || null : null;
}

/** 🔗 ลิงก์แชร์ใบกำกับภาษี/ใบเสร็จรับเงิน (share.flowaccount.com/inv/…) — เปิดดูได้โดยไม่ต้องล็อกอิน FlowAccount */
export async function shareTaxInvoice(recordId: number): Promise<string> {
  const t = await token();
  const r = await fetch(`${t.base}/tax-invoices/sharedocument`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ documentId: recordId, culture: "th" }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => null)) as { status?: boolean; message?: string; data?: { link?: string } } | null;
  const link = j?.data?.link;
  if (!r.ok || !link || !/^https:\/\/share\.flowaccount\.com\//.test(link)) throw new Error(`ขอลิงก์เอกสารจาก FlowAccount ไม่ได้ (${r.status}${j?.message ? ` · ${j.message}` : ""})`);
  return link;
}

/**
 * ✏️ หน้าแก้ไขเอกสารในแอป FlowAccount — https://advance.flowaccount.com/N399315/business/<ชนิด>/<recordId>
 * รูปแบบจากเจ้าของร้าน 6 ต.ค. 69 (quotations/42848673 = QT010808) · ชนิดอื่นเดาตามชื่อ endpoint ของ Open API
 * ต้องล็อกอิน FlowAccount ในเบราว์เซอร์อยู่แล้ว (เราไม่ได้ล็อกอินแทน)
 */
export const FA_COMPANY_CODE = "N399315";
const DOC_KIND: { prefix: RegExp; api: string }[] = [
  { prefix: /^QT/i, api: "quotations" },
  { prefix: /^BL/i, api: "billing-notes" },
  { prefix: /^INV/i, api: "tax-invoices" },
  { prefix: /^RE/i, api: "receipts" },
  { prefix: /^CA/i, api: "cash-invoices" },
];

export function faKindOf(docNo: string): string | null {
  return DOC_KIND.find((k) => k.prefix.test(docNo))?.api ?? null;
}

export function faEditUrl(kind: string, recordId: number): string {
  return `https://advance.flowaccount.com/${FA_COMPANY_CODE}/business/${kind}/${recordId}`;
}

const idCache = new Map<string, number>();

/** recordId จากเลขเอกสาร (QT/BL/INV/RE/CA…) — จำไว้ในหน่วยความจำ (เลขภายในไม่เปลี่ยน) */
export async function findDocRecordId(docNo: string): Promise<{ kind: string; id: number } | null> {
  const kind = faKindOf(docNo);
  if (!kind) return null;
  const key = docNo.toUpperCase();
  const hit = idCache.get(key);
  if (hit) return { kind, id: hit };
  const filter = encodeURIComponent(JSON.stringify([{ columnName: "DocumentSerial", columnValue: key, columnPredicateOperator: "And" }]).replace(/"/g, "'"));
  const d = await get<{ list?: FaTaxInvoice[] }>(`/${kind}?currentPage=1&pageSize=5&filter=${filter}`);
  const row = (d?.list ?? []).find((x) => x.documentSerial?.toUpperCase() === key);
  const id = row ? Number(row.recordId) : 0;
  if (!id) return null;
  idCache.set(key, id);
  return { kind, id };
}

/**
 * ➕ สร้างเอกสาร — path: /quotations · /billing-notes · /tax-invoices/with-payment … (body = โครงที่ fa-create.ts สร้าง)
 * คืน recordId + เลขเอกสาร · ⚠️ เขียนลงบัญชี FlowAccount จริง — ผู้เรียกต้องกันกดซ้ำเอง
 */
export async function createDocument(path: string, body: Record<string, unknown>): Promise<{ recordId: number; docNo: string }> {
  const t = await token();
  const r = await fetch(`${t.base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json().catch(() => null)) as { status?: boolean; message?: string; data?: { recordId?: number | string; documentSerial?: string } } | null;
  const recordId = Number(j?.data?.recordId);
  if (!r.ok || j?.status === false || !recordId || !j?.data?.documentSerial)
    throw new Error(`FlowAccount ไม่รับเอกสาร (${r.status}${j?.message ? ` · ${j.message}` : ""})`);
  return { recordId, docNo: String(j.data.documentSerial) };
}

/**
 * 💵 บันทึกรับเงินโอนให้ใบกำกับภาษี/ใบเสร็จรับเงิน (POST /tax-invoices/{id}/payment) → สถานะ "เก็บเงินแล้ว"
 * ใบต้องเป็น creditType 3 (เงินสด) — creditType 1/5 FlowAccount ตอบ "credit type is unable to receive payment" (ทดสอบ sandbox 7 ต.ค. 69)
 * withheld… = ลูกค้าหัก ณ ที่จ่าย → หน้า ใบหัก FlowAcc รู้เองว่าหัก (payments.withheldAmount)
 */
export async function receiveTransferPayment(
  recordId: number,
  p: { date: string; collected: number; bankAccountId: number; whtRate?: number; whtAmount?: number; remarks?: string }
): Promise<void> {
  const t = await token();
  const r = await fetch(`${t.base}/tax-invoices/${recordId}/payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentStructureType: "PaymentReceivingTransfer",
      documentId: recordId,
      paymentMethod: 5,
      paymentDate: p.date,
      collected: p.collected,
      bankAccountId: p.bankAccountId,
      ...(p.whtAmount ? { withheldPercentage: p.whtRate ?? 3, withheldAmount: p.whtAmount } : {}),
      ...(p.remarks ? { paymentRemarks: p.remarks } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json().catch(() => null)) as { status?: boolean; message?: string } | null;
  if (!r.ok || j?.status === false) throw new Error(`บันทึกรับเงินไม่สำเร็จ (${r.status}${j?.message ? ` · ${j.message}` : ""})`);
}

/** 📄 อ่านเอกสาร 1 ใบ (GET /<kind>/<recordId>) — สถานะ + ยอด ไว้เทียบก่อนแก้ */
export async function getDocument(
  kind: string,
  recordId: number
): Promise<{
  status: string;
  docNo: string;
  grandTotal: number;
  vat: number;
  wht: number;
  publishedOn?: string;
  dueDate?: string;
  salesName?: string;
  reference?: string;
  items: { name: string; quantity: number; pricePerUnit: number; total: number }[];
} | null> {
  const d = await get<{ list?: Record<string, unknown>[] } & Record<string, unknown>>(`/${kind}/${recordId}`);
  const x = (d?.list?.[0] ?? d) as Record<string, unknown> | undefined;
  if (!x || !x.documentSerial) return null;
  const items = ((x.items as Record<string, unknown>[] | undefined) ?? []).map((i) => ({
    name: String(i.name ?? ""),
    quantity: Number(i.quantity) || 0,
    pricePerUnit: Number(i.pricePerUnit) || 0,
    total: Number(i.total) || 0,
  }));
  return {
    status: String(x.statusString ?? ""),
    docNo: String(x.documentSerial),
    grandTotal: Number(x.grandTotal) || 0,
    vat: Number(x.vatAmount) || 0,
    wht: Number(x.documentWithholdingTaxAmount) || 0,
    ...(x.publishedOn ? { publishedOn: String(x.publishedOn).slice(0, 10) } : {}),
    ...(x.dueDate ? { dueDate: String(x.dueDate).slice(0, 10) } : {}),
    ...(x.salesName ? { salesName: String(x.salesName) } : {}),
    ...(x.reference ? { reference: String(x.reference) } : {}),
    items,
  };
}

/**
 * ✏️ แก้เอกสาร (PUT /<kind>/<recordId>) — FlowAccount แก้ได้เฉพาะใบสถานะ "รออนุมัติ" (awaiting)
 * ⚠️ body ต้องเป็น UpdateInlineDocument (useInlineVat + useInlineDiscount = true) — ค่าอื่นตอบ "Invalid documentStructureType" (ทดสอบ sandbox 7 ต.ค. 69)
 */
export async function updateDocument(kind: string, recordId: number, body: Record<string, unknown>): Promise<void> {
  const t = await token();
  const r = await fetch(`${t.base}/${kind}/${recordId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json().catch(() => null)) as { status?: boolean; message?: string } | null;
  if (!r.ok || j?.status === false) throw new Error(`FlowAccount ไม่รับการแก้ไข (${r.status}${j?.message ? ` · ${j.message}` : ""})`);
}

/** 🏦 บัญชีธนาคารรับเงินของร้านใน FlowAccount (ตอนนี้มีบัญชีเดียว: กสิกร บจก.ทีพีดิจิตอล …753328) */
export async function bankAccounts(): Promise<{ id: number; number: string; name: string; bank: string }[]> {
  const d = await get<unknown>("/bank-accounts");
  const list = (Array.isArray(d) ? d : ((d as { list?: unknown[] })?.list ?? [])) as Record<string, unknown>[];
  return list
    .map((a) => ({ id: Number(a.bankAccountId), number: String(a.bankAccountNumber ?? ""), name: String(a.bankAccountName ?? ""), bank: String(a.bankName ?? "") }))
    .filter((a) => a.id > 0);
}

/** 🔗 ลิงก์แชร์เอกสาร (ชนิดตาม API เช่น quotations / tax-invoices) */
export async function shareDocument(kind: string, recordId: number): Promise<string> {
  const t = await token();
  const r = await fetch(`${t.base}/${kind}/sharedocument`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ documentId: recordId, culture: "th" }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => null)) as { data?: { link?: string }; message?: string } | null;
  const link = j?.data?.link;
  if (!r.ok || !link) throw new Error(`ขอลิงก์แชร์ไม่ได้ (${r.status}${j?.message ? ` · ${j.message}` : ""})`);
  return link;
}
