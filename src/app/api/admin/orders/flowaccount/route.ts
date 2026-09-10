import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { bkkYmd, thaiDateTime } from "@/lib/bangkok-time";
import { autoShipDate } from "@/lib/ship-date";
import { requirePerm } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { fetchFlowAccountDoc, mergeFlowAccountDocs, parseFlowAccountUrl, type FlowAccountDoc } from "@/lib/server/flowaccount";
import { reportPaidToTP } from "@/lib/server/tp-report";
import { bumpSoldForOrder } from "@/lib/server/sold";
import { cutStockForOrder } from "@/lib/server/stock";
import { awardPointsForOrder } from "@/lib/server/contact-points";
import { orderTotal, withLog, type Order, type OrderItem } from "@/lib/admin-data";
import { normalizeShipLabel } from "@/lib/ship-label";
import type { Contact } from "@/lib/contacts";

export const runtime = "nodejs";

/**
 * 📄 สร้างออเดอร์จากลิงก์แชร์ FlowAccount
 *
 * POST { url, itemsUrl? }       → อ่านเอกสาร + หาผู้ติดต่อ/ออเดอร์ซ้ำ/วิธีส่ง ให้แอดมินตรวจก่อน (ยังไม่สร้างอะไร)
 *                                 ➗ ใบแจ้งหนี้มัดจำไม่มีรายการสินค้า → itemsUrl = ลิงก์ใบเสนอราคา/ใบยอดคงเหลือ (หรือวาง 2 ลิงก์ใน url เลย) ระบบรวมให้
 * PUT  { ...ข้อมูลที่ตรวจแล้ว }  → สร้างออเดอร์จริง (deposit มีค่า = เปิดโหมดมัดจำ · สถานะ "ชำระแล้ว" = รับมัดจำงวดแรกแล้ว)
 */

interface ShippingMethod {
  id: string;
  name: string;
  price: number;
}
const DEFAULT_SHIPPING: ShippingMethod[] = [
  { id: "standard", name: "ส่งธรรมดา (3-5 วัน)", price: 50 },
  { id: "express", name: "ส่งด่วน (1-2 วัน)", price: 90 },
];

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/** ชื่อบริษัทแบบตัดคำนำหน้า/ต่อท้าย ไว้ค้นคลังผู้ติดต่อ */
function coreName(name: string): string {
  return name
    .replace(/^(บริษัท|บจก\.?|บมจ\.?|หจก\.?|ห้างหุ้นส่วนจำกัด|ร้าน|คุณ)\s*/i, "")
    .replace(/\s*(จำกัด\s*\(มหาชน\)|จำกัด|\(มหาชน\)|co\.,?\s*ltd\.?|company\s*limited|limited|ltd\.?)\s*$/i, "")
    .trim();
}

/** เดาผู้ติดต่อจากเบอร์ (ต้องเจอคนเดียว) → ไม่มีเบอร์ลองชื่อบริษัท (ต้องเจอคนเดียวเช่นกัน) */
async function suggestContact(sb: SB, doc: FlowAccountDoc): Promise<Contact | null> {
  const digits = (doc.customer.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 9) {
    const { data } = await sb.from("contacts").select("id,data").ilike("data->>phone", `%${digits.slice(-9)}%`).limit(2);
    const rows = (data ?? []) as { id: string; data: Contact }[];
    if (rows.length === 1) return { ...rows[0].data, id: rows[0].id };
  }
  const core = coreName(doc.customer.name);
  if (core.length >= 3) {
    const { data } = await sb.from("contacts").select("id,data").ilike("data->>name", `%${core}%`).limit(2);
    const rows = (data ?? []) as { id: string; data: Contact }[];
    if (rows.length === 1) return { ...rows[0].data, id: rows[0].id };
  }
  return null;
}

async function shippingMethods(sb: SB): Promise<ShippingMethod[]> {
  const { data } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
  const list = (data?.data as { shipping?: ShippingMethod[] } | null)?.shipping;
  return Array.isArray(list) && list.length ? list : DEFAULT_SHIPPING;
}

/** ออเดอร์ที่เคยสร้างจากเอกสารเลขพวกนี้แล้ว (กันสร้างซ้ำ) — นับทั้งใบหลักและใบที่ดึงรายการมา (ใบมัดจำ + ใบเสนอราคา) */
async function existingOrdersFor(sb: SB, docNos: string[]): Promise<{ id: string; status: string }[]> {
  const nos = [...new Set(docNos.filter(Boolean))];
  if (!nos.length) return [];
  const [a, b] = await Promise.all([
    sb.from("orders").select("id,data").in("data->flowAccount->>docNo", nos).limit(5),
    sb.from("orders").select("id,data").in("data->flowAccount->itemsFrom->>docNo", nos).limit(5),
  ]);
  const seen = new Set<string>();
  const out: { id: string; status: string }[] = [];
  for (const r of [...((a.data ?? []) as { id: string; data: Order }[]), ...((b.data ?? []) as { id: string; data: Order }[])]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, status: r.data.status });
  }
  return out;
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  let body: { url?: string; itemsUrl?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* ไม่มี body */
  }
  // รับได้หลายลิงก์ (ใบมัดจำ + ใบที่มีรายการ) — วางติดกันในช่องเดียว หรือแยกช่อง itemsUrl ก็ได้
  const links = [...new Set(`${body.url ?? ""} ${body.itemsUrl ?? ""}`.split(/\s+/).map((s) => s.trim()).filter((s) => parseFlowAccountUrl(s)))].slice(0, 3);
  if (!links.length)
    return NextResponse.json({ error: "วางลิงก์แชร์ของ FlowAccount (share.flowaccount.com/…) ก่อน" }, { status: 400 });

  let doc: FlowAccountDoc;
  let docs: FlowAccountDoc[];
  try {
    docs = await Promise.all(links.map((u) => fetchFlowAccountDoc(u)));
    doc = mergeFlowAccountDocs(docs);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "อ่านเอกสารไม่สำเร็จ" }, { status: 502 });
  }

  const [contact, shipping, existing, rolePerms] = await Promise.all([
    suggestContact(sb, doc),
    shippingMethods(sb),
    existingOrdersFor(sb, docs.map((d) => d.docNo)),
    loadRolePerms(),
  ]);
  return NextResponse.json({
    doc,
    contact: contact ? { id: contact.id, name: contact.name, phone: contact.phone, address: contact.address } : null,
    shipping,
    existing,
    canMarkPaid: can(gate.actor, "orders.markPaid", rolePerms),
  });
}

interface CreateBody {
  doc: FlowAccountDoc;
  customer: string;
  phone: string;
  address: string;
  contactId?: string;
  shippingLabel?: string;
  shippingCost?: number;
  items: { name: string; selections?: string; qty: number; unitPrice: number; noProof?: boolean }[];
  wht?: { rate: number; amount: number } | null;
  /** ส่วนลด/VAT ที่แอดมินแก้ในกล่อง (ไม่ส่ง = ใช้ตามเอกสาร) */
  discount?: number;
  vat?: number;
  vatRate?: number;
  /**
   * ➗ เปิดโหมดมัดจำ: amount = งวดแรกรวม VAT (ตามใบแจ้งหนี้มัดจำ · แอดมินแก้ได้) · ไม่ส่ง/null = ใบเต็มจำนวนตามปกติ
   * status "ชำระแล้ว" คู่กับ deposit = "รับมัดจำงวดแรกแล้ว" (ตั้ง firstPaidAt + paidTotal เท่ากับที่แอดมินกดยืนยันรับมัดจำในหน้าออเดอร์)
   */
  deposit?: { amount: number } | null;
  status?: "รอชำระเงิน" | "ชำระแล้ว";
  note?: string;
  useByDate?: string;
}

export async function PUT(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const doc = body.doc;
  if (!doc?.url || !parseFlowAccountUrl(doc.url) || !doc.docNo)
    return NextResponse.json({ error: "ไม่มีข้อมูลเอกสาร FlowAccount — กดดึงข้อมูลจากลิงก์ก่อน" }, { status: 400 });
  const items: OrderItem[] = (body.items ?? [])
    .map((it) => ({
      productId: "special-item",
      name: String(it.name ?? "").trim(),
      selections: String(it.selections ?? "").trim(),
      qty: Math.max(1, Math.round(Number(it.qty) || 0)),
      unitPrice: Math.max(0, Number(it.unitPrice) || 0),
      ...(it.noProof ? { noProof: { by: gate.actor.name?.trim() || gate.actor.username, at: new Date().toISOString() } } : {}),
    }))
    .filter((it) => it.name);
  if (!items.length) return NextResponse.json({ error: "ต้องมีรายการอย่างน้อย 1 รายการ" }, { status: 400 });

  const wantPaid = body.status === "ชำระแล้ว";
  const by = gate.actor.name?.trim() || gate.actor.username;
  if (wantPaid && !can(gate.actor, "orders.markPaid", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ยืนยันเงินเข้าไม่ได้ — สร้างเป็น “รอชำระเงิน” แล้วให้คนที่มีสิทธิ์กดยืนยันทีหลัง" }, { status: 403 });

  const now = new Date();
  const id = `OD-${bkkYmd(now)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const shipCost = Math.max(0, Number(body.shippingCost) || 0);
  // ป้ายกลาง ๆ จากบรรทัดเอกสาร ("ค่าส่ง") → ชื่อวิธีส่งของร้านที่ราคาตรง — ใบปะหน้า/หน้าลูกค้าจะได้ขึ้น EMS (50) ไม่ใช่ "ค่าส่ง" (10 ก.ย. 69)
  const shippingLabel = normalizeShipLabel(body.shippingLabel, shipCost, await shippingMethods(sb)) || undefined;
  const whtOk = body.wht && Number(body.wht.amount) > 0 ? { rate: Number(body.wht.rate) || 0, amount: Number(body.wht.amount) } : undefined;
  const useByDate = /^\d{4}-\d{2}-\d{2}$/.test(body.useByDate ?? "") ? body.useByDate : undefined;
  const discountAmt = Math.max(0, Number(body.discount ?? doc.discount ?? 0) || 0);
  const vatAmt = Math.round(Math.max(0, Number(body.vat ?? doc.vat ?? 0) || 0) * 100) / 100;
  const depositAmt = body.deposit && Number(body.deposit.amount) > 0 ? Math.round(Number(body.deposit.amount) * 100) / 100 : 0;
  const nowIso = now.toISOString();
  // ใบมัดจำ: ตัวเลขใน flowAccount = มูลค่างานเต็ม (ไม่ใช่ยอดของใบแจ้งหนี้มัดจำใบเดียว) จะได้เทียบกับ orderTotal ได้ตรง ๆ
  const fa = depositAmt > 0 && doc.deposit ? { subtotal: doc.deposit.fullSubtotal, vat: doc.deposit.fullVat, grandTotal: doc.deposit.fullGrandTotal, wht: doc.deposit.fullWht } : doc;
  const faNet = fa.grandTotal != null ? Math.round((fa.grandTotal - (fa.wht ?? 0)) * 100) / 100 : doc.net;
  const docTotal = fa.grandTotal ?? doc.grandTotal;

  let order: Order = {
    id,
    key: randomBytes(24).toString("base64url"),
    customer: (body.customer ?? doc.customer.name).trim(),
    phone: (body.phone ?? doc.customer.phone ?? "").trim(),
    address: (body.address ?? doc.customer.address).trim(),
    date: thaiDateTime(now),
    payment: "โอนธนาคาร",
    shipping: shippingLabel?.includes("ด่วน") ? "ส่งด่วน" : "ส่งธรรมดา",
    ...(shippingLabel ? { shippingLabel } : {}),
    shippingCost: shipCost,
    status: wantPaid ? "ชำระแล้ว" : "รอชำระเงิน",
    items,
    placedBy: by,
    // ➗ โหมดมัดจำ (แพตเทิร์นเดียวกับปุ่ม "เปิดโหมดมัดจำ 50%" + "ยืนยันรับมัดจำ" ในหน้าออเดอร์)
    ...(depositAmt > 0 ? { deposit: { amount: depositAmt, ...(wantPaid ? { firstPaidAt: nowIso } : {}) }, ...(wantPaid ? { paidTotal: depositAmt } : {}) } : {}),
    ...(body.contactId?.trim() ? { contactId: body.contactId.trim() } : {}),
    ...(whtOk ? { wht: whtOk } : {}),
    // ยอดต้องเท่าบิล FlowAccount ทุกบาท: ส่วนลดตามใบ + VAT 7% ตามใบ (ราคาสินค้าเป็นราคาก่อน VAT)
    ...(discountAmt > 0 ? { adminDiscount: { label: `ส่วนลดตามใบ ${doc.docNo}`, amount: discountAmt } } : {}),
    ...(vatAmt > 0 ? { vat: { rate: Number(body.vatRate) || doc.vatRate || 7, amount: vatAmt } } : {}),
    ...(body.note?.trim() ? { note: body.note.trim() } : {}),
    ...(useByDate ? { useByDate, ...autoShipDate(useByDate) } : {}),
    taxInvoice: {
      company: doc.customer.name,
      ...(doc.customer.taxId ? { taxId: doc.customer.taxId } : {}),
      ...(doc.customer.branch ? { branch: doc.customer.branch } : {}),
      address: doc.customer.address,
    },
    flowAccount: {
      url: doc.url,
      docType: doc.docType,
      docTypeLabel: doc.docTypeLabel,
      docNo: doc.docNo,
      ...(doc.date ? { date: doc.date } : {}),
      ...(fa.subtotal != null ? { subtotal: fa.subtotal } : {}),
      ...(fa.vat != null ? { vat: fa.vat } : {}),
      ...(fa.grandTotal != null ? { grandTotal: fa.grandTotal } : {}),
      ...(fa.wht != null ? { wht: fa.wht } : {}),
      ...(faNet != null ? { net: faNet } : {}),
      ...(depositAmt > 0
        ? {
            deposit: {
              // ใบเสนอราคา/ใบธรรมดาที่แอดมินติ๊กเปิดมัดจำเอง = manual (ไม่มีใบแจ้งหนี้มัดจำอ้างอิง)
              kind: doc.deposit?.kind ?? "manual",
              amount: depositAmt,
              ...(doc.deposit ? { amountBeforeVat: doc.deposit.amountBeforeVat } : {}),
              ...(doc.deposit?.refDocNo ? { refDocNo: doc.deposit.refDocNo } : {}),
              // โอนจริงงวดแรก = มัดจำ − หัก ณ ที่จ่ายส่วนของงวดแรก (ตามสัดส่วน)
              ...(whtOk && fa.grandTotal ? { net: Math.round((depositAmt - (whtOk.amount * depositAmt) / fa.grandTotal) * 100) / 100 } : {}),
            },
          }
        : {}),
      ...(doc.itemsFrom ? { itemsFrom: doc.itemsFrom } : {}),
      fetchedAt: nowIso,
    },
  };
  const total = orderTotal(order);
  const mismatch = docTotal != null && Math.abs(docTotal - total) >= 0.01;
  const depNote =
    depositAmt > 0
      ? ` · ➗ มัดจำงวดแรก ${depositAmt.toLocaleString("th-TH")} บาท${doc.deposit?.refDocNo ? ` (อ้างอิง ${doc.deposit.refDocNo})` : ""}${
          doc.itemsFrom ? ` · รายการจาก ${doc.itemsFrom.docTypeLabel} ${doc.itemsFrom.docNo}` : ""
        }`
      : "";
  order = withLog(
    order,
    by,
    "สร้างจากลิงก์ FlowAccount",
    `${doc.docTypeLabel} ${doc.docNo} · ยอดรวม ${total.toLocaleString("th-TH")} บาท${vatAmt ? " (รวม VAT)" : ""}${depNote}${
      mismatch ? ` ⚠️ ไม่ตรงกับยอดในเอกสาร ${docTotal!.toLocaleString("th-TH")} บาท (แอดมินแก้รายการ/ค่าส่งก่อนสร้าง)` : ""
    }`
  );
  if (wantPaid)
    order = depositAmt > 0
      ? withLog(order, by, "ยืนยันรับมัดจำ 50% (FlowAccount)", `ยอด ${depositAmt.toLocaleString("th-TH")} บาท ตามเอกสาร FlowAccount ${doc.docNo} — ไม่มีสลิปในระบบนี้`)
      : withLog(order, by, "ยืนยันเงินเข้า (FlowAccount)", "รับชำระตามเอกสาร FlowAccount — ไม่มีสลิปในระบบนี้");

  const { error } = await sb.from("orders").insert({ id, data: order });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ชำระแล้วตั้งแต่สร้าง = ผลข้างเคียงชุดเดียวกับตอนแอดมินกดเปลี่ยนสถานะ (msVerify · ตัดสต๊อก · ยอดขาย · แต้ม)
  if (wantPaid) {
    // ใบมัดจำ: รายงาน msVerify เป็นงวดแรก (ยอดมัดจำ) · แต้มรอให้ครบ 100% (เหมือน PATCH ปกติที่ข้าม awardPoints เมื่อมี deposit)
    void reportPaidToTP(order, by, depositAmt > 0 ? { amount: depositAmt, noteSuffix: `มัดจำ 50% งวดแรก · FlowAccount ${doc.docNo}` } : { noteSuffix: `FlowAccount ${doc.docNo}` });
    void cutStockForOrder(order);
    void bumpSoldForOrder(order.id);
    if (depositAmt <= 0) void awardPointsForOrder(order);
  }
  return NextResponse.json({ ok: true, id });
}
