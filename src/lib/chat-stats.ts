/**
 * 📊 สถิติตอบแชท / ค่าคอมแชท (เจ้าของร้าน 9 ต.ค. 69 21:20: "ระบบสามารถดึงข้อมูลแชทที่พนักงานตอบในระบบนี้ได้ และสามารถ[นำเข้า]ไฟล์แชทจาก zip CSV ได้")
 *
 * ของกลางที่ทั้งหน้า (อ่าน zip ในเบราว์เซอร์) และ API (นับจาก log ห้องแชท) ใช้ร่วมกัน — ไม่มี server-only
 * ตัวเลขทุกตัวตั้งใจให้ตรงกับ pages/commissionStoreChat.js ของ Admin_MyWebApp (finalizeSenderStats) เพื่อให้หน้าค่าคอมเดิมอ่านต่อได้
 *
 * - รอบบิล 26 → 25 (เหมือนหน้าค่าคอม)
 * - CSV จาก LINE OA Manager: 3 บรรทัดหัว → header "ประเภทผู้ส่ง,ชื่อผู้ส่ง,วันส่ง,เวลาส่ง,ข้อความ" → แถว (ข้อความหลายบรรทัดอยู่ในเครื่องหมายคำพูด)
 *   ชื่อไฟล์ N_YYYYMMDD_YYYYMMDD_ชื่อลูกค้า.csv · ผู้ส่ง "Unknown" = ระบบ/บอท/ข้อความที่ส่งผ่าน Messaging API (รวมที่ส่งจากหน้าแชทของเรา)
 */
export const AUTO_REPLY_NAME = "ข้อความตอบกลับอัตโนมัติ";
export const SYSTEM_SENDERS = new Set(["Unknown"]);
export const POLITE_RE = /(ค่ะ|คะ|ครับ|คร้าบ|นะคะ|น้า|จ้า|จ้ะ|ค่า)/;
export const APOLOGY_RE = /(ขอโทษ|ขออภัย|โทษที|ต้องขออภัย)/;
export const NUDGE_RE = /(ตอบหน่อย|ไม่ตอบ|ยังไม่ตอบ|เงียบ|ทักไปแล้ว|รอตอบ|อ่านแล้วไม่ตอบ|ตอบด้วย)/;
export const CUST_FLAG_RE = /(ช้า|รอนาน|นานมาก|เมื่อไหร่|ยังไม่ได้|ยังไม่ส่ง|ยังไม่มา|เลยกำหนด|ไม่ทัน|พัง|ชำรุด|ไม่ตรง|ผิดแบบ|เพี้ยน|เบลอ|ลอก|เป็นรอย|ไม่เหมือน|ส่งผิด|ไม่ได้รับ|ไม่ครบ|ตกหล่น|ไม่ตอบ|เงียบ|แพง|คืนเงิน|เงินคืน|ไม่พอใจ|ผิดหวัง|แย่|ห่วย|เซ็ง|โมโห|หงุดหงิด|ไม่โอเค|แก้ให้|ทำใหม่|เคลม)/;

/** สถิติต่อผู้ตอบ 1 คน (ทรงเดียวกับ finalizeSenderStats ของหน้าค่าคอมเดิม) */
export type SenderStats = {
  name: string;
  replies: number;
  chats: number; // ห้อง/แชทไม่ซ้ำ = "ตอบลูกค้าไปกี่คน"
  respN: number;
  respMedian: number | null; // นาที
  respP90: number | null;
  within10: number | null; // % ที่ตอบใน 10 นาที
  polite: number; // %
  avgLen: number;
  apology: number;
  nudges: number; // ลูกค้าทวงก่อนได้คำตอบ (ครั้ง)
  source?: "web" | "oa";
};

/** ตัวสะสมระหว่างอ่าน */
export type SenderAcc = { name: string; replies: number; chatSet: Set<string>; lenSum: number; polite: number; apology: number; resp: number[]; nudges: number };
export const newAcc = (name: string): SenderAcc => ({ name, replies: 0, chatSet: new Set(), lenSum: 0, polite: 0, apology: 0, resp: [], nudges: 0 });

const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
};
const pct90 = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return Math.round(s[Math.min(s.length - 1, Math.ceil(0.9 * (s.length - 1)))] * 10) / 10;
};

export function finalizeSender(acc: SenderAcc, source: "web" | "oa"): SenderStats {
  return {
    name: acc.name,
    replies: acc.replies,
    chats: acc.chatSet.size,
    respN: acc.resp.length,
    respMedian: median(acc.resp),
    respP90: pct90(acc.resp),
    within10: acc.resp.length ? Math.round((100 * acc.resp.filter((x) => x <= 10).length) / acc.resp.length) : null,
    polite: acc.replies ? Math.round((100 * acc.polite) / acc.replies) : 0,
    avgLen: acc.replies ? Math.round(acc.lenSum / acc.replies) : 0,
    apology: acc.apology,
    nudges: acc.nudges,
    source,
  };
}

/**
 * ป้อนบทสนทนา 1 ห้อง (เรียงเวลาแล้ว) เข้าตัวสะสมต่อผู้ตอบ — ใช้ทั้ง CSV และ log ห้องแชทของเรา
 * msg: who = "cust" | "auto" (ตอบกลับอัตโนมัติ ไม่นับและไม่ถือว่าตอบ) | "sys" (บอท/Unknown ถือว่าตอบแล้ว แต่ไม่นับให้ใคร) | ชื่อผู้ตอบ
 */
export function feedConversation(acc: Map<string, SenderAcc>, chatId: string, msgs: { who: string; at: number; text: string }[]): { customerMsgs: number; flagged: boolean } {
  let lastCust: number | null = null;
  let nudge = false;
  let flagged = false;
  let customerMsgs = 0;
  for (const m of msgs) {
    if (m.who === "cust") {
      customerMsgs++;
      if (lastCust === null) lastCust = m.at; // ข้อความแรกที่ยังไม่มีคนตอบ
      if (NUDGE_RE.test(m.text)) nudge = true;
      if (CUST_FLAG_RE.test(m.text)) flagged = true;
      continue;
    }
    if (m.who === "auto") continue;
    if (m.who === "sys") {
      lastCust = null; // บอทตอบแล้ว = ลูกค้าได้คำตอบ (หน้าเดิมนับ Unknown แบบนี้)
      nudge = false;
      continue;
    }
    let a = acc.get(m.who);
    if (!a) {
      a = newAcc(m.who);
      acc.set(m.who, a);
    }
    a.replies++;
    a.chatSet.add(chatId);
    a.lenSum += m.text.length;
    if (POLITE_RE.test(m.text)) a.polite++;
    if (APOLOGY_RE.test(m.text)) a.apology++;
    if (lastCust !== null) {
      const dt = (m.at - lastCust) / 60000;
      if (dt >= 0 && dt <= 720) a.resp.push(dt);
      lastCust = null;
    }
    if (nudge) {
      a.nudges++;
      nudge = false;
    }
  }
  return { customerMsgs, flagged };
}

/** CSV ของ LINE (RFC4180: ช่องมีเครื่องหมายคำพูด/ขึ้นบรรทัดใน "...") */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      q = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** "2026/10/09" + "14:57:03" → ms (เวลาเครื่อง — CSV เป็นเวลาไทยอยู่แล้ว ใช้แค่หาผลต่างนาที) */
export function csvTs(d: string, tm: string): number {
  const [y, m, dd] = d.split("/").map(Number);
  const [h, mi, s] = (tm || "").split(":").map(Number);
  return new Date(y, m - 1, dd, h || 0, mi || 0, s || 0).getTime();
}

/** ชื่อเทียบกัน: ตัดช่องว่าง/อีโมจิ/เครื่องหมาย เหลือตัวอักษร-ตัวเลข ตัวเล็ก */
export const normKey = (s: string) => String(s || "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");

/** รอบบิล 26 → 25 ที่ครอบวันที่ d (เวลาไทย) → { start:"YYYY-MM-DD", end:"YYYY-MM-DD" } */
export function cycleOf(d = new Date()): { start: string; end: string } {
  const th = new Date(d.getTime() + 7 * 3600_000);
  let y = th.getUTCFullYear();
  let m = th.getUTCMonth(); // 0-11
  if (th.getUTCDate() < 26) {
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const ey = m === 11 ? y + 1 : y;
  const em = m === 11 ? 0 : m + 1;
  return { start: `${y}-${pad(m + 1)}-26`, end: `${ey}-${pad(em + 1)}-25` };
}
/** รอบก่อนหน้า n รอบ */
export function cycleBack(n: number): { start: string; end: string } {
  const c = cycleOf();
  const [y, m] = c.start.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 26, 12));
  return cycleOf(new Date(d.getTime() - 7 * 3600_000));
}
export const cycleKey = (c: { start: string; end: string }) => `${c.start}_${c.end}`;
export const cycleRange = (c: { start: string; end: string }) => ({ from: new Date(`${c.start}T00:00:00+07:00`), to: new Date(`${c.end}T23:59:59.999+07:00`) });
export function thDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${d} ${M[m - 1]} ${String(y + 543).slice(2)}`;
}

/** ผลรวมฝั่ง OA Manager ที่หน้าเว็บอ่านจาก zip แล้วส่งขึ้นเซิร์ฟเวอร์ (ไม่มีเนื้อแชท) */
export type OaSummary = {
  fileName: string;
  fileSize: number;
  coverStart: string; // YYYYMMDD
  coverEnd: string;
  partial: boolean; // รอบยังไม่จบตอนดาวน์โหลด
  filesTotal: number;
  filesRead: number;
  rowsRead: number;
  chats: number; // แชทที่มีข้อความลูกค้าในรอบ
  customerMsgs: number;
  autoReplies: number;
  senders: SenderStats[];
};

/** จับคู่ชื่อผู้ส่งใน OA → ชื่อพนักงาน (alias ของร้าน '' = ตั้งใจบอกว่าไม่ใช่พนักงาน · null = ยังไม่รู้) */
export function resolveOaName(chatName: string, alias: Record<string, string>, staffNames: string[]): string | null {
  if (Object.prototype.hasOwnProperty.call(alias, chatName)) return String(alias[chatName] ?? "").trim();
  const byKey = (k: string) => (k ? staffNames.find((s) => normKey(s) === k) ?? null : null);
  const hit = byKey(normKey(chatName));
  if (hit) return hit;
  const stripped = normKey(String(chatName).replace(/\([^)]*\)/g, ""));
  if (stripped && stripped !== normKey(chatName)) {
    const ak = Object.keys(alias).find((a) => normKey(a) === stripped);
    if (ak !== undefined) return String(alias[ak] ?? "").trim();
    const h2 = byKey(stripped);
    if (h2) return h2;
  }
  return null;
}
