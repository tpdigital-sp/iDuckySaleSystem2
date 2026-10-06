import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/admin-data";
import { lineTargetOf, noticeFlex, notifyCustomerLogged } from "@/lib/server/notify";
import { fetchTaxInvoicesOfMonth, fetchTaxInvoicesSince, type SalesReportRow } from "@/lib/server/flowaccount-api";
import {
  WHT_PAYEE,
  WHT_RATE_DEFAULT,
  normCompany,
  thShortDate,
  whtAmountOf,
  whtStatusOf,
  type WhtCert,
  type WhtCertView,
} from "@/lib/wht";

export const WHT_TABLE = "wht_certs";
/** bucket ส่วนตัว — ใบหัก/สลิปโอนคืนมีเลขบัญชีลูกค้า เปิดผ่าน signed url เท่านั้น */
export const WHT_BUCKET = "wht-docs";
export const WHT_FILE_PATH_RE = /^wht\/[A-Z0-9]+\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

export function isMissingTable(error: { code?: string; message: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message);
}

/** ออเดอร์ที่มีเอกสาร FlowAccount/ใบกำกับ — เฉพาะช่องที่ใช้จับคู่ (ไม่ขนทั้งก้อน) */
interface OrderLite {
  id: string;
  date?: string;
  fa?: Order["flowAccount"];
  ti?: Order["taxInvoice"];
  ex?: Order["flowAccountExtras"];
  wht?: Order["wht"];
  line?: string;
  cust?: string;
  name?: string;
}

async function loadOrdersLite(sb: SupabaseClient): Promise<OrderLite[]> {
  const out: OrderLite[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("orders")
      .select("id,date:data->>date,fa:data->flowAccount,ti:data->taxInvoice,ex:data->flowAccountExtras,wht:data->wht,line:data->>lineUserId,cust:data->>customerId,name:data->customer->>name")
      .or("data->flowAccount.not.is.null,data->taxInvoice.not.is.null")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as OrderLite[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const near = (a: number | undefined, b: number) => a != null && Math.abs(a - b) < 1;

/**
 * จับคู่ INV → ออเดอร์ในระบบ
 * 1) เลขเอกสารอ้างอิง (QT/BL ที่แปลงมาเป็น INV) ตรงกับเอกสารในออเดอร์ — แม่นสุด
 * 2) เลขผู้เสียภาษีเดียวกัน + ยอดตรง (±1 บาท) · 3) ชื่อบริษัทเดียวกัน + ยอดตรง
 *    (ใบวางบิล BL ที่ออกต่อจาก QT ในแอป FlowAccount — ระบบเราไม่เคยเห็นเลข BL นั้น)
 * ส่งไลน์: ใช้ออเดอร์ที่จับคู่ได้ ถ้าไม่มี/ไม่มีไลน์ → ใบล่าสุดของลูกค้าเลขผู้เสียภาษีเดียวกันที่มีไลน์
 */
function matcher(orders: OrderLite[]) {
  const byDoc = new Map<string, OrderLite[]>();
  const add = (k: string | undefined, o: OrderLite) => {
    if (!k) return;
    const key = k.toUpperCase();
    const arr = byDoc.get(key) ?? [];
    if (!arr.includes(o)) arr.push(o);
    byDoc.set(key, arr);
  };
  for (const o of orders) {
    add(o.fa?.docNo, o);
    add(o.fa?.itemsFrom?.docNo, o);
    add(o.fa?.deposit?.refDocNo, o);
    add(o.ti?.docNo, o);
    for (const x of o.ex ?? []) add(x.docNo, o);
  }
  const amountHit = (o: OrderLite, total: number) => near(o.fa?.grandTotal, total) || (o.ex ?? []).some((x) => near(x.grandTotal, total));
  const hasLine = (o: OrderLite) => !!(o.line || o.cust);
  const newest = (list: OrderLite[]) => [...list].sort((a, b) => b.id.localeCompare(a.id))[0];

  return (r: Pick<SalesReportRow, "refDoc" | "refNo" | "depositRef" | "taxId" | "company" | "total">) => {
    let hits: OrderLite[] = [];
    let by: WhtCert["matchedBy"];
    for (const k of [r.refDoc, r.refNo, r.depositRef]) for (const o of byDoc.get((k ?? "").toUpperCase()) ?? []) if (!hits.includes(o)) hits.push(o);
    if (hits.length) by = "ref";
    const sameTax = r.taxId ? orders.filter((o) => o.ti?.taxId?.replace(/\D/g, "") === r.taxId!.replace(/\D/g, "")) : [];
    const nm = normCompany(r.company);
    const sameName = nm ? orders.filter((o) => normCompany(o.ti?.company || o.name) === nm) : [];
    if (!hits.length) {
      const t = sameTax.filter((o) => amountHit(o, r.total));
      if (t.length === 1) [hits, by] = [t, "taxId"];
    }
    if (!hits.length) {
      const n = sameName.filter((o) => amountHit(o, r.total));
      if (n.length === 1) [hits, by] = [n, "name"];
    }
    const lineOrder = hits.find(hasLine) ?? newest(sameTax.filter(hasLine)) ?? newest(sameName.filter(hasLine));
    return {
      orderIds: hits.map((o) => o.id),
      matchedBy: by,
      // ไม่มีไลน์ก็ยังจำใบงานไว้ — พนักงานผูก LINE ที่ใบงานทีหลังแล้วทวงได้เลย (refreshLineFlags เช็คสดตอนเปิดหน้า)
      lineOrderId: lineOrder?.id ?? hits[0]?.id,
      hasLine: !!lineOrder,
      groupKey: lineOrder?.line || (r.taxId ? `tax:${r.taxId}` : `name:${nm}`),
      /** ใบงานอื่นของลูกค้าเดียวกัน (เลขผู้เสียภาษี/ชื่อ) เคยหัก ณ ที่จ่าย — ใช้แนะนำตอนยังไม่ระบุ */
      hintWht: [...sameTax, ...sameName].some((o) => (o.wht?.amount ?? 0) > 0),
      /** ออเดอร์ที่จับคู่บอกว่าหัก ณ ที่จ่ายไหม (ไม่มีออเดอร์ = ไม่รู้) */
      orderMode: hits.length ? (hits.some((o) => (o.wht?.amount ?? 0) > 0) ? ("wht" as const) : ("none" as const)) : undefined,
    };
  };
}

/** บันทึกแถวที่ดึงจาก FlowAccount — ใบเดิมอัปเดตเฉพาะข้อมูลจาก FlowAccount + ผลจับคู่ · ของที่พนักงานทำไว้ (หัก/ใบหัก/โอนคืน/ทวง) คงเดิม */
export async function importSalesRows(sb: SupabaseClient, rows: SalesReportRow[]): Promise<{ added: number; updated: number; matched: number; months: string[] }> {
  const orders = await loadOrdersLite(sb);
  const match = matcher(orders);
  const ids = rows.map((r) => r.docNo);
  const existing = new Map<string, WhtCert>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from(WHT_TABLE).select("data").in("id", ids.slice(i, i + 200));
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    for (const d of data ?? []) existing.set((d.data as WhtCert).id, d.data as WhtCert);
  }
  const now = new Date().toISOString();
  let added = 0;
  let matched = 0;
  const months = new Set<string>();
  const upserts = rows.map((r) => {
    const prev = existing.get(r.docNo);
    const m = match(r);
    if (m.orderIds.length) matched++;
    if (!prev) added++;
    const keepManual = prev?.matchedBy === "manual";
    const month = r.date.slice(0, 7);
    months.add(month);
    const c: WhtCert = {
      ...(prev ?? { rate: WHT_RATE_DEFAULT, importedAt: now }),
      id: r.docNo,
      month,
      date: r.date,
      company: r.company,
      taxId: r.taxId,
      branch: r.branch,
      base: r.base,
      vat: r.vat,
      total: r.total,
      refDoc: r.refDoc ?? r.refNo,
      depositRef: r.depositRef,
      faStatus: r.status,
      ...(keepManual
        ? { orderIds: prev!.orderIds }
        : { orderIds: m.orderIds, matchedBy: m.matchedBy, lineOrderId: m.lineOrderId, hasLine: m.hasLine, groupKey: m.groupKey }),
      hintWht: m.hintWht || undefined,
      rate: prev?.rate ?? WHT_RATE_DEFAULT,
      updatedAt: now,
    } as WhtCert;
    // แถวที่ไม่มีข้อมูลหัก (ยังไม่รับชำระ) = คงค่าจาก FlowAccount ที่ดึงไว้เดิม (c.faWht มาจาก prev)
    if (r.wht) c.faWht = { ...r.wht, at: now };
    const fa = c.faWht;
    if (fa?.sure) {
      // FlowAccount บันทึกรับชำระแล้ว = ข้อมูลบัญชีจริง ทับทั้งการเดาและที่พนักงานเลือกเอง
      c.mode = fa.amount > 0 ? "wht" : "none";
      c.modeBy = "FlowAccount";
      if (fa.rate > 0) c.rate = fa.rate;
    } else if (!c.modeBy) {
      c.mode = fa && fa.amount > 0 ? "wht" : m.orderMode;
    }
    return { id: c.id, data: c };
  });
  for (let i = 0; i < upserts.length; i += 200) {
    const { error } = await sb.from(WHT_TABLE).upsert(upserts.slice(i, i + 200));
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
  }
  return { added, updated: rows.length - added, matched, months: [...months].sort() };
}

/**
 * 💬 เติม/เช็ค LINE ที่การ์ดทวงจะไปถึง (lineTo) — ใช้ lineTargetOf ตัวเดียวกับตอนส่งจริง
 * ใบงานผูก LINE ทีหลัง = เห็นเองตอนเปิดหน้า · แคช 24 ชม. แต่ถ้า lineUserId ในใบงานเปลี่ยนเช็คใหม่ทันที
 * ข้ามใบที่ไม่ต้องทวงแล้ว (ได้รับใบหัก/ไม่หัก/ยกเลิก) ที่ยังไม่เคยเช็ค — ลดคำขอไป LINE
 */
export async function refreshLineFlags(sb: SupabaseClient, certs: WhtCert[]): Promise<WhtCert[]> {
  const want = certs.filter((c) => c.lineOrderId && (c.lineTo || ["pending", "todo", "retro"].includes(whtStatusOf(c))));
  if (!want.length) return certs;
  const ids = [...new Set(want.map((c) => c.lineOrderId!))];
  const orders = new Map<string, Order>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.from("orders").select("id,data").in("id", ids.slice(i, i + 100));
    for (const r of data ?? []) orders.set(r.id as string, r.data as Order);
  }
  const DAY = 24 * 3600_000;
  const stale = want.filter((c) => {
    const o = orders.get(c.lineOrderId!);
    if (!o) return false;
    if (!c.lineTo) return true;
    if (o.lineUserId && o.lineUserId !== c.lineTo.id) return true;
    return Date.now() - new Date(c.lineTo.at).getTime() > DAY;
  });
  if (!stale.length) return certs;

  // ใบงานเดียวกันหลาย INV = ถาม LINE ครั้งเดียว
  const byOrder = new Map<string, Promise<WhtCert["lineTo"] | null>>();
  const resolve = (o: Order) => {
    let p = byOrder.get(o.id);
    if (!p) {
      p = (async () => {
        const t = await lineTargetOf(sb, o);
        if (!t) return null;
        const own = t.via === "bound" && o.lineProfile?.name ? o.lineProfile : null;
        const prof = own ? { displayName: own.name, pictureUrl: own.picture } : await lineProfile(t.id);
        return { id: t.id, via: t.via, at: new Date().toISOString(), ...(prof?.displayName ? { name: prof.displayName.slice(0, 60) } : {}), ...(prof?.pictureUrl ? { picture: prof.pictureUrl } : {}) };
      })();
      byOrder.set(o.id, p);
    }
    return p;
  };

  const fixed = new Map<string, WhtCert>();
  for (let i = 0; i < stale.length; i += 8) {
    await Promise.all(
      stale.slice(i, i + 8).map(async (c) => {
        const lt = await resolve(orders.get(c.lineOrderId!)!);
        const next: WhtCert = { ...c, hasLine: !!lt, groupKey: lt?.id ?? c.groupKey };
        if (lt) next.lineTo = lt;
        else delete next.lineTo;
        await saveCert(sb, next);
        fixed.set(c.id, next);
      })
    );
  }
  return certs.map((c) => fixed.get(c.id) ?? c);
}

/** โปรไฟล์ LINE (ชื่อ+รูป) จาก Messaging API — ลูกค้าต้องเป็นเพื่อนกับ OA · ไม่ได้ก็ไม่เป็นไร */
async function lineProfile(userId: string): Promise<{ displayName?: string; pictureUrl?: string } | null> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    return r.ok ? ((await r.json()) as { displayName?: string; pictureUrl?: string }) : null;
  } catch {
    return null;
  }
}

/** จับคู่ใบเดียวใหม่ (พนักงานผูกออเดอร์เอง) — คืนช่องไลน์/กลุ่มที่ต้องอัปเดต */
export async function relinkCert(sb: SupabaseClient, c: WhtCert, orderId: string): Promise<Partial<WhtCert> | { error: string }> {
  const { data } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  const o = data?.data as Order | undefined;
  if (!o) return { error: `ไม่พบออเดอร์ ${orderId}` };
  const target = await lineTargetOf(sb, o);
  return {
    orderIds: [o.id],
    matchedBy: "manual",
    lineOrderId: target ? o.id : c.lineOrderId,
    hasLine: !!target || !!c.hasLine,
    groupKey: target?.id ?? c.groupKey,
    lineTo: undefined,
    ...(!c.modeBy ? { mode: (o.wht?.amount ?? 0) > 0 ? ("wht" as const) : ("none" as const) } : {}),
  };
}

export async function loadCert(sb: SupabaseClient, id: string): Promise<WhtCert | null> {
  const { data } = await sb.from(WHT_TABLE).select("data").eq("id", id).maybeSingle();
  return (data?.data as WhtCert) ?? null;
}

export async function saveCert(sb: SupabaseClient, c: WhtCert): Promise<string | null> {
  const { error } = await sb.from(WHT_TABLE).update({ data: { ...c, updatedAt: new Date().toISOString() } }).eq("id", c.id);
  return error?.message ?? null;
}

/** เซ็น URL ไฟล์ (1 ชม.) ให้หน้าเว็บเปิดดูได้ */
export async function withFileUrls(sb: SupabaseClient, certs: WhtCert[]): Promise<WhtCertView[]> {
  const paths = certs.flatMap((c) => [...(c.certFiles ?? []), ...(c.refundSlips ?? [])]);
  if (!paths.length) return certs;
  const { data } = await sb.storage.from(WHT_BUCKET).createSignedUrls(paths, 3600);
  const url = new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
  return certs.map((c) => {
    const own = [...(c.certFiles ?? []), ...(c.refundSlips ?? [])].filter((p) => url.has(p));
    return own.length ? { ...c, files: Object.fromEntries(own.map((p) => [p, url.get(p)!])) } : c;
  });
}

export async function uploadWhtFile(sb: SupabaseClient, certId: string, bytes: Uint8Array, contentType: string, ext: string): Promise<{ path: string } | { error: string }> {
  const path = `wht/${certId}/${crypto.randomUUID()}.${ext}`;
  const up = () => sb.storage.from(WHT_BUCKET).upload(path, bytes, { contentType, upsert: false });
  let { error } = await up();
  if (error && /bucket not found|related resource does not exist/i.test(error.message)) {
    await sb.storage.createBucket(WHT_BUCKET, { public: false, fileSizeLimit: `${5 * 1024 * 1024}` });
    ({ error } = await up());
  }
  return error ? { error: error.message } : { path };
}

const baht = (n: number) => `${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;

/** การ์ดทวงใบหัก — 1 ใบต่อลูกค้า 1 คน (ไลน์เดียว) สรุปทุก INV ที่ร้านยังไม่ได้รับใบหัก */
export function whtAskCard(certs: WhtCert[]) {
  const companies = [...new Set(certs.map((c) => c.company))];
  const sum = certs.reduce((s, c) => s + whtAmountOf(c), 0);
  const list = certs.map((c) => `${c.id} · ${thShortDate(c.date)} · หัก ${baht(whtAmountOf(c))}${companies.length > 1 ? ` (${c.company})` : ""}`);
  const note = `รบกวนออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ในนาม ${WHT_PAYEE.name} เลขผู้เสียภาษี ${WHT_PAYEE.taxId} แล้วส่งรูป/ไฟล์ในแชทนี้ หรือส่งตัวจริงมาที่ร้านได้เลยค่ะ ขอบคุณค่ะ 🙏`;
  return noticeFlex({
    tone: "whtAsk",
    head: "ขอใบหัก ณ ที่จ่าย",
    headline: `ร้านยังไม่ได้รับใบหัก ณ ที่จ่ายของใบกำกับภาษี ${certs.length} ใบนี้ค่ะ`,
    id: companies.length === 1 ? companies[0] : `${companies.length} บริษัท`,
    hero: { label: `ยอดหัก ณ ที่จ่ายรวม ${certs.length} ใบ`, value: baht(Math.round(sum * 100) / 100) },
    // กรมท่า (หัว) + ทอง (ยอดเงิน) — จริงจังแบบเอกสารทางการ แต่ยอดเด่นพอให้ตาไปหาก่อน (เจ้าของร้านเลือก 6 ต.ค. 69)
    heroColors: ["#FEF3C7", "#78350F"],
    bullets: list.slice(0, 20).concat(list.length > 20 ? [`และอีก ${list.length - 20} ใบ`] : []),
    note,
    alt: `ขอใบหัก ณ ที่จ่ายค่ะ — ร้านยังไม่ได้รับใบหักของใบกำกับภาษี ${certs.map((c) => c.id).join(", ")} (รวมหัก ${baht(sum)}) ${note}`,
  });
}

async function lineDisplayName(userId: string): Promise<string | undefined> {
  return (await lineProfile(userId))?.displayName?.slice(0, 60);
}

/**
 * 📣 ทวงใบหัก — รวมตามไลน์ลูกค้า: 1 คนสั่งหลายใบ = ข้อความเดียวสรุปทุกเลข INV
 * ส่งผ่านออเดอร์ (notifyCustomerLogged → ลงประวัติออเดอร์ + เคารพที่ลูกค้าปิดรับแจ้งเตือน)
 */
export async function remindCerts(sb: SupabaseClient, certs: WhtCert[], by: string): Promise<{ sent: number; failed: { ids: string[]; reason: string }[]; updated: WhtCert[]; sentTo: string[] }> {
  const ready = certs.filter((c) => whtStatusOf(c) === "pending" && c.lineOrderId);
  const orderIds = [...new Set(ready.map((c) => c.lineOrderId!))];
  const orders = new Map<string, Order>();
  for (let i = 0; i < orderIds.length; i += 100) {
    const { data } = await sb.from("orders").select("id,data").in("id", orderIds.slice(i, i + 100));
    for (const r of data ?? []) orders.set(r.id as string, r.data as Order);
  }
  const groups = new Map<string, { order: Order; certs: WhtCert[]; lineId: string }>();
  const failed: { ids: string[]; reason: string }[] = [];
  for (const c of ready) {
    const o = orders.get(c.lineOrderId!);
    const target = o ? await lineTargetOf(sb, o) : null;
    if (!o || !target) {
      failed.push({ ids: [c.id], reason: "ยังไม่ได้ผูก LINE ของลูกค้า" });
      continue;
    }
    const g = groups.get(target.id) ?? { order: o, certs: [], lineId: target.id };
    g.certs.push(c);
    groups.set(target.id, g);
  }
  const now = new Date().toISOString();
  const updated: WhtCert[] = [];
  const sentTo: string[] = [];
  let sent = 0;
  for (const g of groups.values()) {
    const ids = g.certs.map((c) => c.id);
    const r = await notifyCustomerLogged(sb, g.order, whtAskCard(g.certs), `ทวงใบหัก ณ ที่จ่าย ${ids.join(", ")}`);
    if (r.ok) sent++;
    else failed.push({ ids, reason: r.reason ?? "ส่งไม่สำเร็จ" });
    const to = r.ok ? await lineDisplayName(g.lineId) : undefined;
    if (to) sentTo.push(to);
    for (const c of g.certs) {
      const entry = { at: now, by, ok: r.ok, ...(r.reason ? { reason: r.reason } : {}), ...(to ? { to } : {}) };
      const next: WhtCert = { ...c, reminders: [...(c.reminders ?? []), entry].slice(-20) };
      await saveCert(sb, next);
      updated.push(next);
    }
  }
  return { sent, failed, updated, sentTo };
}

/** แถวพิเศษในตาราง wht_certs จำเวลาดึงล่าสุด (ไม่มี data.month → ไม่โผล่ในรายการเดือน) */
const SYNC_ROW = "__sync__";

export interface WhtSyncInfo {
  at: string;
  by: string;
  months: string[];
  total: number;
  error?: string;
}

export async function lastSyncInfo(sb: SupabaseClient): Promise<WhtSyncInfo | null> {
  const { data } = await sb.from(WHT_TABLE).select("data").eq("id", SYNC_ROW).maybeSingle();
  return (data?.data as WhtSyncInfo) ?? null;
}

const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * 🔄 ดึงจาก FlowAccount แล้วบันทึก — month ไม่ส่ง = เดือนนี้ + เดือนก่อน (ใบเดือนก่อนมักรับเงิน/บันทึกหักในเดือนถัดไป)
 * ใช้ทั้ง cron ทุก 5 นาที (wht-sync) และปุ่ม "ดึงตอนนี้" บนหน้าเว็บ · FlowAccount ไม่มี webhook → นี่คือ "เกือบ realtime"
 */
export async function syncFromFlowAccount(sb: SupabaseClient, by: string, month?: string) {
  const now = new Date(Date.now() + 7 * 3600_000); // เวลาไทย
  const prev = ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  try {
    const rows = month ? await fetchTaxInvoicesOfMonth(month) : await fetchTaxInvoicesSince(prev);
    const r = rows.length ? await importSalesRows(sb, rows) : { added: 0, updated: 0, matched: 0, months: month ? [month] : [] };
    const info: WhtSyncInfo = { at: new Date().toISOString(), by, months: month ? [month] : [prev, ym(now)], total: rows.length };
    await sb.from(WHT_TABLE).upsert({ id: SYNC_ROW, data: info });
    return {
      ...r,
      total: rows.length,
      wht: rows.filter((x) => x.wht?.sure && x.wht.amount > 0).length,
      noWht: rows.filter((x) => x.wht?.sure && !(x.wht.amount > 0)).length,
    };
  } catch (e) {
    const prevInfo = await lastSyncInfo(sb).catch(() => null);
    await sb.from(WHT_TABLE).upsert({ id: SYNC_ROW, data: { ...(prevInfo ?? { at: "", by, months: [], total: 0 }), error: `${new Date().toISOString()} ${(e as Error).message}` } });
    throw e;
  }
}
