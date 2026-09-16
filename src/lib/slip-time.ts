// ไม่ใช่ server-only — ตัวแปลงเวลาล้วน ๆ ไว้ให้เทสต์ (scripts/early-pay-reinstate-test.mts) เรียกได้
/**
 * 🕰️ อ่านเวลาโอนจริงจากคำตอบ SlipOK → ISO
 * SlipOK ส่ง `transTimestamp` (ISO) มาเกือบทุกธนาคาร · บางเวอร์ชันมีแค่ `transDate` "20260915" + `transTime` "15:37:12" (เวลาไทย)
 * อ่านไม่ออก/ไม่มี = undefined — ผู้เรียกต้องถือว่า "ไม่รู้เวลาโอน" ไม่ใช่ตีความว่าโอนช้า
 */
export function parseSlipTransAt(d: { transTimestamp?: unknown; transDate?: unknown; transTime?: unknown } | undefined | null): string | undefined {
  if (!d) return undefined;
  const ts = typeof d.transTimestamp === "string" ? Date.parse(d.transTimestamp) : NaN;
  if (Number.isFinite(ts)) return new Date(ts).toISOString();
  const date = String(d.transDate ?? "").replace(/\D/g, "");
  const time = String(d.transTime ?? "").trim();
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(time);
  if (!m || !t) return undefined;
  const iso = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${t[1].padStart(2, "0")}:${t[2]}:${t[3] ?? "00"}+07:00`);
  return Number.isFinite(iso) ? new Date(iso).toISOString() : undefined;
}
