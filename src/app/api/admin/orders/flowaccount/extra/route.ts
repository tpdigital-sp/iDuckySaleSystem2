import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { fetchFlowAccountDoc, parseFlowAccountUrl } from "@/lib/server/flowaccount";
import { withLog, type FlowAccountExtraDoc, type Order, type OrderCharge } from "@/lib/admin-data";
import { notifyCustomerLogged, orderLink } from "@/lib/server/notify";
import { signPaymentUrls } from "@/lib/server/slip-sign";
import { updateOrder } from "@/lib/server/order-write";
import { applyCharge, chargeNotice, newChargeId } from "@/lib/server/order-charge";
import { inBackground } from "@/lib/server/background";

export const runtime = "nodejs";

const r2 = (n: number) => Math.round(n * 100) / 100;
const thb = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, "");

/**
 * 🧾➕ บิลเพิ่ม — แนบเอกสาร FlowAccount ใบที่ 2 (3, 4 …) เข้าออเดอร์ที่มีบิลหลักอยู่แล้ว
 *
 * ทำไมต้องมี (OD-260921-1879 · 24 ก.ย. 69): ลูกค้าบิลบริษัทเปลี่ยนวัสดุระหว่างผลิต ร้านออก QT010743 เป็นส่วนต่าง
 * แต่ 1 ออเดอร์ผูกเอกสารได้ใบเดียว → พนักงานถาม "จะแนบ 2 บิลยังไง ฝ่ายแพ็คต้องรู้ด้วยว่ามี 2 บิล"
 *
 * POST { orderId, url, mode?: "charge" | "link" | "ref", chargeId?, label? }
 *   mode "charge" (ค่าเริ่มต้น) = อ่านยอดรวมทั้งสิ้นของใบมาเป็นค่าบริการเพิ่ม (นอกฐานภาษีบิลหลัก → ยอดตามบิลหลักยังตรง)
 *                                 + เด้งกลับรอชำระเงินตามกติกากลาง + แจ้งไลน์ลูกค้า (โอนตามใบนี้ ส่งสลิปในแชท)
 *   mode "link"   = ใบนี้เก็บเงินไปแล้วด้วยปุ่มเก็บเพิ่มก่อนหน้า → ผูกกับ charge เดิม (chargeId) ไม่คิดเงินซ้ำ ไม่แจ้งไลน์
 *   mode "ref"    = แนบไว้อ้างอิงเฉย ๆ (เช่น ใบกำกับที่ออกแทนใบเสนอราคาเดิม) ไม่คิดเงิน ไม่แจ้ง
 * DELETE { orderId, docNo } → ถอดบิลเพิ่ม (ค่าบริการที่คู่กันให้ถอดที่ปุ่มเก็บเพิ่ม — จะได้เห็นชัดว่ายอดค้างหาย)
 * สิทธิ์: orders.edit + orders.money
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  if (!can(gate.actor, "orders.money", await loadRolePerms())) return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์เรื่องเงินของออเดอร์" }, { status: 403 });
  const who = gate.actor.name?.trim() || gate.actor.username;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; url?: string; mode?: string; chargeId?: string; label?: string };
  const orderId = String(body.orderId ?? "").trim();
  const url = String(body.url ?? "").trim();
  const mode = body.mode === "link" || body.mode === "ref" ? body.mode : "charge";
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!parseFlowAccountUrl(url)) return NextResponse.json({ error: "วางลิงก์แชร์ของ FlowAccount (share.flowaccount.com/…) ก่อน" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (order.status === "ยกเลิก") return NextResponse.json({ error: "ออเดอร์นี้ถูกยกเลิกแล้ว" }, { status: 409 });
  if (!order.flowAccount && !order.taxInvoice) return NextResponse.json({ error: "ใบนี้ยังไม่มีบิลหลัก — ผูกเอกสาร FlowAccount/ใส่ข้อมูลใบกำกับก่อน แล้วค่อยแนบบิลเพิ่ม" }, { status: 409 });

  let doc;
  try {
    doc = await fetchFlowAccountDoc(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "อ่านเอกสารไม่สำเร็จ" }, { status: 502 });
  }
  const dup = [order.flowAccount?.docNo, order.taxInvoice?.docNo, ...(order.flowAccountExtras ?? []).map((x) => x.docNo)].filter(Boolean);
  if (dup.includes(doc.docNo)) return NextResponse.json({ error: `${doc.docTypeLabel} ${doc.docNo} ผูกกับใบนี้อยู่แล้ว` }, { status: 409 });
  if (doc.customer.taxId && order.taxInvoice?.taxId && doc.customer.taxId !== order.taxInvoice.taxId)
    return NextResponse.json({ error: `เลขผู้เสียภาษีในเอกสาร (${doc.customer.taxId}) ไม่ตรงกับใบนี้ (${order.taxInvoice.taxId}) — ลิงก์ผิดใบหรือเปล่า` }, { status: 409 });
  const grandTotal = r2(Number(doc.grandTotal ?? doc.net ?? 0));
  if (mode === "charge" && !(grandTotal > 0)) return NextResponse.json({ error: "อ่านยอดรวมทั้งสิ้นของเอกสารไม่ได้ — ลองแนบแบบอ้างอิงแทน" }, { status: 422 });

  const now = new Date().toISOString();
  const lines = doc.items.slice(0, 6).map((it) => `${it.name}${it.qty ? ` ×${it.qty}` : ""}${it.unitPrice != null ? ` @${thb(it.unitPrice)}` : ""}`);
  const extra: FlowAccountExtraDoc = {
    url,
    docType: doc.docType,
    docTypeLabel: doc.docTypeLabel,
    docNo: doc.docNo,
    date: doc.date,
    subtotal: doc.subtotal,
    vat: doc.vat,
    grandTotal,
    wht: doc.wht,
    net: doc.net,
    lines,
    by: who,
    at: now,
  };

  if (mode === "charge") {
    const label = String(body.label ?? "").trim().slice(0, 80) || `บิลเพิ่ม ${doc.docTypeLabel} ${doc.docNo}${lines[0] ? ` — ${lines[0]}` : ""}`.slice(0, 80);
    const charge: OrderCharge = { id: newChargeId(), label, amount: grandTotal, note: `ตาม${doc.docTypeLabel} ${doc.docNo} · ${url}`, by: who, at: now };
    const applied = applyCharge(order, charge, who, { extraDoc: extra });
    const { error } = await updateOrder(sb, applied.order);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const link = orderLink(new URL(req.url).origin, applied.order);
    inBackground("notifyCustomerLogged", notifyCustomerLogged(sb, applied.order, chargeNotice(applied, charge, link, { ...extra, chargeId: charge.id }), `แจ้งบิลเพิ่ม ${doc.docNo} ${thb(grandTotal)} บาท`, "key"));
    return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, applied.order), extra: { ...extra, chargeId: charge.id }, reopen: applied.reopen });
  }

  let linked: FlowAccountExtraDoc = extra;
  if (mode === "link") {
    const chargeId = String(body.chargeId ?? "").trim();
    const c = (order.charges ?? []).find((x) => x.id === chargeId);
    if (!c) return NextResponse.json({ error: "ไม่พบรายการเก็บเพิ่มที่จะผูก" }, { status: 404 });
    if ((order.flowAccountExtras ?? []).some((x) => x.chargeId === c.id)) return NextResponse.json({ error: "รายการเก็บเพิ่มนี้ผูกบิลไว้แล้ว" }, { status: 409 });
    linked = { ...extra, chargeId: c.id };
  }
  const updated = withLog(
    { ...order, flowAccountExtras: [...(order.flowAccountExtras ?? []), linked] },
    who,
    `แนบบิลเพิ่ม ${doc.docTypeLabel} ${doc.docNo}`,
    `${thb(grandTotal)} บาท${mode === "link" ? ` · ผูกกับรายการเก็บเพิ่มเดิม (${(order.charges ?? []).find((x) => x.id === linked.chargeId)?.label ?? linked.chargeId})` : " · อ้างอิงอย่างเดียว ไม่คิดเงินเพิ่ม"} · ฝ่ายแพ็คต้องใส่ใบกำกับ ${1 + (order.flowAccountExtras?.length ?? 0) + 1} ใบ`
  );
  const { error } = await updateOrder(sb, updated);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, updated), extra: linked, reopen: false });
}

export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  if (!can(gate.actor, "orders.money", await loadRolePerms())) return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์เรื่องเงินของออเดอร์" }, { status: 403 });
  const who = gate.actor.name?.trim() || gate.actor.username;
  const body = (await req.json().catch(() => ({}))) as { orderId?: string; docNo?: string };
  const orderId = String(body.orderId ?? "").trim();
  const docNo = String(body.docNo ?? "").trim();
  if (!orderId || !docNo) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  const x = (order.flowAccountExtras ?? []).find((d) => d.docNo === docNo);
  if (!x) return NextResponse.json({ error: "ไม่พบบิลเพิ่มใบนี้" }, { status: 404 });
  const c = x.chargeId ? (order.charges ?? []).find((k) => k.id === x.chargeId) : undefined;
  const rest = (order.flowAccountExtras ?? []).filter((d) => d.docNo !== docNo);
  const updated = withLog(
    { ...order, flowAccountExtras: rest.length ? rest : undefined },
    who,
    `ถอดบิลเพิ่ม ${x.docTypeLabel} ${x.docNo}`,
    c ? `รายการเก็บเพิ่ม "${c.label}" ${thb(c.amount)} บาท ยังอยู่ — ถ้าไม่เก็บแล้วให้ถอดที่ปุ่มเก็บเพิ่ม` : undefined
  );
  const { error } = await updateOrder(sb, updated);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, updated) });
}
