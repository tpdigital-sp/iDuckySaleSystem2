import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { ORDER_STATUSES, orderBilledTotal, orderWhtAmount, withLog, type Order } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";
import { fetchFlowAccountDoc } from "@/lib/server/flowaccount";
import { pushShopAlert } from "@/lib/server/line-alert";

export const runtime = "nodejs";
export const maxDuration = 60;

/** ใบที่ยังต้องทำงาน — ส่งของ/จบ/ยกเลิกแล้วไม่ต้องตาม (เงินไม่ขยับแล้ว) */
const OPEN_STATUSES = ORDER_STATUSES.filter((s) => s !== "จัดส่งแล้ว" && s !== "เสร็จสิ้น" && s !== "ยกเลิก");
/** กันเวลาหมดก่อนตอบ (maxDuration 60 วิ) — ใบที่เหลือรอบหน้าค่อยตาม (เรียงใบใหม่สุดก่อนเสมอ) */
const BUDGET_MS = 45_000;
/** อ่านเอกสารพร้อมกันกี่ใบ — FlowAccount ตอบช้า 1-2 วิต่อใบ */
const WORKERS = 5;
/** ใบเดียวช้าเกินนี้ = ข้าม ไม่ให้กินเวลาใบอื่น */
const DOC_TIMEOUT_MS = 12_000;

const eq = (a = 0, b = 0) => Math.abs(a - b) < 0.01;
const thb = (n?: number) => (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * 📄🔍 ตามดูว่า "เอกสารในแอป FlowAccount ถูกแก้หลังสร้างออเดอร์แล้วหรือยัง" — รันจาก netlify/functions/flowaccount-check.mjs
 *
 * ทำไมต้องมี (OD-260921-5230 · 22 ก.ย. 69): บิลจริงออกที่ FlowAccount แต่ระบบนี้เก็บเอกสารเป็น "ภาพนิ่ง ณ ตอนเปิดออเดอร์"
 * ใบเสนอราคา QT010705 ถูกแก้ทีหลัง (เพิ่มหัก ณ ที่จ่าย 3% ฿180 — รวมทั้งสิ้นเท่าเดิม แต่ลูกค้าโอนจริงน้อยลง ฿180)
 * ไม่มีอะไรอ่านเอกสารซ้ำเอง กว่าจะรู้ก็ตอนเงินเข้าไม่ตรง → SlipOK ตัดสินผิด + ยอดในใบเพี้ยนตามมาทั้งสาย
 * วัดจริงวันนั้น: 45 ใบล่าสุด เอกสารเปลี่ยนหลังสร้างออเดอร์ 4 ใบ (3 ใน 4 คือเพิ่มหัก ณ ที่จ่าย)
 *
 * ตัวนี้แค่ "ตรวจแล้วติดธง + แจ้งกลุ่มไลน์ร้าน" — ไม่แตะยอดเงินเอง ให้แอดมินกด "🔄 เทียบกับเอกสารล่าสุด"
 * แล้วซิงก์เองในหน้าออเดอร์ (จะได้เห็นก่อนว่าตัวเลขไหนเปลี่ยน · ดู FlowAccountSync)
 *
 * ?key= (CRON_SECRET) กันคนนอก · ?dry=1 = ดูเฉย ๆ ไม่เขียน/ไม่แจ้ง · ?limit= จำกัดจำนวนใบ
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret)
    return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const db = sb; // TS: กันชนิด null หลุดเข้าไปใน worker ด้านล่าง
  const dry = url.searchParams.get("dry") === "1";
  const limit = Math.max(1, Number(url.searchParams.get("limit")) || 200);

  const { data, error } = await sb
    .from("orders")
    .select("id,data")
    .not("data->flowAccount", "is", null)
    .in("data->>status", OPEN_STATUSES);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ใบใหม่สุดก่อน — เงินของใบใหม่ยังขยับอยู่ ถ้าเวลาหมดกลางทางใบเก่าค่อยตามรอบหน้า
  const orders = (data ?? [])
    .map((r) => r.data as Order)
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .slice(0, limit);

  const started = Date.now();
  const changed: { id: string; docNo: string; customer: string; was: string; now: string; mismatch: boolean }[] = [];
  const cleared: string[] = [];
  const failed: { id: string; error: string }[] = [];
  let checked = 0;
  const queue = [...orders];

  async function worker() {
    for (;;) {
      if (Date.now() - started > BUDGET_MS) return;
      const o = queue.shift();
      if (!o) return;
      const fa = o.flowAccount;
      if (!fa?.url) continue;
      let doc;
      try {
        doc = await Promise.race([
          fetchFlowAccountDoc(fa.url),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("อ่านเอกสารนานเกินไป")), DOC_TIMEOUT_MS)),
        ]);
      } catch (e) {
        failed.push({ id: o.id, error: e instanceof Error ? e.message : "อ่านเอกสารไม่สำเร็จ" });
        continue;
      }
      checked++;
      // ใบมัดจำเก็บ "มูลค่างานเต็ม" ไว้ในช่องหลัก — เทียบกับก้อนเดียวกันเสมอ (ดู api/admin/orders/flowaccount)
      const dep = doc.deposit;
      const docTotal = dep?.fullGrandTotal ?? doc.grandTotal;
      const docWht = dep?.fullWht ?? doc.wht;
      const same = eq(docTotal, fa.grandTotal) && eq(docWht, fa.wht);

      if (same) {
        // เคยติดธงไว้แล้วแอดมินซิงก์จนตรง (หรือเอกสารถูกแก้กลับ) → ปลดธงเอง ไม่ต้องให้ใครมากด
        if (!fa.docChanged) continue;
        cleared.push(o.id);
        if (!dry) await updateOrder(db, { ...o, flowAccount: { ...fa, docChanged: undefined } }, { prev: o, by: "ระบบ" });
        continue;
      }

      // ติดธงซ้ำด้วยตัวเลขเดิม = ไม่ต้องเขียน/ไม่ต้องแจ้งอีก (แจ้งครั้งเดียวต่อการเปลี่ยนหนึ่งครั้ง)
      if (fa.docChanged && eq(fa.docChanged.total, docTotal) && eq(fa.docChanged.wht, docWht)) continue;

      /*
       * แยกสองเรื่องให้ชัด ไม่งั้นคนอ่านการ์ดแจ้งเตือนแล้วแยกไม่ออกว่าใบไหนเงินเสี่ยงผิดจริง:
       *   mismatch = ตัวเลขที่ "ใช้คิดเงิน" ในใบ ยังไม่ตรงเอกสาร → ลูกค้าจะโอนคนละยอดกับที่ระบบรอ
       *   ไม่ mismatch = แอดมินแก้ตัวเลขตามใบด้วยมือไปแล้ว เหลือแค่ snapshot เก่า (flowAccount.net เพี้ยน → SlipOK เทียบผิด)
       */
      const mismatch = !eq(docTotal, orderBilledTotal(o)) || !eq(docWht, orderWhtAmount(o));

      const was = `ยอดใบ ${thb(fa.grandTotal)}${(fa.wht ?? 0) > 0 ? ` · หัก ณ ที่จ่าย ${thb(fa.wht)}` : ""}`;
      const now = `ยอดใบ ${thb(docTotal)}${(docWht ?? 0) > 0 ? ` · หัก ณ ที่จ่าย ${thb(docWht)}` : ""}`;
      changed.push({ id: o.id, docNo: fa.docNo, customer: o.customer, was, now, mismatch });
      if (dry) continue;
      const next = withLog(
        { ...o, flowAccount: { ...fa, docChanged: { at: new Date().toISOString(), total: docTotal, wht: docWht, mismatch } } },
        "ระบบ",
        "เอกสาร FlowAccount ถูกแก้หลังสร้างออเดอร์",
        `${fa.docTypeLabel} ${fa.docNo} · ในระบบ ${was} → ในเอกสาร ${now}` +
          (mismatch ? " · ⚠️ ยอดที่ใช้คิดเงินยังไม่ตรงเอกสาร" : " · ตัวเลขในใบตรงอยู่แล้ว เหลือจดยอดตามใบใหม่") +
          ' — เปิดใบแล้วกด "🔄 เทียบกับเอกสารล่าสุด" เพื่อซิงก์',
      );
      const w = await updateOrder(db, next, { prev: o, by: "ระบบ" });
      if (w.error) failed.push({ id: o.id, error: w.error.message });
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, () => worker()));

  // 📣 แจ้งกลุ่มไลน์ร้านครั้งเดียวต่อรอบ (เรื่องเงิน → กล่องแจ้งเตือนฝั่งการเงิน)
  let alert: string | undefined;
  if (changed.length && !dry) {
    const risky = changed.filter((c) => c.mismatch);
    const sorted = [...risky, ...changed.filter((c) => !c.mismatch)];
    const r = await pushShopAlert(
      {
        tone: "#B45309",
        title: "🧾 เอกสาร FlowAccount ถูกแก้",
        headline:
          risky.length > 0
            ? `${risky.length} ใบ ยอดที่ใช้คิดเงินยังไม่ตรงเอกสาร — ลูกค้าจะโอนคนละยอด เปิดใบแล้วกด “เทียบกับเอกสารล่าสุด”`
            : "ตัวเลขในใบตรงอยู่แล้ว เหลือกดจดยอดตามเอกสารใหม่ (ไม่งั้นตรวจสลิปเทียบกับยอดเก่า)",
        heroLabel: "ใบที่ต้องซิงก์",
        hero: `${changed.length.toLocaleString("th-TH")} ใบ`,
        bullets: sorted.map((c) => `${c.mismatch ? "⚠️ " : ""}${c.id} ${c.docNo} · ${c.was} → ${c.now}`),
        button: { label: "เปิดรายการออเดอร์", uri: "https://iduckystore.com/admin/orders" },
        alt: `🧾 เอกสาร FlowAccount ถูกแก้ ${changed.length} ใบ — ต้องซิงก์ยอด`,
      },
      { money: true },
    );
    alert = r.ok ? `ส่งแล้ว (${r.via})` : `ส่งไม่ได้: ${r.reason ?? "ไม่ทราบสาเหตุ"}`;
  }

  return NextResponse.json({
    ok: true,
    dry,
    scanned: orders.length,
    checked,
    left: queue.length,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    changed,
    cleared,
    failed,
    ...(alert ? { alert } : {}),
  });
}
