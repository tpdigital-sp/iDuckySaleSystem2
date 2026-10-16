import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type FlowAccountExtraDoc, type Order } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";
import { FA_KIND_LABEL, draftFor, extraQuotationDraft, mainDocOf, netCollected, quotationBody, quotationUpdateBody, quotationUpdateDraft, upgradeBody, type FaDocKind } from "@/lib/server/fa-create";
import { bankAccounts, createDocument, ensureCompanyHeader, findDocRecordId, flowAccountApiReady, getDocument, receiveTransferPayment, shareDocument, updateDocument } from "@/lib/server/flowaccount-api";
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
  const body = (await req.json().catch(() => null)) as { orderId?: string; kind?: FaDocKind | "qt-update" | "qt-extra"; create?: boolean; items?: unknown } | null;
  const orderId = body?.orderId?.trim();
  if (!orderId) return NextResponse.json({ error: "ไม่รู้ว่าออเดอร์ไหน" }, { status: 400 });
  if (body?.kind === "qt-update") return updateQuotation(sb, orderId, !!body.create, gate.actor.name || gate.actor.username);
  if (body?.kind === "qt-extra") return extraQuotation(sb, orderId, body.items, !!body.create, gate.actor.name || gate.actor.username);
  const kind = (body?.kind ?? "qt") as FaDocKind;
  if (!API_PATH[kind]) return NextResponse.json({ error: "ชนิดเอกสารไม่ถูกต้อง" }, { status: 400 });

  const load = async () => (await sb.from("orders").select("data").eq("id", orderId).maybeSingle()).data?.data as Order | undefined;
  let order = await load();
  if (!order) return NextResponse.json({ error: `ไม่พบออเดอร์ ${orderId}` }, { status: 404 });
  if (kind !== "qt") order = await adoptManualChain(sb, order, gate.actor.name || gate.actor.username);
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
    // 🏢 BL/INV ที่อัปเกรดผ่าน API ออกมาหัวกระดาษร้านว่าง → เติมก่อนรับเงิน (รับเงินแล้วแก้ใบไม่ได้ · INV007722 · 14 ต.ค. 69)
    const headErr = kind === "qt" ? "" : await ensureCompanyHeader(API_PATH[kind].share, doc.recordId, docBody);
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
      // 🧾 ใบกำกับ → จดเลข INV ให้ป้ายฝ่ายแพ็คเห็นทันที (cron wht-sync จะจดซ้ำแบบเดียวกันทีหลัง)
      if (kind === "inv")
        next.faInvoices = [
          ...(fresh.faInvoices ?? []).filter((x) => x.docNo !== doc.docNo),
          { docNo: doc.docNo, ref: draft.source!.docNo, date: draft.paymentDate, total: draft.grandTotal },
        ];
    }
    next = withLog(
      next,
      by,
      `ออก${FA_KIND_LABEL[kind]}ใน FlowAccount`,
      `${doc.docNo}${draft.source && kind !== "qt" ? ` (ต่อจาก ${draft.source.docNo})` : ""} · ยอด ${baht(draft.grandTotal)} บาท${
        kind === "inv" ? (payErr ? ` · ⚠️ ${payErr} — กดรับเงินใน FlowAccount เอง` : ` · รับเงินโอน ${baht(netCollected(draft))} วันที่ ${draft.paymentDate} เข้าบัญชี …${bank?.number.slice(-4) ?? ""}`) : ""
      }${draft.wht ? ` · หัก ณ ที่จ่าย ${draft.wht.rate}%` : ""}${headErr ? ` · ⚠️ ${headErr} — เปิดใบใน FlowAccount กดแก้ไขแล้วบันทึก` : ""}`
    );
    const w = await updateOrder(sb, next, { prev: fresh, by });
    if (w.error) throw new Error(`บันทึกออเดอร์ไม่สำเร็จ: ${w.error.message}`);
    return NextResponse.json({ ok: true, docNo: doc.docNo, order: w.order, ...(payErr || headErr
        ? { warning: [payErr && `ออก ${doc.docNo} แล้ว แต่${payErr} — เปิดใบใน FlowAccount แล้วกดรับชำระเงินเอง`, headErr && `${doc.docNo}: ${headErr} — เปิดใบใน FlowAccount กดแก้ไขแล้วบันทึก`].filter(Boolean).join(" · ") }
        : {}) });
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

const KIND_OF_TYPE: Record<number, { kind: "bl" | "inv"; api: string }> = {
  5: { kind: "bl", api: "billing-notes" },
  7: { kind: "inv", api: "tax-invoices" },
};

/**
 * 🔗 ใบแจ้งหนี้/ใบกำกับที่พนักงานออกเองในแอป FlowAccount ต่อจากเอกสารหลัก → ผูกเข้า faChain ก่อนร่าง (13 ต.ค. 69)
 * เดิมระบบไม่รู้จักใบที่ออกมือ → 🧾 ออกใบกำกับ อัปเกรดจาก QT ที่ถูกแปลงเป็น BL ไปแล้ว FlowAccount ปฏิเสธ
 * (OD-261009-4225: QT010864 → BL002116 ออกในแอป 12 ต.ค. · ปุ่ม 📋 ออกใบแจ้งหนี้ยังโชว์ด้วย)
 * ไล่ referencedToMe ของเอกสารหลัก → BL → INV (ข้ามใบยกเลิก) · อ่าน FlowAccount ไม่ได้ = ใช้ออเดอร์เดิม (ร่างทำงานแบบเก่า)
 */
async function adoptManualChain(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, order: Order, by: string): Promise<Order> {
  const main = mainDocOf(order);
  if (!main || !(await flowAccountApiReady())) return order;
  try {
    const known = new Set([main.docNo, ...(order.faChain ?? []).map((d) => d.docNo)].map((n) => n.toUpperCase()));
    const found: NonNullable<Order["faChain"]> = [];
    let cur = await findDocRecordId(main.docNo);
    for (let hop = 0; cur && hop < 3; hop++) {
      const doc = await getDocument(cur.kind, cur.id);
      let next: { kind: string; id: number } | null = null;
      for (const ref of doc?.referencedToMe ?? []) {
        const t = KIND_OF_TYPE[ref.docType];
        if (!t) continue;
        const child = await getDocument(t.api, ref.recordId);
        if (!child || child.status === "void") continue;
        if (!known.has(ref.docNo.toUpperCase())) {
          known.add(ref.docNo.toUpperCase());
          const url = await shareDocument(t.api, ref.recordId).catch(() => "");
          found.push({
            kind: t.kind,
            docNo: ref.docNo,
            recordId: ref.recordId,
            ...(url ? { url } : {}),
            total: child.grandTotal,
            at: new Date().toISOString(),
            by: "FlowAccount",
            manual: true,
            ...(t.kind === "inv" ? { paid: child.status === "paid" } : {}),
          });
        }
        next = { kind: t.api, id: ref.recordId };
        if (t.kind === "inv") break;
      }
      cur = next;
    }
    if (!found.length) return order;
    const fresh = ((await sb.from("orders").select("data").eq("id", order.id).maybeSingle()).data?.data as Order | undefined) ?? order;
    const have = new Set((fresh.faChain ?? []).map((d) => d.docNo.toUpperCase()));
    const add = found.filter((d) => !have.has(d.docNo.toUpperCase()));
    if (!add.length) return fresh;
    const next = withLog(
      { ...fresh, faChain: [...(fresh.faChain ?? []), ...add] },
      by,
      "ผูกเอกสารที่ออกในแอป FlowAccount",
      `${add.map((d) => `${FA_KIND_LABEL[d.kind]} ${d.docNo}`).join(" · ")} (ต่อจาก ${main.docNo})`
    );
    const w = await updateOrder(sb, next, { prev: fresh, by });
    return w.error ? next : (w.order ?? next);
  } catch {
    return order;
  }
}

/**
 * 🔄 อัปเดตใบเสนอราคาเดิมใน FlowAccount ให้ตรงออเดอร์ (รายการ · ยอด · VAT · หัก ณ ที่จ่าย) — 7 ต.ค. 69
 * แก้ได้เฉพาะ QT สถานะ "รออนุมัติ" (FlowAccount บังคับ) · คงวันที่ออกใบ/พนักงานขาย/เลขอ้างอิงเดิม
 * ร่าง = before (ใบปัจจุบันใน FlowAccount) + after (ร่างจากออเดอร์) ให้เทียบก่อนกด
 */
async function updateQuotation(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, orderId: string, create: boolean, by: string) {
  const order = (await sb.from("orders").select("data").eq("id", orderId).maybeSingle()).data?.data as Order | undefined;
  if (!order) return NextResponse.json({ error: `ไม่พบออเดอร์ ${orderId}` }, { status: 404 });
  const draft = quotationUpdateDraft(order);
  let before: Awaited<ReturnType<typeof getDocument>> = null;
  let recordId = 0;
  if (draft.source && (await flowAccountApiReady())) {
    try {
      const hit = await findDocRecordId(draft.source.docNo);
      if (!hit) draft.problems.push(`หา ${draft.source.docNo} ใน FlowAccount ไม่เจอ`);
      else {
        recordId = hit.id;
        before = await getDocument("quotations", hit.id);
        if (before && before.status !== "awaiting")
          draft.problems.push(`${draft.source.docNo} ไม่ได้อยู่สถานะ "รออนุมัติ" (${before.status}) — FlowAccount ให้แก้ผ่าน API ได้เฉพาะใบรออนุมัติ ใช้ ✏️ แก้ไขในแอป FlowAccount แทน`);
      }
    } catch (e) {
      draft.problems.push((e as Error).message);
    }
  }
  if (!create) return NextResponse.json({ draft, before, label: "ใบเสนอราคา (อัปเดต)" });
  if (draft.problems.length || !recordId) return NextResponse.json({ error: draft.problems.join(" · ") || "ไม่พบใบเสนอราคา", draft }, { status: 409 });

  const lock = `${orderId}:qt-update`;
  if (busy.has(lock)) return NextResponse.json({ error: "กำลังอัปเดตใบเสนอราคาอยู่ — รอสักครู่" }, { status: 409 });
  busy.add(lock);
  try {
    // ผู้ขาย = "พนักงาน" (quotationBody) — ใบที่เคยออกเป็นชื่อคนกด (เช่น Pang 🐰) กดอัปเดตแล้วเปลี่ยนเป็น พนักงาน ด้วย
    const docBody = quotationUpdateBody(order, draft, by, recordId);
    if (before?.publishedOn) docBody.publishedOn = before.publishedOn;
    if (before?.dueDate) docBody.dueDate = before.dueDate;
    // อ้างอิงที่ระบบเคยใส่เลข OD ไว้ = ล้างออก (เจ้าของร้านขอ 7 ต.ค. 69) · ที่พนักงานพิมพ์เองใน FlowAccount = คงไว้
    if (before?.reference && before.reference !== order.id) docBody.reference = before.reference;
    await updateDocument("quotations", recordId, docBody);
    const fresh = ((await sb.from("orders").select("data").eq("id", orderId).maybeSingle()).data?.data as Order | undefined) ?? order;
    const net = Math.round((draft.grandTotal - (draft.wht?.amount ?? 0)) * 100) / 100;
    let next: Order = fresh.flowAccount
      ? {
          ...fresh,
          flowAccount: {
            ...fresh.flowAccount,
            subtotal: draft.afterDiscount,
            vat: draft.vat,
            grandTotal: draft.grandTotal,
            wht: draft.wht?.amount,
            net,
            fetchedAt: new Date().toISOString(),
            docChanged: undefined,
          },
        }
      : fresh;
    next = withLog(
      next,
      by,
      "อัปเดตใบเสนอราคาใน FlowAccount",
      `${draft.source!.docNo} · ${before ? `${baht(before.grandTotal)}${before.wht ? ` (หัก ${baht(before.wht)})` : ""} → ` : ""}${baht(draft.grandTotal)}${draft.wht ? ` (หัก ณ ที่จ่าย ${draft.wht.rate}% ${baht(draft.wht.amount)})` : " (ไม่หัก)"}`
    );
    const w = await updateOrder(sb, next, { prev: fresh, by });
    if (w.error) throw new Error(`แก้ใน FlowAccount แล้ว แต่บันทึกออเดอร์ไม่สำเร็จ: ${w.error.message}`);
    return NextResponse.json({ ok: true, docNo: draft.source!.docNo, order: w.order });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  } finally {
    busy.delete(lock);
  }
}

/* ── 📄➕ ใบเสนอราคาเฉพาะรายการที่สั่งเพิ่ม → บิลเพิ่มของออเดอร์ (16 ต.ค. 69 · OD-261002-9030) ─────────────────────── */

type Sb = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
const LABEL_EXTRA = "ใบเสนอราคา (รายการที่สั่งเพิ่ม)";

/**
 * POST { orderId, kind: "qt-extra", items: [{ idx, print }] }               → ร่าง
 * POST { orderId, kind: "qt-extra", items: [{ idx, print }], create: true } → สร้าง QT ใน FlowAccount
 *   + แนบเป็นบิลเพิ่ม (flowAccountExtras · items = จำนวนรายการ) + ติด extraDoc ให้รายการ — ยอดออเดอร์/สถานะไม่เปลี่ยน ไม่แจ้งไลน์
 *   (รายการเพิ่มอยู่ในออเดอร์และคิดเงินไปแล้ว ขาดแค่เอกสาร) · ใบกำกับ/ใบเสร็จของใบนี้ อัปเกรดต่อในแอป FlowAccount → cron wht-sync จดเลข INV ให้
 */
async function extraQuotation(sb: Sb, orderId: string, rawItems: unknown, create: boolean, by: string) {
  const picks = (Array.isArray(rawItems) ? rawItems : [])
    .map((x) => ({ idx: Number((x as { idx?: unknown })?.idx), print: typeof (x as { print?: unknown })?.print === "string" ? String((x as { print: string }).print) : undefined }))
    .filter((x) => Number.isInteger(x.idx) && x.idx >= 0);
  const load = async () => (await sb.from("orders").select("data").eq("id", orderId).maybeSingle()).data?.data as Order | undefined;
  const order = await load();
  if (!order) return NextResponse.json({ error: `ไม่พบออเดอร์ ${orderId}` }, { status: 404 });
  const draft = extraQuotationDraft(order, picks);
  if (!create) return NextResponse.json({ draft, label: LABEL_EXTRA });
  if (draft.problems.length) return NextResponse.json({ error: draft.problems.join(" · "), draft }, { status: 409 });
  if (!(await flowAccountApiReady())) return NextResponse.json({ error: "ยังไม่ได้ใส่รหัส FlowAccount Open API" }, { status: 503 });
  const lock = `${orderId}:qt-extra`;
  if (busy.has(lock)) return NextResponse.json({ error: "กำลังออกใบเสนอราคาของออเดอร์นี้อยู่ — รอสักครู่" }, { status: 409 });
  busy.add(lock);
  let created: { recordId: number; docNo: string } | null = null;
  try {
    const docBody = quotationBody(order, draft, by);
    docBody.internalNotes = `สร้างจากระบบ iDucky ออเดอร์ ${order.id} (บิลเพิ่ม — รายการที่สั่งเพิ่ม)`;
    created = await createDocument(API_PATH.qt.create, docBody);
    const doc = created;
    const url = (await shareDocument(API_PATH.qt.share, doc.recordId).catch(() => "")) || `https://advance.flowaccount.com/N399315/business/quotations/${doc.recordId}`;
    const fresh = (await load()) ?? order;
    // ระหว่างรอ FlowAccount ออเดอร์อาจถูกแก้ — เช็คซ้ำกับฉบับล่าสุดก่อนติดป้ายรายการ
    const recheck = extraQuotationDraft(fresh, draft.items.map((idx) => ({ idx, print: picks.find((p) => p.idx === idx)?.print })));
    if (recheck.problems.length) throw new Error(`ออเดอร์ถูกแก้ระหว่างสร้าง (${recheck.problems.join(" · ")})`);
    const now = new Date().toISOString();
    const p = bkkParts(new Date());
    const extra: FlowAccountExtraDoc = {
      url,
      docType: "qt",
      docTypeLabel: "ใบเสนอราคา",
      docNo: doc.docNo,
      date: `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`,
      subtotal: draft.afterDiscount,
      vat: draft.vat,
      grandTotal: draft.grandTotal,
      ...(draft.wht ? { wht: draft.wht.amount } : {}),
      net: Math.round((draft.grandTotal - (draft.wht?.amount ?? 0)) * 100) / 100,
      lines: draft.lines.slice(0, 6).map((l) => `${l.name} ×${l.quantity} @${baht(l.pricePerUnit)}`),
      items: draft.items.length,
      by,
      at: now,
    };
    const set = new Set(draft.items);
    let next: Order = {
      ...fresh,
      items: fresh.items.map((it, i) => (set.has(i) ? { ...it, extraDoc: doc.docNo } : it)),
      flowAccountExtras: [...(fresh.flowAccountExtras ?? []), extra],
    };
    next = withLog(
      next,
      by,
      "ออกใบเสนอราคา (รายการที่สั่งเพิ่ม) ใน FlowAccount",
      `${doc.docNo} · ${draft.lines.map((l) => `${l.name} ×${l.quantity}`).join(", ")} · ยอด ${baht(draft.grandTotal)} บาท${draft.wht ? ` · หัก ณ ที่จ่าย ${draft.wht.rate}%` : ""} · แนบเป็นบิลเพิ่มแล้ว (ยอดออเดอร์ไม่เปลี่ยน) · ฝ่ายแพ็คต้องใส่ใบกำกับ ${1 + (next.flowAccountExtras?.length ?? 0)} ใบ`
    );
    const w = await updateOrder(sb, next, { prev: fresh, by });
    if (w.error) throw new Error(`บันทึกออเดอร์ไม่สำเร็จ: ${w.error.message}`);
    return NextResponse.json({ ok: true, docNo: doc.docNo, url, order: w.order });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json(
      { error: created ? `สร้าง ${created.docNo} ใน FlowAccount แล้ว แต่${msg} — อย่ากดสร้างซ้ำ แนบใบนี้ด้วยปุ่ม ＋ แนบบิลเพิ่ม (แบบอ้างอิง) แทน` : msg },
      { status: 502 }
    );
  } finally {
    busy.delete(lock);
  }
}
