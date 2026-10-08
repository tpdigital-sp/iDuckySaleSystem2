import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order, SlipLookalike, SlipOcr } from "@/lib/admin-data";
import type { SlipOwner } from "@/lib/server/slip-dedupe";
import { callGemini } from "@/lib/server/ai-usage";

/**
 * 🤖 อ่านรูปสลิปที่ไม่มี QR ด้วย Gemini (3 ต.ค. 69)
 *
 * ทำไม: SlipOK อ่านจาก QR อย่างเดียว — สลิป K BIZ / "Payment Transaction Status Reports" ของ SCB /
 * แคปแถวรายการเดินบัญชีนิติบุคคล ไม่มี QR → ระบบไม่รู้ยอด/เวลา/เลขอ้างอิงเลย (ราว 8% ของสลิปทั้งหมด)
 * ลูกค้าส่งรูปเดิมแบบแคปใหม่/ผ่าน LINE (ไฟล์เปลี่ยน) ไปแนบอีกออเดอร์ ด่านกันซ้ำจึงไม่เห็น
 *
 * ผลที่ได้ใช้ 2 ทาง:
 *   - ref (เลขอ้างอิงธนาคารยาว ≥ 14 · ไม่ใช่แถวรายการเดินบัญชี) → ตั้งเป็น transRef ให้ด่านกันซ้ำชั้น 2 ตีตกได้เหมือนเลขจาก QR
 *   - ยอด + วัน/เวลาโอน → findSlipLookalikes "เตือน" ว่าอาจซ้ำกับออเดอร์ไหน (ไม่ตีตก — AI อ่านผิดได้)
 * ⚠️ ห้ามเอายอดที่ AI อ่านไปนับเงิน — เก็บแยกไว้ที่ slipVerify.ocr เท่านั้น
 */

const MODEL = "gemini-2.5-flash";
const OCR_TIMEOUT_MS = 15_000;

const PROMPT = `รูปนี้คือหลักฐานการโอนเงินที่ลูกค้าส่งให้ร้าน (สลิปโอน / รายงานธุรกรรมธนาคาร / แถวรายการเดินบัญชี)
อ่านแล้วตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น:
{"kind":"slip|report|statement|other","amount":number|null,"date":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"ref":string|null,"docRef":string|null,"payerName":string|null,"payerAccount":string|null,"receiverName":string|null,"receiverAccount":string|null,"bank":string|null}
กติกา:
- amount = ยอดเงินที่โอน (ตัวเลข ไม่มีจุลภาค) · ถ้ามีหลายรายการให้เอายอดของรายการที่โอนเข้าผู้รับ
- date = วันที่โอนจริง (Value Date / วันที่ทำรายการ) แปลง พ.ศ. เป็น ค.ศ. · time = เวลาโอน ถ้าไม่มีในรูปให้ null (ห้ามเดา ห้ามเอาเวลาพิมพ์รายงานมุมบน)
- ref = เลขอ้างอิงธุรกรรมของธนาคาร (Transaction Reference / เลขที่รายการ / Ref No.) · ห้ามใช้เลขลำดับสั้น ๆ เช่น 000007 · ห้ามใช้เลขบัญชีผู้โอน/ผู้รับ · ไม่มีให้ null
- เลข 10-12 หลักที่อยู่ในคอลัมน์บัญชี = เลขบัญชี ให้ใส่ payerAccount/receiverAccount ไม่ใช่ ref
- docRef = เลขเอกสารที่ผู้โอนใส่เป็นอ้างอิง เช่น QT010774 / INV-123 (ถ้ามี)
- payerAccount / receiverAccount = เลขบัญชีตามที่เห็น (ตัวเลข ไม่มีขีด ถ้าถูกปิดบางส่วนให้ใส่ x แทน)
- kind = other ถ้ารูปไม่ใช่หลักฐานการโอนเงิน`;

const digits = (s: string | undefined | null) => (s ?? "").replace(/\D/g, "");
const str = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** ทำความสะอาดผลจาก AI — ค่าที่รูปร่างผิดทิ้งหมด ดีกว่าเก็บของเพี้ยนไปเทียบ */
export function normalizeOcr(raw: Record<string, unknown>, now = new Date().toISOString(), around = now): SlipOcr | null {
  const kind = (["slip", "report", "statement", "other"] as const).find((k) => k === raw.kind);
  const amountN = typeof raw.amount === "number" ? raw.amount : Number(String(raw.amount ?? "").replace(/[^\d.]/g, ""));
  const amount = Number.isFinite(amountN) && amountN > 0 && amountN < 10_000_000 ? Math.round(amountN * 100) / 100 : undefined;

  let date: string | undefined;
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw.date ?? "").trim());
  if (dm) {
    let y = Number(dm[1]);
    if (y > 2400) y -= 543; // AI ลืมแปลง พ.ศ.
    if (y >= 2020 && y <= 2100) date = `${y}-${dm[2]}-${dm[3]}`;
  }
  /*
   * ปีต้องใกล้วันที่แนบ — สลิป K BIZ พิมพ์ปีสองหลัก "26" AI อ่านเป็น 2023/2021 (ย้อนหลัง 62 ใบ 3 ต.ค. 69 เจอ 9 ใบ)
   * ห่างวันแนบเกิน 60 วัน → ลองใช้ปีของวันแนบ (และปีก่อนหน้า กรณีแนบต้นปี) ถ้าเข้าเกณฑ์ใช้อันนั้น ไม่งั้นทิ้งวันที่ (ไม่เทียบดีกว่าเทียบผิด)
   */
  if (date) {
    const ref = Date.parse(around);
    const near = (d: string) => Math.abs(Date.parse(d) - ref) <= 60 * 86_400_000;
    if (Number.isFinite(ref) && !near(date)) {
      const y = new Date(ref).getUTCFullYear();
      date = [y, y - 1].map((yy) => `${yy}${date!.slice(4)}`).find(near);
    }
  }
  const tm = /^(\d{1,2}):(\d{2})/.exec(String(raw.time ?? "").trim());
  const time = tm && Number(tm[1]) < 24 ? `${tm[1].padStart(2, "0")}:${tm[2]}` : undefined;

  const payerAccount = str(raw.payerAccount, 30);
  const receiverAccount = str(raw.receiverAccount, 30);
  /*
   * เลขอ้างอิงต้องยาวพอจะไม่ซ้ำกันโดยบังเอิญ และต้องไม่ใช่เลขบัญชีที่ AI หยิบผิด
   * ⚠️ ทดสอบจริง 3 ต.ค. 69: แถวรายการเดินบัญชี KBANK ไม่มีเลขอ้างอิง AI หยิบ "เลขบัญชีผู้โอน" 1241107724 มาใส่แทน
   *    ถ้าใช้ตีตก = โอนครั้งถัดไปจากบัญชีเดิมโดนหาว่าซ้ำ → บังคับ ≥ 14 ตัว (เลขบัญชีไทย 10-12 หลัก · เลขอ้างอิงจริง 17-25)
   *    + เชื่อ ref เฉพาะสลิป/รายงานธนาคาร — แถวรายการเดินบัญชี/เอกสารอื่น (ใบสำคัญจ่าย PV…) ไม่เชื่อ
   */
  const refRaw = String(raw.ref ?? "").replace(/[\s-]/g, "");
  const accounts = [digits(payerAccount), digits(receiverAccount)].filter((a) => a.length >= 6);
  const ref =
    (kind === "slip" || kind === "report") && /^[A-Za-z0-9]{14,64}$/.test(refRaw) && /\d{6,}/.test(refRaw) && !accounts.some((a) => digits(refRaw).includes(a))
      ? refRaw
      : undefined;

  const out: SlipOcr = {
    at: now,
    ...(kind ? { kind } : {}),
    ...(amount ? { amount } : {}),
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
    ...(ref ? { ref } : {}),
    ...(str(raw.docRef, 40) ? { docRef: str(raw.docRef, 40)!.replace(/\s/g, "").toUpperCase() } : {}),
    ...(str(raw.payerName) ? { payerName: str(raw.payerName) } : {}),
    ...(payerAccount ? { payerAccount } : {}),
    ...(str(raw.receiverName) ? { receiverName: str(raw.receiverName) } : {}),
    ...(receiverAccount ? { receiverAccount } : {}),
    ...(str(raw.bank, 40) ? { bank: str(raw.bank, 40) } : {}),
  };
  return out.amount || out.ref || out.date ? out : null;
}

/** ส่งรูปให้ Gemini อ่าน — ไม่มีคีย์/ช้าเกิน/อ่านไม่ออก = null (ไม่ทำให้การแนบสลิปพัง) */
export async function readSlipImage(
  bytes: Uint8Array,
  contentType: string,
  attachedAt = new Date().toISOString(),
  timeoutMs = OCR_TIMEOUT_MS
): Promise<SlipOcr | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || bytes.length > 7 * 1024 * 1024) return null;
  try {
    const r = await callGemini({
      feature: "slip_ocr",
      model: MODEL,
      apiKey,
      body: {
        contents: [{ parts: [{ inline_data: { mime_type: contentType, data: Buffer.from(bytes).toString("base64") } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 600, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
      },
      timeoutMs: Math.max(3_000, timeoutMs),
    });
    if (!r.ok) {
      console.error("[slip-ocr] Gemini ตอบ", r.status, r.errorText.slice(0, 200));
      return null;
    }
    const text = (r.json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").replace(/```json\n?|```/g, "").trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? normalizeOcr(parsed, new Date().toISOString(), attachedAt) : null;
  } catch (e) {
    console.error("[slip-ocr] อ่านรูปไม่สำเร็จ:", (e as Error)?.message);
    return null;
  }
}

/** วัน/เวลาโอนแบบไทย (Asia/Bangkok) จาก ISO ของ SlipOK */
function bkk(iso: string | undefined): { date?: string; time?: string } {
  if (!iso) return {};
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return {};
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour").replace("24", "00")}:${g("minute")}` };
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const thDate = (d: string) => `${Number(d.slice(8, 10))} ${TH_MON[Number(d.slice(5, 7)) - 1]} ${String(Number(d.slice(0, 4)) + 543).slice(2)}`;
const thb = (n: number) => n.toLocaleString("th-TH", n % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined);

/** หน้าตาของสลิปหนึ่งใบที่ใช้เทียบ (จาก SlipOK หรือจาก AI) */
interface Probe {
  amount: number;
  date: string;
  time?: string;
  payerAccount?: string;
  docRef?: string;
}

type Verify = Order["slipVerify"];

function probeOf(v: Verify): Probe | null {
  if (!v) return null;
  const amount = v.amount ?? v.ocr?.amount;
  const t = v.transAt ? bkk(v.transAt) : { date: v.ocr?.date, time: v.ocr?.time };
  if (!amount || !t.date) return null;
  return { amount, date: t.date, time: t.time, payerAccount: v.ocr?.payerAccount, docRef: v.ocr?.docRef };
}

/** บัญชีผู้โอนตรงกัน — เทียบ 4 หลักท้ายที่ไม่ถูกปิด (เลขบัญชีบนสลิปมักโชว์ไม่ครบ) */
function sameAccount(a?: string, b?: string): boolean {
  const da = digits(a);
  const db = digits(b);
  return da.length >= 4 && db.length >= 4 && da.slice(-4) === db.slice(-4);
}

/**
 * ⚠️ หาสลิปในออเดอร์อื่นที่ "ยอดเท่ากัน + วันโอนเดียวกัน" (+ เวลาห่างไม่เกิน 2 นาที ถ้ามีเวลาทั้งคู่)
 * ค้นจากยอดที่ SlipOK อ่าน และยอดที่ AI อ่าน ทั้ง 3 ช่อง (ใบแรก/งวดหลัง/ใบเพิ่ม) แล้วกรองวันเวลาในโค้ด
 * ค้นไม่ได้ (DB ล่ม) = คืน [] — แค่เตือน ไม่ใช่ด่าน
 */
export async function findSlipLookalikes(sb: SupabaseClient, probe: Probe, self: SlipOwner): Promise<SlipLookalike[]> {
  const amt = String(Math.round(probe.amount * 100) / 100);
  if (!/^\d+(\.\d+)?$/.test(amt)) return [];
  const n = Number(amt);
  const mainQ = sb
    .from("orders")
    .select("id,data")
    .or(
      [
        `data->slipVerify->>amount.eq.${amt}`,
        `data->slipVerify->ocr->>amount.eq.${amt}`,
        `data->deposit->balanceVerify->>amount.eq.${amt}`,
        `data->deposit->balanceVerify->ocr->>amount.eq.${amt}`,
      ].join(",")
    )
    .limit(40);
  const extraQ1 = sb.from("orders").select("id,data").contains("data", { payments: [{ verify: { amount: n } }] }).limit(40);
  const extraQ2 = sb.from("orders").select("id,data").contains("data", { payments: [{ verify: { ocr: { amount: n } } }] }).limit(40);
  const results = await Promise.all([mainQ, extraQ1, extraQ2]);
  const rows = new Map<string, Order>();
  for (const r of results) {
    if (r.error) console.error("[slip-ocr] ค้นสลิปหน้าตาเหมือนไม่สำเร็จ:", r.error.message);
    for (const x of (r.data ?? []) as { id: string; data: Order }[]) rows.set(x.id, x.data);
  }

  const out: SlipLookalike[] = [];
  const check = (orderId: string, phase: SlipLookalike["phase"], v: Verify, paymentId?: string) => {
    if (orderId === self.orderId && phase === self.phase && (phase !== "extra" || paymentId === self.paymentId)) return;
    const o = probeOf(v);
    if (!o || Math.abs(o.amount - probe.amount) > 0.005) return;
    const acct = sameAccount(o.payerAccount, probe.payerAccount);
    const doc = !!o.docRef && o.docRef === probe.docRef;
    /*
     * วันต้องตรงกัน — ยกเว้นเลขเอกสาร/บัญชีผู้โอนตรงด้วย ยอมห่าง 1 วัน
     * (ทดสอบ 3 ต.ค. 69: แถวรายการเดินบัญชี KBANK มี 2 วัน 29/30 ก.ย. AI หยิบคนละวันในแต่ละรอบ → เดิมจับซ้ำไม่ได้)
     */
    const days = Math.abs(Date.parse(o.date) - Date.parse(probe.date)) / 86_400_000;
    if (!(days === 0 || (days <= 1 && (doc || acct)))) return;
    const bothTime = days === 0 && !!(o.time && probe.time);
    if (bothTime && Math.abs(minutes(o.time!) - minutes(probe.time!)) > 2) return;
    const level: SlipLookalike["level"] = bothTime || acct || doc ? "strong" : "weak";
    const why =
      (days === 0
        ? `ยอด ${thb(probe.amount)} · โอน ${thDate(probe.date)}${bothTime ? ` ${probe.time}` : ""} ตรงกัน`
        : `ยอด ${thb(probe.amount)} ตรงกัน · วันโอน ${thDate(o.date)} / ${thDate(probe.date)} (ห่าง 1 วัน)`) +
      (acct ? " · บัญชีผู้โอนเดียวกัน" : "") +
      (doc ? ` · อ้างอิง ${probe.docRef} เดียวกัน` : "") +
      (level === "weak" ? " (ไม่มีเวลาโอนให้เทียบ)" : "");
    out.push({ orderId, phase, ...(paymentId ? { paymentId } : {}), why, level });
  };
  for (const [id, o] of rows) {
    check(id, "first", o.slipVerify);
    check(id, "balance", o.deposit?.balanceVerify);
    for (const p of o.payments ?? []) if (!p.fromOrder) check(id, "extra", p.verify, p.id);
  }
  return out.slice(0, 5);
}

/** เลขเอกสารในรายการโอน (QT…) ไม่ตรงกับเลขบิลของใบนี้ → ข้อความเตือน · ใบที่ไม่มีบิล FlowAccount = ไม่เทียบ */
export function docRefMismatch(order: Order, docRef: string | undefined): string | undefined {
  if (!docRef || !/^[A-Z]{2,4}-?\d{4,}$/.test(docRef)) return undefined;
  const own = [order.flowAccount?.docNo, ...(order.flowAccountExtras ?? []).map((x) => x.docNo)]
    .filter((x): x is string => !!x)
    .map((x) => x.replace(/\s/g, "").toUpperCase());
  if (!own.length || own.includes(docRef)) return undefined;
  return `เลขอ้างอิงในรายการโอน ${docRef} ไม่ตรงกับบิลของใบนี้ (${own.join(", ")})`;
}
