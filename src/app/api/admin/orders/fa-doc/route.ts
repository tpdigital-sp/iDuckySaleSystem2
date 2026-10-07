import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";
import { FA_KIND_LABEL, draftFor, netCollected, quotationBody, upgradeBody, type FaDocKind } from "@/lib/server/fa-create";
import { bankAccounts, createDocument, findDocRecordId, flowAccountApiReady, receiveTransferPayment, shareDocument } from "@/lib/server/flowaccount-api";
import { WHT_TABLE } from "@/lib/server/wht-db";
import { bkkParts } from "@/lib/bangkok-time";

export const runtime = "nodejs";
export const maxDuration = 60;

/** กันกดซ้ำในเครื่องเดียวกันระหว่างรอ FlowAccount (กันข้ามเครื่องด้วยการเช็คฐานสด ๆ อีกชั้นก่อนบันทึก) */
const busy = new Set<string>();

const API_PATH: Record<FaDocKind, { create: string; share: string }> = {
  qt: { create: "/quotations", share: "quotations" },
  bl: { create: "/billing-notes", share: "billing-notes" },
  inv: { create: "/tax-invoices", share: "tax-invoices" },
};

const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * 📄📋🧾 ออกเอกสาร FlowAccount จากออเดอร์ (เฟส 1–3 · 6–7 ต.ค. 69)
 * kind: qt = ใบเสนอราคา (เอกสารหลัก → order.flowAccount) · bl = ใบแจ้งหนี้ต่อจาก QT · inv = ใบกำกับภาษี/ใบเสร็จรับเงิน + รับเงินโอน (→ order.faChain)
 * POST { orderId, kind }               → ร่างให้ตรวจ (ยังไม่สร้างอะไร)
 * POST { orderId, kind, create: true } → สร้างใน FlowAccount จริง + ลิงก์แชร์ + ผูกเข้าออเดอร์
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const money = await requirePerm("orders.money");
  if (money.res) return money.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { orderId?: string; kind?: FaDocKind; create?: boolean } | null;
  const orderId = body?.orderId?.trim();
  const kind = body?.kind ?? "qt";
  if (!orderId) return NextResponse.json({ error: "ไม่รู้ว่าออเดอร์ไหน" }, { status: 400 });
  if (!API_PATH[kind]) return NextResponse.json({ error: "ชนิดเอกสารไม่ถูกต้อง" }, { status: 400 });

  const load = async () => (await sb.from("orders").select("data").eq("id", orderId).maybeSingle()).data?.data as Order | undefined;
  const order = await load();
  if (!order) return NextResponse.json({ error: `ไม่พบออเดอร์ ${orderId}` }, { status: 404 });
  const draft = draftFor(order, kind);
  if (kind === "inv") {
    // ใบกำกับที่พนักงานออกมือใน FlowAccount แล้ว (cron wht-sync จับคู่ไว้) → ไม่ออกซ้ำ
    const { data } = await sb.from(WHT_TABLE).select("id").contains("data", { orderIds: [orderId] }).limit(5);
    const ids = (data ?? []).map((r) => String(r.id)).filter((id) => !(order.faChain ?? []).some((d) => d.docNo === id));
    if (ids.length) draft.problems.push(`มีใบกำกับภาษีใน FlowAccount แล้ว (${ids.join(", ")}) — ไม่ต้องออกซ้ำ`);
  }
  if (!body?.create) return NextResponse.json({ draft, label: FA_KIND_LABEL[kind] });

  if (draft.problems.length) return NextResponse.json({ error: draft.problems.join(" · "), draft }, { status: 409 });
  if (!(await flowAccountApiReady())) return NextResponse.json({ error: "ยังไม่ได้ใส่รหัส FlowAccount Open API" }, { status: 503 });
  const lock = `${orderId}:${kind}`;
  if (busy.has(lock)) return NextResponse.json({ error: `กำลังออก${FA_KIND_LABEL[kind]}ของออเดอร์นี้อยู่ — รอสักครู่` }, { status: 409 });
  busy.add(lock);
  const by = gate.actor.name || gate.actor.username;
  let created: { recordId: number; docNo: string } | null = null;
  try {
    let docBody: Record<string, unknown>;
    let bank: { id: number; number: string } | undefined;
    if (kind === "qt") docBody = quotationBody(order, draft, by);
    else {
      const src = await findDocRecordId(draft.source!.docNo);
      if (!src) throw new Error(`หาเอกสารต้นทาง ${draft.source!.docNo} ใน FlowAccount ไม่เจอ`);
      if (kind === "inv") {
        bank = (await bankAccounts())[0];
        if (!bank) throw new Error("ไม่พบบัญชีธนาคารรับเงินใน FlowAccount");
      }
      docBody = upgradeBody(order, draft, kind, by, src.id);
    }
    created = await createDocument(API_PATH[kind].create, docBody);
    const doc = created;
    // 🧾 ใบกำกับ: บันทึกรับเงินโอนเข้าบัญชีร้าน (ขั้นที่ 2) — ไม่ผ่านก็ยังผูกใบเข้าออเดอร์ แล้วบอกให้ไปกดรับเงินใน FlowAccount
    let payErr = "";
    if (kind === "inv" && bank) {
      try {
        await receiveTransferPayment(doc.recordId, {
          date: draft.paymentDate!,
          collected: netCollected(draft),
          bankAccountId: bank.id,
          whtRate: draft.wht?.rate,
          whtAmount: draft.wht?.amount,
          remarks: `รับโอนตามออเดอร์ ${order.id}`,
        });
      } catch (e) {
        payErr = (e as Error).message;
      }
    }
    const url = await shareDocument(API_PATH[kind].share, doc.recordId).catch(() => "");

    const fresh = (await load()) ?? order;
    const now = new Date().toISOString();
    let next: Order;
    if (kind === "qt") {
      if (fresh.flowAccount) throw new Error(`ระหว่างสร้าง มีคนผูกเอกสาร ${fresh.flowAccount.docNo} เข้าออเดอร์นี้แล้ว`);
      const p = bkkParts(new Date());
      next = {
        ...fresh,
        flowAccount: {
          url: url || `https://advance.flowaccount.com/N399315/business/quotations/${doc.recordId}`,
          docType: "qt",
          docTypeLabel: "ใบเสนอราคา",
          docNo: doc.docNo,
          date: `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`,
          subtotal: draft.afterDiscount,
          vat: draft.vat,
          grandTotal: draft.grandTotal,
          ...(draft.wht ? { wht: draft.wht.amount } : {}),
          net: Math.round((draft.grandTotal - (draft.wht?.amount ?? 0)) * 100) / 100,
          fetchedAt: now,
        },
      };
    } else {
      if ((fresh.faChain ?? []).some((d) => d.kind === kind)) throw new Error(`ระหว่างสร้าง ออเดอร์นี้มี${FA_KIND_LABEL[kind]}แล้ว`);
      next = {
        ...fresh,
        faChain: [
          ...(fresh.faChain ?? []),
          { kind, docNo: doc.docNo, recordId: doc.recordId, ...(url ? { url } : {}), total: draft.grandTotal, at: now, by, ...(kind === "inv" ? { paid: !payErr } : {}) },
        ],
      };
    }
    next = withLog(
      next,
      by,
      `ออก${FA_KIND_LABEL[kind]}ใน FlowAccount`,
      `${doc.docNo}${draft.source && kind !== "qt" ? ` (ต่อจาก ${draft.source.docNo})` : ""} · ยอด ${baht(draft.grandTotal)} บาท${
        kind === "inv" ? (payErr ? ` · ⚠️ ${payErr} — กดรับเงินใน FlowAccount เอง` : ` · รับเงินโอน ${baht(netCollected(draft))} วันที่ ${draft.paymentDate} เข้าบัญชี …${bank?.number.slice(-4) ?? ""}`) : ""
      }${draft.wht ? ` · หัก ณ ที่จ่าย ${draft.wht.rate}%` : ""}`
    );
    const w = await updateOrder(sb, next, { prev: fresh, by });
    if (w.error) throw new Error(`บันทึกออเดอร์ไม่สำเร็จ: ${w.error.message}`);
    return NextResponse.json({ ok: true, docNo: doc.docNo, order: w.order, ...(payErr ? { warning: `ออก ${doc.docNo} แล้ว แต่${payErr} — เปิดใบใน FlowAccount แล้วกดรับชำระเงินเอง` } : {}) });
  } catch (e) {
    const msg = (e as Error).message;
    // สร้างใน FlowAccount ไปแล้วแต่ผูกเข้าออเดอร์ไม่สำเร็จ → บอกเลขใบ (ห้ามกดสร้างซ้ำ)
    return NextResponse.json(
      { error: created ? `สร้าง ${created.docNo} ใน FlowAccount แล้ว แต่${msg} — อย่ากดสร้างซ้ำ แจ้งผู้ดูแลให้ผูกใบนี้เข้าออเดอร์` : msg },
      { status: 502 }
    );
  } finally {
    busy.delete(lock);
  }
}
