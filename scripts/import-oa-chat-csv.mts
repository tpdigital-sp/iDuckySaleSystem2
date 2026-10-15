/**
 * 💬📥 นำเข้าประวัติแชทจาก CSV ที่ดาวน์โหลดจาก LINE OA Manager → log ห้องแชท (Firestore ordersure/line-conversations/{uid}/log)
 *   ให้หน้า /admin/chatbot/chats เห็นข้อความที่แอดมินพิมพ์ใน OA Manager (LINE ไม่ส่ง webhook) + ประวัติก่อนบอทเริ่มเก็บ log (8 ต.ค. 69)
 *
 *   npm run import:oa-chat -- <โฟลเดอร์ csv>            → dry-run: จับคู่ + นับ ไม่เขียน
 *   npm run import:oa-chat -- <โฟลเดอร์ csv> --write    → เขียนจริง
 *     --since=YYYY-MM-DD   เอาเฉพาะข้อความตั้งแต่วันนี้ (เวลาไทย) · --room=U…  ห้องเดียว · --limit=N  ห้องแรก N ห้อง (ทดสอบ)
 *     --report=ไฟล์.json   เขียนรายงานจับคู่/ข้าม
 *
 * ข้อเท็จจริงของ export (วัด 15 ต.ค. 69 กับ line_oa_chat_csv_261014_125926 · 90,564 ไฟล์ 1.2 GB ~3.4 ล้านแถว):
 *   · ชื่อไฟล์ N_YYYYMMDD_YYYYMMDD_ชื่อLINE.csv (N เล็ก = คุยล่าสุด) · ไฟล์ N_ชื่อ.csv (ไม่มีวันที่) = ไม่มีข้อความ ข้าม
 *   · 4 บรรทัดหัว (ชื่อบัญชี/ไทม์โซน/วันดาวน์โหลด/หัวตาราง) แล้ว ประเภทผู้ส่ง(User|Account),ชื่อผู้ส่ง,วันส่ง,เวลาส่ง,ข้อความ
 *   · ⚠️ เวลาเป็น +09:00 (ญี่ปุ่น) ไม่ใช่เวลาไทย — เทียบกับ log จริง 22 ห้อง ห่าง 9 ชม. เป๊ะ
 *   · ไม่มี userId → จับคู่ด้วยชื่อ LINE (norm เดียวกับช่องค้นหา) แล้ว "ยืนยัน" ว่าไฟล์นี้คือห้องนี้จริง:
 *     ข้อความลูกค้าใน log/messages[] อย่างน้อย 1 ตัว ต้องมีใน CSV ข้อความเดียวกัน เวลาห่าง ≤ 3 นาที
 *     (ชื่อซ้ำกันเยอะ: "AA" 5 ไฟล์ 1 ห้อง · ชื่อเดียวกันหลายห้อง 549 ชื่อ) · ยืนยันไม่ได้ = ไม่เอา (กันเอาแชทคนอื่นมาใส่ผิดห้อง)
 *   · ผู้ส่ง Account: ชื่อพนักงาน = พิมพ์ใน OA Manager (ของที่เราไม่มี → นำเข้าทั้งหมด role admin · mode "oa" · by ชื่อ)
 *     "Unknown" = ส่งผ่าน API (บอท n8n / การ์ด / ตอบจากเว็บ) · "ข้อความตอบกลับอัตโนมัติ" = auto-reply ของ LINE
 *   · ข้อความลูกค้า + Unknown เอาเฉพาะช่วง "ก่อน log เริ่ม" (ก่อน entry แรกที่ไม่ได้มาจากการนำเข้า) — หลังจากนั้นบอทเก็บครบอยู่แล้ว
 *     (log ของ n8n รวมข้อความติดกันเป็น "a / b / c" เทียบตัวต่อตัวไม่ได้ จึงตัดด้วยเวลาแทน)
 *   · รหัส entry = oa-<sha1(เวลา|ประเภท|ผู้ส่ง|ข้อความ)> → รันซ้ำ/export รอบหน้าไม่ซ้ำ · ติด source "oa-csv"
 *   · ห้อง: อัปเดต lastAdminAt ถ้าแอดมินตอบใน OA หลังค่าเดิม (หน้าแชทจะไม่ขึ้น 🟢 ยังไม่อ่าน/รอแอดมิน ผิด) · ไม่แตะ lastSeen/messageCount
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getChatFirestore } from "../src/lib/server/firebase-admin";
import { norm } from "../src/lib/server/line-chat";
import { parseCsv } from "../src/lib/chat-stats";

const args = process.argv.slice(2);
const DIR = args.find((a) => !a.startsWith("--"));
if (!DIR) throw new Error("ใส่โฟลเดอร์ CSV: npm run import:oa-chat -- <dir> [--write]");
const WRITE = args.includes("--write");
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const SINCE = opt("since") ? new Date(`${opt("since")}T00:00:00+07:00`).getTime() : 0;
const ONLY = opt("room");
const LIMIT = Number(opt("limit") || 0);
const REPORT = opt("report");
const TZ_MS = 9 * 3600_000;
const VERIFY_WIN = 3 * 60_000;
const AUTO_REPLY = "ข้อความตอบกลับอัตโนมัติ";

const db = getChatFirestore();
if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firestore (.env.local)");

type FileRef = { f: string; from: string; to: string; name: string };
type Row = { who: "User" | "Account"; sender: string; at: number; text: string };
type Verify = { at: number; text: string | null; kind: "text" | "image" | "sticker" | "file" | "video"; /** มาจาก messages[] (เวลา = ตอนบอทตอบ ไม่ใช่ตอนลูกค้าส่ง) → ยอมให้ CSV อยู่ก่อนได้ถึง 15 นาที */ loose?: boolean };

// ---------- ไฟล์ ----------
const fileByKey = new Map<string, FileRef[]>();
let filesTotal = 0, filesNoMsg = 0;
for (const f of readdirSync(DIR)) {
  if (!f.endsWith(".csv")) continue;
  filesTotal++;
  const m = f.match(/^\d+_(\d{8})_(\d{8})_(.*)\.csv$/);
  if (!m) { filesNoMsg++; continue; }
  const k = norm(m[3]);
  fileByKey.set(k, [...(fileByKey.get(k) ?? []), { f, from: m[1], to: m[2], name: m[3] }]);
}
console.log(`📁 ${DIR}\n   ไฟล์ ${filesTotal} · มีข้อความ ${filesTotal - filesNoMsg} · ชื่อไม่ซ้ำ ${fileByKey.size} · โหมด ${WRITE ? "✍️ เขียนจริง" : "👀 dry-run"}${SINCE ? ` · ตั้งแต่ ${opt("since")}` : ""}`);

/** อ่านไฟล์ → แถวข้อความ + เวลาดาวน์โหลด (บรรทัด 3 "วันดาวน์โหลด" เป็นเวลาไทย — ดาวน์โหลดหลายรอบ 13:01–18:06 ในโฟลเดอร์เดียว) */
function readRows(fr: FileRef): { rows: Row[]; downloadedAt: number } {
  const text = readFileSync(`${DIR}/${fr.f}`, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(text);
  const out: Row[] = [];
  let started = false;
  let downloadedAt = Date.now();
  for (const r of rows) {
    if (!started) {
      if (r[0] === "วันดาวน์โหลด") { const m = String(r[1] ?? "").match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/); if (m) downloadedAt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 7 * 3600_000; }
      if (r[0] === "ประเภทผู้ส่ง") started = true;
      continue;
    }
    if (r.length < 5 || (r[0] !== "User" && r[0] !== "Account")) continue;
    const [y, mo, d] = r[2].split("/").map(Number);
    const [h, mi, s] = r[3].split(":").map(Number);
    if (!y || !mo || !d) continue;
    out.push({ who: r[0], sender: r[1], at: Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0) - TZ_MS, text: r.slice(4).join(",").replace(/\uFFFD/g, "").trim() });
  }
  return { rows: out, downloadedAt };
}
/** เทียบข้อความแบบไม่สนช่องว่าง/ขึ้นบรรทัด (n8n เก็บ "ค่ะ \n" / CSV "ค่ะ\n" ไม่เท่ากันทั้งที่เป็นข้อความเดียวกัน) */
const ws = (t: string) => t.replace(/\s+/g, " ").trim();
const thDay = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");

const PLACEHOLDER: Record<string, { kind: Verify["kind"] | "location"; user: string; shop: string }> = {
  "คุณส่งรูป": { kind: "image", user: "[ลูกค้าส่งรูปภาพ] 🖼 ดูรูปใน OA Manager", shop: "🖼 ส่งรูปภาพ (ดูใน OA Manager)" },
  "คุณส่งสติกเกอร์": { kind: "sticker", user: "[ลูกค้าส่งสติกเกอร์]", shop: "(ส่งสติกเกอร์)" },
  "คุณส่งไฟล์": { kind: "file", user: "[ลูกค้าส่งไฟล์] 📎 ดูไฟล์ใน OA Manager", shop: "📎 ส่งไฟล์ (ดูใน OA Manager)" },
  "คุณส่งวิดีโอ": { kind: "video", user: "[ลูกค้าส่งวิดีโอ] 🎬 ดูใน OA Manager", shop: "🎬 ส่งวิดีโอ (ดูใน OA Manager)" },
  "คุณส่งตำแหน่งที่ตั้ง": { kind: "location", user: "[ลูกค้าส่งตำแหน่งที่ตั้ง]", shop: "(ส่งตำแหน่งที่ตั้ง)" },
};

// ---------- ห้อง ----------
const roomSnap = await db.collection("line-conversations").select("displayName", "userName", "lastSeen", "lastAdminAt", "messages").get();
type Room = { id: string; name: string; lastSeen: number; lastAdminAt: number; msgs: Verify[] };
const rooms: Room[] = roomSnap.docs
  .map((d) => {
    const msgs: Verify[] = (Array.isArray(d.get("messages")) ? (d.get("messages") as Record<string, unknown>[]) : [])
      .filter((m) => m && m.role === "user" && m.at)
      .map((m) => toVerify(String(m.text ?? ""), String(m.type ?? ""), tsOf(m.at)))
      .filter((v): v is Verify => !!v)
      .map((v) => ({ ...v, loose: true }));
    return { id: d.id, name: String(d.get("displayName") || d.get("userName") || "").trim(), lastSeen: tsOf(d.get("lastSeen")), lastAdminAt: tsOf(d.get("lastAdminAt")), msgs };
  })
  .filter((r) => r.name && (!ONLY || r.id === ONLY));
const roomsByKey = new Map<string, Room[]>();
for (const r of rooms) roomsByKey.set(norm(r.name), [...(roomsByKey.get(norm(r.name)) ?? []), r]);
const nameCount = new Map<string, number>([...roomsByKey].map(([k, v]) => [k, v.length]));
console.log(`🏠 ห้องแชท ${roomSnap.size} · มีชื่อ ${rooms.length}`);

function tsOf(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "string") return Date.parse(v) || 0;
  const t = v as { toDate?: () => Date; toMillis?: () => number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  return 0;
}
function toVerify(text: string, type: string, at: number): Verify | null {
  if (!at) return null;
  if (type === "image" || text.startsWith("[ลูกค้าส่งรูป")) return { at, text: null, kind: "image" };
  if (type === "sticker" || text.startsWith("[ลูกค้าส่งสติกเกอร์")) return { at, text: null, kind: "sticker" };
  if (type === "file" || text.startsWith("[ลูกค้าส่งไฟล์")) return { at, text: null, kind: "file" };
  if (type === "video") return { at, text: null, kind: "video" };
  const last = text.split(" / ").pop()!.trim();
  if (!last || last.startsWith("[")) return null;
  return { at, text: ws(last), kind: "text" };
}
function kindOfRow(t: string): Verify["kind"] | "location" | "text" { return PLACEHOLDER[t]?.kind ?? "text"; }
function verifyHits(items: Verify[], rows: Row[]): number {
  let hits = 0;
  const users = rows.filter((r) => r.who === "User");
  for (const v of items) {
    const lo = v.at - (v.loose ? 15 * 60_000 : VERIFY_WIN), hi = v.at + VERIFY_WIN;
    const ok = users.some((r) => r.at >= lo && r.at <= hi && (v.kind === "text" ? ws(r.text) === v.text : kindOfRow(r.text) === v.kind));
    if (ok && ++hits >= 2) break;
  }
  return hits;
}

// ---------- จับคู่ + นำเข้า ----------
const stat = { noFile: 0, verified: 0, byUniqueName: 0, byLastDay: 0, unverified: 0, ambiguous: 0, waitNext: 0, written: 0, skippedExisting: 0, user: 0, admin: 0, bot: 0, auto: 0, roomsTouched: 0 };
const report: Record<string, unknown>[] = [];
const writer = WRITE ? db.bulkWriter() : null;
writer?.onWriteError((err) => { console.error("write error", err.documentRef.path, err.message); return err.failedAttempts < 3; });
const t0 = Date.now();
let n = 0;
for (const room of rooms) {
  if (LIMIT && n >= LIMIT) break;
  const cands = fileByKey.get(norm(room.name));
  if (!cands) { stat.noFile++; continue; }
  n++;
  // log ที่มีอยู่ (เฉพาะคีย์ที่ต้องใช้) — ห้องใหญ่สุดหลักพัน entry
  const logSnap = await db.collection("line-conversations").doc(room.id).collection("log").select("role", "text", "type", "at", "source").get();
  const existingIds = new Set<string>();
  let logStart = Infinity;
  const verify: Verify[] = [...room.msgs];
  for (const e of logSnap.docs) {
    existingIds.add(e.id);
    if (e.get("source") === "oa-csv") continue;
    const at = tsOf(e.get("at"));
    if (!at) continue;
    if (e.get("role") !== "draft" && at < logStart) logStart = at;
    if (e.get("role") === "user") { const v = toVerify(String(e.get("text") ?? ""), String(e.get("type") ?? ""), at); if (v) verify.push(v); }
  }
  const parsed = cands.map((fr) => ({ fr, ...readRows(fr) }));
  // ยืนยันด้วยข้อความลูกค้าที่อยู่ก่อนเวลาดาวน์โหลดของไฟล์นั้น (หลังดาวน์โหลดไม่มีใน CSV แน่)
  const verifiable = verify.sort((a, b) => b.at - a.at);
  const verified = parsed.filter((p) => { const items = verifiable.filter((v) => v.at <= p.downloadedAt).slice(0, 40); return items.length > 0 && verifyHits(items, p.rows) >= 1; });
  let pick: (typeof parsed)[number] | null = null;
  let how = "";
  if (verified.length === 1) { pick = verified[0]; how = "ข้อความตรง"; }
  else if (verified.length > 1) { stat.ambiguous++; report.push({ room: room.id, name: room.name, why: "ตรงมากกว่า 1 ไฟล์", files: verified.map((v) => v.fr.f) }); continue; }
  else {
    const anyUsable = parsed.some((p) => verifiable.some((v) => v.at <= p.downloadedAt));
    if (anyUsable) { stat.unverified++; report.push({ room: room.id, name: room.name, why: "ชื่อตรงแต่ข้อความ/เวลาไม่ตรงสักตัว", files: cands.map((c) => c.f) }); continue; }
    // ไม่มีอะไรให้เทียบ (ห้องเพิ่งเริ่มเก็บหลังดาวน์โหลด) → ชื่อนี้มีห้องเดียว+ไฟล์เดียว = คนเดียวกันแน่ (ทุกคนที่เคยคุยก่อนดาวน์โหลดต้องมีไฟล์ของตัวเอง)
    if (parsed.length === 1 && nameCount.get(norm(room.name)) === 1) { pick = parsed[0]; how = "ชื่อไม่ซ้ำ"; stat.byUniqueName++; }
    else {
      // หลายไฟล์: วันที่ลูกค้าทักล่าสุด (lastSeen · ก่อนดาวน์โหลด) ต้องเท่ากับวัน (ไทย) ของแถว User สุดท้ายในไฟล์ และมีไฟล์เดียวที่ตรง
      // + ห้องชื่อเดียวกันห้องอื่นต้องไม่ได้ทักวันเดียวกัน (ไม่งั้นแยกไม่ออกว่าไฟล์ของใคร)
      const day = room.lastSeen ? thDay(room.lastSeen) : "";
      const byDay = parsed.filter((p) => day && room.lastSeen <= p.downloadedAt && thDay(p.rows.filter((r) => r.who === "User").at(-1)?.at ?? 0) === day);
      const sameDayRooms = (roomsByKey.get(norm(room.name)) ?? []).filter((r) => r.id !== room.id && r.lastSeen && thDay(r.lastSeen) === day).length;
      if (byDay.length === 1 && sameDayRooms === 0) { pick = byDay[0]; how = "วันคุยล่าสุดตรง"; stat.byLastDay++; }
      else { stat.waitNext++; report.push({ room: room.id, name: room.name, why: "ยังไม่มีข้อความลูกค้าก่อนดาวน์โหลดให้เทียบ และชื่อซ้ำ", files: cands.map((c) => c.f) }); continue; }
    }
  }
  stat.verified++;
  const { fr, rows } = pick!;
  if (REPORT) report.push({ room: room.id, name: room.name, matched: fr.f, how });
  const cutoff = logStart === Infinity ? Infinity : logStart - 60_000;
  let roomWrites = 0, lastAdmin = 0;
  for (const r of rows) {
    if (r.at < SINCE) continue;
    const ph = PLACEHOLDER[r.text];
    let entry: Record<string, unknown>;
    if (r.who === "User") {
      if (r.at >= cutoff) continue;
      entry = { role: "user", type: ph ? ph.kind : "text", text: ph ? ph.user : r.text };
      stat.user++;
    } else if (r.sender === "Unknown") {
      if (r.at >= cutoff) continue;
      entry = { role: "assistant", type: ph ? ph.kind : "text", text: ph ? ph.shop : r.text, mode: "oa", by: "" };
      stat.bot++;
    } else if (r.sender === AUTO_REPLY) {
      entry = { role: "assistant", type: "text", text: r.text, mode: "auto", by: "" };
      stat.auto++;
    } else {
      entry = { role: "admin", type: ph ? ph.kind : "text", text: ph ? ph.shop : r.text, mode: "oa", by: r.sender };
      stat.admin++;
      if (r.at > lastAdmin) lastAdmin = r.at;
    }
    if (!entry.text) continue;
    const id = `oa-${createHash("sha1").update(`${r.at}|${r.who}|${r.sender}|${r.text}`).digest("hex").slice(0, 20)}`;
    if (existingIds.has(id)) { stat.skippedExisting++; continue; }
    roomWrites++;
    if (writer) void writer.set(db.collection("line-conversations").doc(room.id).collection("log").doc(id), { ...entry, at: Timestamp.fromMillis(r.at), source: "oa-csv", importedAt: Timestamp.now() });
  }
  if (roomWrites) {
    stat.roomsTouched++;
    stat.written += roomWrites;
    const patch: Record<string, unknown> = { oaImport: { at: Timestamp.now(), file: fr.f, entries: roomWrites } };
    if (lastAdmin > room.lastAdminAt) patch.lastAdminAt = Timestamp.fromMillis(lastAdmin);
    if (writer) void writer.set(db.collection("line-conversations").doc(room.id), patch, { merge: true });
  }
  if (n % 500 === 0) { await writer?.flush(); console.log(`… ${n} ห้อง · ${Math.round((Date.now() - t0) / 1000)} วิ · ${JSON.stringify(stat)}`); }
}
await writer?.close();
console.log(`\n✅ เสร็จ ${Math.round((Date.now() - t0) / 1000)} วิ`);
console.log(`   ห้องที่ชื่อตรงไฟล์ ${n} · ใช้ได้ ${stat.verified} (ชื่อไม่ซ้ำ ${stat.byUniqueName} · วันคุยล่าสุดตรง ${stat.byLastDay}) · ข้าม: ไม่มีไฟล์ ${stat.noFile} · ยืนยันไม่ตรง ${stat.unverified} · ตรงหลายไฟล์ ${stat.ambiguous} · รอ export รอบหน้า ${stat.waitNext}`);
console.log(`   ข้อความ${WRITE ? "ที่เขียน" : "ที่จะเขียน"} ${stat.written} (ห้อง ${stat.roomsTouched}) · มีอยู่แล้ว ${stat.skippedExisting} · แยก: ลูกค้า ${stat.user} · แอดมิน OA ${stat.admin} · บอท/API ${stat.bot} · auto-reply ${stat.auto}`);
if (REPORT) { writeFileSync(REPORT, JSON.stringify({ stat, rooms: report }, null, 1)); console.log(`   รายงาน → ${REPORT}`); }
