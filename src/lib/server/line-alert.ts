import "server-only";

/**
 * 📣 ส่งข้อความ "แจ้งร้าน" ทาง LINE — ที่เดียวของทั้งระบบ
 *
 * ใช้กับ 5 เรื่อง: ออเดอร์สั่งจำนวนมาก · ของใกล้หมด (cron) · ใบสมัครตัวแทน · เคลม · ยอดค้างงวด 2
 * เดิมแต่ละที่เขียนโค้ดยิง push เองซ้ำ ๆ 5 ชุด แก้ทีต้องไล่แก้ทุกที่ และข้อความ error ที่ LINE ตอบมา
 * ก็ถูกกลืนหายไปหมด — รวมมาไว้ที่นี่ที่เดียว
 *
 * ⚠️ คนละตัวกับ notifyCustomer ใน notify.ts ที่ใช้แจ้ง "ลูกค้า" — อันนั้นหาปลายทางจากออเดอร์
 *    ส่วนอันนี้ยิงเข้าห้องเดียวตายตัวตาม env
 *
 * ปลายทางตั้งที่ env บน Netlify:
 *   LINE_STOCK_ALERT_TO  — เรื่องทั่วไป
 *   LINE_ADMIN_ALERT_TO  — เรื่องเงิน (เคลม · ยอดค้างงวด 2) ไม่ตั้ง = ใช้ตัวบน
 * ใส่ userId (ขึ้นต้น U) = เข้าแชทส่วนตัว · groupId (ขึ้นต้น C) = เข้าไลน์กลุ่ม
 *
 * ⚠️ เลขห้องผูกกับ OA ที่รับ webhook — ต้องเป็นเลขของบัญชีเดียวกับ LINE_MESSAGING_ACCESS_TOKEN
 *    และบัญชีนั้นต้องอยู่ในกลุ่มนั้นจริง ไม่งั้น LINE ตอบ 403
 */

export interface AlertResult {
  ok: boolean;
  reason?: string;
}

export async function pushShopAlert(text: string, opts?: { money?: boolean }): Promise<AlertResult> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  const to = opts?.money
    ? process.env.LINE_ADMIN_ALERT_TO || process.env.LINE_STOCK_ALERT_TO
    : process.env.LINE_STOCK_ALERT_TO;
  if (!token || !to) return { ok: false, reason: "ยังไม่ได้ตั้งค่า LINE สำหรับแจ้งเตือนร้าน" };

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    // 403 = บัญชีไม่ได้อยู่ในห้องนั้น/ถูกบล็อก · 401 = token ผิดหรือหมดอายุ · 429 = โควตาหมด
    const hint =
      res.status === 403
        ? "บัญชีร้านไม่ได้อยู่ในห้องนั้น หรือถูกบล็อก"
        : res.status === 401
          ? "LINE token ไม่ถูกต้องหรือหมดอายุ"
          : res.status === 429
            ? "โควตาข้อความของเดือนนี้หมด"
            : body?.message || `LINE ตอบ ${res.status}`;
    return { ok: false, reason: hint };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ส่งไม่สำเร็จ" };
  }
}
