import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { amountDueNow, orderTotal, withLog, type Order } from "@/lib/admin-data";
import { verifySlipWithSlipOK } from "@/lib/server/slipok";
import { notifyCustomer, orderLink } from "@/lib/server/notify";
import { reportPaidToTP } from "@/lib/server/tp-report";
import { cutStockForOrder } from "@/lib/server/stock";

export const runtime = "nodejs";

// bucket ส่วนตัว — สลิปมีเลขบัญชี/ยอดเงินลูกค้า ห้ามเปิด public · แอดมินดูผ่าน signed URL เท่านั้น
const BUCKET = "payment-slips-private";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * ลูกค้าแจ้งโอน (guest, public) → อัปโหลดรูปสลิปขึ้น Supabase Storage
 * แล้วผูกกับออเดอร์ + เปลี่ยนสถานะเป็น "รอตรวจสอบ" ให้แอดมินตรวจยอด
 *
 * ความปลอดภัย: อนุญาตแนบสลิปเฉพาะออเดอร์ที่ยัง "รอชำระเงิน/รอตรวจสอบ" เท่านั้น
 * (กันการเปลี่ยนออเดอร์ที่ยืนยันไปแล้ว) · path ใช้ UUID สุ่ม เดาไม่ได้
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart)" }, { status: 400 });
  }

  const orderId = String(form.get("orderId") ?? "").trim();
  const key = String(form.get("key") ?? "");
  const file = form.get("file");
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์สลิป" }, { status: 400 });

  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะ PNG / JPG / WEBP / GIF" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5MB" }, { status: 400 });

  // ดึงออเดอร์ก่อน — ต้องมีอยู่จริง และยังไม่ถูกยืนยันการชำระ
  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  // ยืนยันสิทธิ์ด้วยกุญแจลับ — กันคนเดาเลขออเดอร์แล้วแนบสลิปมั่ว
  // (ออเดอร์เก่าก่อนมีระบบ key จะไม่มี order.key → ข้ามการเช็ค เพื่อ backward-compat)
  if (order.key && order.key !== key)
    return NextResponse.json({ error: "ลิงก์แจ้งโอนไม่ถูกต้อง (รหัสออเดอร์ไม่ตรง)" }, { status: 403 });
  // ออเดอร์มัดจำที่ผ่านงวดแรกแล้ว → เปิดให้แนบสลิป "ยอดคงเหลือ" ได้แม้เข้าขั้นผลิตแล้ว
  const balancePhase = !!order.deposit && !!order.deposit.firstPaidAt && !order.deposit.settledAt;
  if (order.status === "ยกเลิก") return NextResponse.json({ error: "ออเดอร์นี้ถูกยกเลิกแล้ว" }, { status: 409 });
  if (!balancePhase && order.status !== "รอชำระเงิน" && order.status !== "รอตรวจสอบ")
    return NextResponse.json({ error: "ออเดอร์นี้ยืนยันการชำระเงินแล้ว ไม่ต้องแจ้งโอนซ้ำ" }, { status: 409 });

  // อัปโหลดสลิป (สร้าง bucket ให้อัตโนมัติถ้ายังไม่มี)
  const safeId = orderId.replace(/[^a-z0-9_-]/gi, "") || "misc";
  const path = `${safeId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });

  let { error: upErr } = await upload();
  if (upErr && /bucket not found/i.test(upErr.message)) {
    // สร้างเป็น bucket ส่วนตัว (public: false) — เปิดได้เฉพาะผ่าน signed URL
    await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: "5MB" });
    ({ error: upErr } = await upload());
  }
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // ── ตรวจสลิปอัตโนมัติกับ SlipOK (ถ้าตั้งค่าไว้) — เทียบ "ยอดงวดนี้" (มัดจำ/คงเหลือ/เต็ม) ──
  const expected = amountDueNow(order);
  const depositPhase = !!order.deposit && !order.deposit.firstPaidAt; // งวดแรกของออเดอร์มัดจำ
  const verify = await verifySlipWithSlipOK(bytes, file.type, expected);
  const now = new Date().toISOString();

  let updated: Order = {
    ...order,
    slipPath: path, // เก็บ path — ไม่เก็บ URL สาธารณะ
    slipUrl: undefined, // ล้างของเก่า (ถ้ามี) กันชี้ไปไฟล์ public เดิม
    paidReportedAt: now,
    ...(verify.status === "pass" || verify.status === "fail"
      ? { slipVerify: { status: verify.status, detail: verify.detail, amount: verify.amount, transRef: verify.transRef, at: now } }
      : { slipVerify: undefined }),
  };
  if (balancePhase) {
    // งวดหลังของออเดอร์มัดจำ — สถานะงานเดินต่อตามเดิม ไม่ถอยกลับไปรอตรวจสอบ
    if (verify.status === "pass") {
      updated = { ...updated, paidTotal: orderTotal(order), deposit: { ...order.deposit!, settledAt: now } };
      updated = withLog(updated, "SlipOK", "รับยอดคงเหลือครบแล้ว (อัตโนมัติ)", `ยอด ${verify.amount ?? expected} บาท${verify.transRef ? ` · อ้างอิง ${verify.transRef}` : ""}`);
    } else {
      updated = withLog(updated, "SlipOK", "สลิปยอดคงเหลือรอแอดมินตรวจ", verify.detail ?? "ตรวจอัตโนมัติไม่ได้");
    }
  } else {
    updated = {
      ...updated,
      // จำยอดที่รับ ณ งวดนี้ — ออเดอร์มัดจำเก็บแค่ยอดงวดแรกก่อน
      paidTotal: expected,
      // ผ่านการตรวจอัตโนมัติเท่านั้นถึงยืนยันให้เลย — นอกนั้นรอแอดมินตรวจตามเดิม
      status: verify.status === "pass" ? "ชำระแล้ว" : "รอตรวจสอบ",
      ...(depositPhase && verify.status === "pass" ? { deposit: { ...order.deposit!, firstPaidAt: now } } : {}),
    };
    if (verify.status === "pass")
      updated = withLog(
        updated,
        "SlipOK",
        depositPhase ? "ยืนยันมัดจำ 50% อัตโนมัติ" : "ยืนยันการชำระเงินอัตโนมัติ",
        `ยอด ${verify.amount ?? expected} บาท${verify.transRef ? ` · อ้างอิง ${verify.transRef}` : ""}`
      );
    else if (verify.status === "fail")
      updated = withLog(updated, "SlipOK", "สลิปตรวจไม่ผ่าน — รอแอดมินตรวจเอง", verify.detail ?? "");
  }

  const { error: saveErr } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  // ผ่านอัตโนมัติ → แจ้งลูกค้าทันทีเหมือนแอดมินกดยืนยันเอง (เงียบถ้ายังไม่ตั้งค่า LINE)
  if (verify.status === "pass") {
    const origin = new URL(req.url).origin;
    const link = orderLink(origin, updated);
    if (balancePhase) {
      void notifyCustomer(sb, updated, `✅ รับยอดคงเหลือออเดอร์ ${updated.id} ครบแล้ว ขอบคุณครับ\n${link}`);
      void reportPaidToTP(updated, "SlipOK อัตโนมัติ", { docSuffix: "-final", amount: expected, noteSuffix: "ยอดคงเหลือ 50% หลัง (ครบแล้ว)" });
    } else if (depositPhase) {
      const remain = orderTotal(updated) - (updated.paidTotal ?? 0);
      void notifyCustomer(sb, updated, `✅ รับมัดจำออเดอร์ ${updated.id} แล้ว เริ่มงานให้เลยครับ\nยอดคงเหลือ ${remain.toLocaleString()} บาท ชำระก่อนจัดส่ง\n${link}`);
      void reportPaidToTP(updated, "SlipOK อัตโนมัติ", { amount: expected, noteSuffix: "มัดจำ 50% งวดแรก" });
    } else {
      void notifyCustomer(sb, updated, `✅ ยืนยันการชำระเงินออเดอร์ ${updated.id} แล้ว กำลังเริ่มงานให้ครับ\n${link}`);
      void reportPaidToTP(updated, "SlipOK อัตโนมัติ"); // ส่งเข้า msVerify ระบบ Admin (fire-and-forget)
    }
    if (!balancePhase) void cutStockForOrder(updated); // ตัดสต๊อกวัสดุที่ผูกไว้ (มัดจำ = เริ่มงานแล้วก็ตัดเลย)
  }

  return NextResponse.json({ ok: true, verified: verify.status === "pass" });
}
