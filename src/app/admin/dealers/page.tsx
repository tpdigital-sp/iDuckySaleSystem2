"use client";

/**
 * ตัวแทนจำหน่าย /admin/dealers
 *
 * ทะเบียนบัญชีสมาชิกที่เห็น "เรทราคาตัวแทนจำหน่าย" (เรทที่ติ๊ก dealerOnly ในหน้าแก้ไขสินค้า)
 * ลูกค้าสมัครเองได้จากหน้า /dealer → ขึ้นแถบรออนุมัติบนสุด · หรือแอดมินเพิ่มเองด้วยอีเมล
 * ตัวแทนได้ราคาเรทตัวแทนอย่างเดียว ไม่ได้ส่วนลดสมาชิก/คูปอง/โอนไว/ของแถม (เซิร์ฟเวอร์บังคับ)
 */

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Btn, Empty, Field, ListHead, PageHead, PageShell, Row, RowMain, RowSide, Rows, Tag } from "@/components/admin/ui";

/** สิ่งที่ผู้สมัครกรอกมาจากหน้า /dealer */
interface ApplicationInfo {
  shopName: string;
  channel: string;
  detail?: string;
  at: string;
}

interface DealerRow {
  uid: string;
  email: string;
  name: string;
  phone: string;
  picture: string;
  note: string;
  since: string;
  /** ใบสมัครที่เก็บไว้ตอนอนุมัติ หรือที่แอดมินกรอกย้อนหลัง — เพิ่มด้วยอีเมลตรง ๆ / อนุมัติก่อน 17 ก.ย. 69 = ไม่มี */
  application?: ApplicationInfo;
  /** ผู้ส่งบนกล่องที่ตัวแทนตั้งเองในหน้า /account */
  sender?: { name?: string; phone?: string; address?: string };
  address: string;
  joinedAt: string;
  lastSignInAt: string;
  orders: number;
}

interface ApplicationRow {
  uid: string;
  email: string;
  name: string;
  phone: string;
  picture: string;
  shopName: string;
  channel: string;
  detail: string;
  at: string;
  address: string;
  joinedAt: string;
  lastSignInAt: string;
  orders: number;
}

/** วันที่แบบที่ทีมใช้คุยกัน (พ.ศ.) — ค่าเก่าที่ไม่มี = "—" */
function thDate(iso: string): string {
  const d = new Date(iso);
  if (!iso || !isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

/** วันที่ + เวลา — ใบสมัครดูเวลาด้วย จะได้เทียบกับแชท LINE ที่เขาทักมาได้ */
function thDateTime(iso: string): string {
  const d = new Date(iso);
  if (!iso || !isFinite(d.getTime())) return "—";
  return `${thDate(iso)} ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`;
}

/* ── ใบสมัครที่ผู้สมัครกรอกมา ── */

/** แผงรายละเอียดใต้แถว (เต็มความกว้างแถว) — ข้อความยาว/ขึ้นบรรทัดใหม่แสดงครบ ไม่ตัด */
function InfoPanel({ items, children }: { items: [string, ReactNode][]; children?: ReactNode }) {
  return (
    <div
      className="rounded-2xl px-3.5 py-3"
      style={{ gridColumn: "1 / -1", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(44,129,196,0.14)" }}
    >
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[13.5px] leading-relaxed sm:grid-cols-[9.5rem_minmax(0,1fr)]">
        {items.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
              {label}
            </dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-slate-800">
              {value || <span style={{ color: "var(--dk-faint)" }}>— ไม่มีข้อมูล</span>}
            </dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}

const accountLine = (a: { name: string; email: string; phone: string }) => [a.name, a.email, a.phone].filter(Boolean).join(" · ");

const ORDERS_NOTE = "นับเฉพาะใบที่ล็อกอินสั่ง — ใบที่สั่งแบบไม่ล็อกอินไม่ถูกนับ";

/** ใบรออนุมัติ — กางให้เสมอ ต้องอ่านก่อนตัดสินใจ · ต่อท้ายด้วยข้อมูลบัญชีเท่าที่ระบบมี (เขาไม่ได้กรอกในใบสมัคร) */
function ApplicationPanel({ a }: { a: ApplicationRow }) {
  return (
    <InfoPanel
      items={[
        ["ชื่อร้าน/ธุรกิจ", a.shopName],
        ["ช่องทางขาย", a.channel],
        ["รายละเอียดเพิ่มเติม", a.detail],
        ["สมัครเมื่อ", thDateTime(a.at)],
        ["บัญชีสมาชิก", accountLine(a)],
        ["เบอร์โทร", a.phone || "ไม่ได้กรอกในโปรไฟล์ — ขอจากเขาตอนทักไลน์"],
        ["ที่อยู่ในโปรไฟล์", a.address],
        ["สมัครสมาชิกเว็บ", thDateTime(a.joinedAt)],
        ["ล็อกอินล่าสุด", thDateTime(a.lastSignInAt)],
        ["ออเดอร์ด้วยบัญชีนี้", `${a.orders} ใบ (${ORDERS_NOTE})`],
      ]}
    />
  );
}

/**
 * รายละเอียดตัวแทนที่อนุมัติแล้ว — ข้อมูลร้าน (จากใบสมัคร หรือแอดมินกรอกย้อนหลัง) + บัญชี + ผู้ส่งบนกล่อง + ออเดอร์
 * คนที่ถูกเพิ่มก่อนระบบเก็บใบสมัคร (17 ก.ย. 69) หรือเพิ่มด้วยอีเมล = ไม่มีข้อมูลร้าน → กด ✏️ กรอกเองได้
 */
function DealerPanel({
  d,
  onSave,
}: {
  d: DealerRow;
  onSave: (app: { shopName: string; channel: string; detail: string }) => Promise<boolean>;
}) {
  const app = d.application;
  const [editing, setEditing] = useState(false);
  const [shopName, setShopName] = useState(app?.shopName ?? d.note);
  const [channel, setChannel] = useState(app?.channel ?? "");
  const [detail, setDetail] = useState(app?.detail ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    if (await onSave({ shopName, channel, detail })) setEditing(false);
    setSaving(false);
  }

  const sender = d.sender ? [d.sender.name, d.sender.phone, d.sender.address].filter(Boolean).join("\n") : "";
  return (
    <InfoPanel
      items={[
        ["ชื่อร้าน/ธุรกิจ", app?.shopName || d.note],
        ["ช่องทางขาย", app?.channel ?? ""],
        ["รายละเอียดเพิ่มเติม", app?.detail ?? ""],
        ["ที่มาข้อมูลร้าน", app ? (app.at ? `ตัวแทนกรอกเองตอนสมัคร · ${thDateTime(app.at)}` : "แอดมินกรอกให้") : "ยังไม่มี — เพิ่มเข้าทะเบียนก่อนที่ระบบจะเก็บใบสมัคร กด ✏️ กรอกเองได้"],
        ["บัญชีสมาชิก", accountLine(d)],
        ["ที่อยู่ในโปรไฟล์", d.address],
        ["ผู้ส่งบนกล่อง", sender || "ยังไม่ได้ตั้ง (ใช้ชื่อร้านเรา) — ตัวแทนตั้งเองได้ที่หน้าบัญชีของเขา"],
        ["สมัครสมาชิกเว็บ", thDate(d.joinedAt)],
        ["ล็อกอินล่าสุด", thDateTime(d.lastSignInAt)],
        ["เป็นตัวแทนตั้งแต่", thDateTime(d.since)],
        ["ออเดอร์ด้วยบัญชีนี้", `${d.orders} ใบ (${ORDERS_NOTE})`],
      ]}
    >
      {editing ? (
        <div className="mt-3 grid gap-2.5 border-t border-slate-200/70 pt-3 sm:grid-cols-2">
          <Field label="ชื่อร้าน/ธุรกิจ" value={shopName} onChange={setShopName} placeholder="เช่น Baby cute case" />
          <Field label="ช่องทางขาย" value={channel} onChange={setChannel} placeholder="เช่น IG : … / Facebook / หน้าร้าน" />
          <div className="sm:col-span-2">
            <Field label="รายละเอียดเพิ่มเติม (ไม่บังคับ)" value={detail} onChange={setDetail} rows={2} placeholder="เช่น ขายสินค้าอะไร สั่งประมาณเดือนละเท่าไหร่" />
          </div>
          <p className="text-[12px] sm:col-span-2" style={{ color: "var(--dk-navy-soft)" }}>
            ใส่เฉพาะข้อมูลร้าน — ห้ามใส่เบอร์โทร/ที่อยู่ส่วนตัวในช่องเหล่านี้
          </p>
          <div className="flex gap-2 sm:col-span-2">
            <Btn small tone="navy" disabled={saving || shopName.trim().length < 2} onClick={save}>
              {saving ? "กำลังบันทึก…" : "💾 บันทึก"}
            </Btn>
            <Btn small tone="ghost" disabled={saving} onClick={() => setEditing(false)}>
              ยกเลิก
            </Btn>
          </div>
        </div>
      ) : (
        <div className="mt-3 border-t border-slate-200/70 pt-3">
          <Btn small tone="ghost" onClick={() => setEditing(true)}>
            ✏️ {app ? "แก้ข้อมูลร้าน" : "กรอกข้อมูลร้าน"}
          </Btn>
        </div>
      )}
    </InfoPanel>
  );
}

/* ── กล่องคู่มือ "วิธีเพิ่มตัวแทน" ── */

const HOWTO_STEP = "flex gap-2.5 text-[13.5px] leading-relaxed text-slate-700";
const HOWTO_NUM =
  "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white";
const KEY = "rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[12px] font-semibold text-slate-800 shadow-sm";

/**
 * วิธีเพิ่มตัวแทน — วางไว้ในหน้านี้เลยให้แอดมินอ่านก่อนกดเพิ่ม (ไม่ต้องเปิดคู่มือแยก)
 * กางเองเมื่อทะเบียนยังว่าง (แอดมินมือใหม่) · มีตัวแทนแล้วพับเก็บ กดหัวข้อเพื่อกาง
 */
function HowToAddDealer({ open }: { open: boolean }) {
  return (
    <details open={open} className="dkb-g group mt-4 px-4 py-3 sm:px-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 select-none">
        <span className="text-[15px]">📖</span>
        <span className="text-[14px] font-extrabold" style={{ color: "var(--dk-navy)" }}>
          วิธีเพิ่มตัวแทนจำหน่าย
        </span>
        <span className="hidden text-[12px] sm:inline" style={{ color: "var(--dk-navy-soft)" }}>
          — อ่านก่อนกดเพิ่ม · มี 2 ทาง
        </span>
        <span className="ml-auto text-[12px] transition group-open:rotate-90" style={{ color: "var(--dk-navy-soft)" }}>
          ▸
        </span>
      </summary>

      <div className="mt-3 grid gap-4 border-t border-slate-200/70 pt-3 md:grid-cols-2">
        {/* ทางที่ 1 */}
        <section className="rounded-2xl p-3.5" style={{ background: "var(--dk-mint-wash)" }}>
          <p className="text-[13px] font-extrabold" style={{ color: "var(--dk-mint-ink)" }}>
            ทางที่ 1 · ลูกค้าสมัครเอง (แนะนำ)
          </p>
          <ol className="mt-2 space-y-1.5">
            <li className={HOWTO_STEP}>
              <span className={HOWTO_NUM} style={{ background: "var(--dk-mint-ink)" }}>1</span>
              <span>
                ส่งลิงก์ <b className="select-all">iduckystore.com/dealer</b> ให้ลูกค้าทาง LINE — เขาต้องล็อกอินก่อน แล้วกรอกชื่อร้าน
                + ช่องทางขาย
              </span>
            </li>
            <li className={HOWTO_STEP}>
              <span className={HOWTO_NUM} style={{ background: "var(--dk-mint-ink)" }}>2</span>
              <span>
                ใบสมัครเด้งแจ้งเตือนเข้า LINE ร้าน และขึ้นแถบ <b>📥 รออนุมัติ</b> บนสุดของหน้านี้ (ถ้าไม่มีแถบ = ยังไม่มีใครสมัคร) ·
                หน้าสมัครบอกลูกค้าไว้แล้วว่า<b>ค่าสมัคร 200 บาท</b> และให้ทักไลน์ร้านหลังส่งใบ — รอเขาทักมา + ชำระค่าสมัครก่อนค่อยอนุมัติ
              </span>
            </li>
            <li className={HOWTO_STEP}>
              <span className={HOWTO_NUM} style={{ background: "var(--dk-mint-ink)" }}>3</span>
              <span>
                กด <kbd className={KEY}>✅ อนุมัติ</kbd> → ย้ายเข้ารายชื่อตัวแทนทันที (ชื่อร้านที่กรอกมากลายเป็นโน้ตให้เอง · ใบสมัครเก็บไว้ กด{" "}
                <kbd className={KEY}>📄 ดูรายละเอียด</kbd> ท้ายชื่อดูย้อนหลังได้) · ไม่ผ่านกด{" "}
                <kbd className={KEY}>ปฏิเสธ</kbd> 2 ครั้ง ใบสมัครหาย ลูกค้าสมัครใหม่ได้
              </span>
            </li>
          </ol>
        </section>

        {/* ทางที่ 2 */}
        <section className="rounded-2xl p-3.5" style={{ background: "var(--dk-yolk-wash)" }}>
          <p className="text-[13px] font-extrabold" style={{ color: "var(--dk-yolk-ink)" }}>
            ทางที่ 2 · แอดมินเพิ่มเองด้วยอีเมล (ไม่ต้องรอใบสมัคร)
          </p>
          <ol className="mt-2 space-y-1.5">
            <li className={HOWTO_STEP}>
              <span className={HOWTO_NUM} style={{ background: "var(--dk-yolk-ink)" }}>1</span>
              <span>
                ลูกค้าต้อง<b>เคยสมัครสมาชิก/ล็อกอินบนเว็บแล้ว</b>อย่างน้อย 1 ครั้ง — ถ้ายังไม่เคย ระบบจะบอกว่าไม่พบบัญชี ให้เขาล็อกอินก่อนแล้วค่อยเพิ่ม
              </span>
            </li>
            <li className={HOWTO_STEP}>
              <span className={HOWTO_NUM} style={{ background: "var(--dk-yolk-ink)" }}>2</span>
              <span>
                กรอก<b>อีเมลที่เขาใช้ล็อกอิน</b>ในช่องด้านล่าง + โน้ตชื่อร้าน (ไม่บังคับ) → กด <kbd className={KEY}>➕ เพิ่มตัวแทน</kbd> มีผลทันที
              </span>
            </li>
            <li className={HOWTO_STEP}>
              <span className={HOWTO_NUM} style={{ background: "var(--dk-yolk-ink)" }}>3</span>
              <span>
                บัญชีที่ล็อกอิน LINE แบบไม่มีอีเมลจริง ให้ดูอีเมลระบบของเขาใน
                <Link href="/admin/contacts" className="font-semibold underline decoration-dotted underline-offset-2">
                  ข้อมูลผู้ติดต่อ
                </Link>
                /หน้าออเดอร์เก่า (รูปแบบ <span className="dkb-code">line_…@line.iducky.local</span>) แล้วใช้อีเมลนั้นเพิ่มได้เหมือนกัน
              </span>
            </li>
          </ol>
        </section>
      </div>

      {/* หลังเพิ่ม + ข้อควรรู้ */}
      <div className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] leading-relaxed text-slate-700 md:grid-cols-2">
        <p>
          <b>หลังเพิ่มแล้ว</b> — บอกลูกค้ารีเฟรชหน้าเว็บ 1 ครั้ง จะเห็นป้าย 🤝 กับราคาตัวแทนตั้งแต่หน้าสินค้า → ตะกร้า → ชำระเงิน
          สั่งได้ตั้งแต่ชิ้นแรก · ออเดอร์ของตัวแทนมีป้าย 🤝 ในหน้าออเดอร์
        </p>
        <p>
          <b>ตัวแทนได้ราคาตัวแทนอย่างเดียว</b> — ระบบตัดส่วนลดระดับสมาชิก คูปอง ส่วนลดโอนไว ฿5/฿10 และของแถมโปรโมชั่นให้เองทั้งหน้าเว็บและตอนตรวจสลิป
          ไม่ต้องไปแก้อะไรที่บัญชีเขา
        </p>
        <p>
          <b>สินค้าต้องมีเรทตัวแทน</b> — ราคาตัวแทนตั้งแยกต่อสินค้า (เรทที่ติ๊ก 🤝 ในหน้าแก้ไขสินค้า แท็บราคาขั้นบันได) สินค้าที่ไม่ได้ตั้ง ตัวแทนจ่ายราคาปกติ
          · สินค้าใหม่ที่เพิ่งเพิ่มต้องไปตั้งเรทตัวแทนเองด้วย
        </p>
        <p>
          <b>ถอดออก</b> — กด <kbd className={KEY}>ถอดออก</kbd> 2 ครั้งท้ายรายชื่อ มีผลทันที (ออเดอร์เก่าไม่เปลี่ยน) · ถอดผิดเพิ่มกลับด้วยอีเมลเดิมได้เลย ·
          อ่านฉบับเต็ม (การตั้งเรทตัวแทนในสินค้า) ที่{" "}
          <Link href="/admin/guide#dealers" className="font-semibold underline decoration-dotted underline-offset-2">
            📋 วิธีใช้ระบบ → ตัวแทนจำหน่าย
          </Link>
        </p>
      </div>
    </details>
  );
}

export default function AdminDealersPage() {
  const [dealers, setDealers] = useState<DealerRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** uid ที่กำลังยิง approve/reject อยู่ — กันกดรัว */
  const [acting, setActing] = useState("");
  /** uid ที่กด "ถอดออก"/"ปฏิเสธ" ครั้งแรกแล้ว — กดซ้ำถึงทำจริง (ยืนยันในที่ ไม่เด้ง dialog) */
  const [confirmKey, setConfirmKey] = useState("");
  /** uid ของตัวแทนที่กางรายละเอียดดูอยู่ (ใบรออนุมัติกางให้เสมอ — ต้องอ่านก่อนตัดสินใจ) */
  const [openApp, setOpenApp] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dealers", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) setErr(j.error ?? "โหลดรายชื่อไม่สำเร็จ — ลองรีเฟรชหน้า");
      setDealers(j.dealers ?? []);
      setApplications(j.applications ?? []);
      // ป้ายตัวเลขข้างเมนูนับใบสมัครชุดเดียวกัน — โหลดหน้านี้ทีไรให้ป้ายตรงกับที่เห็นตรงหน้า
      window.dispatchEvent(new Event("iducky:dealers-changed"));
    } catch {
      setErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — รายชื่อที่เห็นอาจไม่ใช่ล่าสุด");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** ยิงคำสั่งจัดการ (approve/reject/เพิ่ม/แก้โน้ต) แล้วโหลดรายชื่อใหม่ */
  async function manage(body: Record<string, unknown>): Promise<boolean> {
    setErr("");
    try {
      const res = await fetch("/api/admin/dealers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "ทำรายการไม่สำเร็จ");
        return false;
      }
      await load();
      return true;
    } catch {
      setErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่อีกครั้ง");
      return false;
    }
  }

  async function add() {
    if (!email.trim() || busy) return;
    setBusy(true);
    const ok = await manage({ email: email.trim(), ...(note.trim() ? { note: note.trim() } : {}) });
    if (ok) {
      setEmail("");
      setNote("");
    }
    setBusy(false);
  }

  async function approve(uid: string) {
    if (acting) return;
    setActing(uid);
    await manage({ approveUid: uid });
    setActing("");
  }

  /** ปฏิเสธ/ถอดออก — กด 2 ครั้งยืนยัน */
  function twoTap(key: string, run: () => void) {
    if (confirmKey !== key) {
      setConfirmKey(key);
      window.setTimeout(() => setConfirmKey((c) => (c === key ? "" : c)), 4000);
      return;
    }
    setConfirmKey("");
    run();
  }

  async function reject(uid: string) {
    if (acting) return;
    setActing(uid);
    await manage({ rejectUid: uid });
    setActing("");
  }

  async function remove(uid: string) {
    setErr("");
    try {
      const res = await fetch(`/api/admin/dealers?uid=${encodeURIComponent(uid)}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "ถอดตัวแทนไม่สำเร็จ");
        return;
      }
      setDealers((ds) => ds.filter((d) => d.uid !== uid));
    } catch {
      setErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ยังไม่ได้ถอด ลองใหม่อีกครั้ง");
    }
  }

  return (
    <PageShell>
      <PageHead
        group="ลูกค้า & การตลาด"
        title="ตัวแทนจำหน่าย"
        count={loading ? undefined : `${dealers.length} คน`}
        sub={
          <>
            บัญชีในทะเบียนเห็นราคาเรทตัวแทน (เรทที่ติ๊ก 🤝 ในหน้าแก้ไขสินค้า) — ได้ราคาตัวแทนอย่างเดียว ไม่ได้ส่วนลด/คูปอง/ของแถม
            · ลิงก์สมัครสำหรับส่งให้ลูกค้า: <b>iduckystore.com/dealer</b>
          </>
        }
      />

      {/* 📖 วิธีเพิ่มตัวแทน — กางเองตอนทะเบียนยังว่าง */}
      <HowToAddDealer open={!loading && dealers.length === 0 && applications.length === 0} />

      {/* 📥 ใบสมัครรออนุมัติ — งานค้าง อยู่บนสุดเสมอ */}
      {applications.length > 0 && (
        <>
          <ListHead title={`📥 รออนุมัติ (${applications.length} ใบ)`} note="สมัครจากหน้า /dealer" />
          <Rows>
            {applications.map((a) => (
              <Row key={a.uid} tone="var(--dk-coral-deep)">
                <RowMain
                  name={a.shopName}
                  tags={<Tag tone="coral">รออนุมัติ</Tag>}
                  meta={
                    <>
                      <span>{a.name || a.email || a.uid.slice(0, 8)}</span>
                      {a.email && <span> · {a.email}</span>}
                      {a.phone && <span> · {a.phone}</span>}
                      <span> · สมัคร {thDate(a.at)}</span>
                    </>
                  }
                />
                <RowSide>
                  <Btn small tone="navy" disabled={acting === a.uid} onClick={() => approve(a.uid)}>
                    {acting === a.uid ? "…" : "✅ อนุมัติ"}
                  </Btn>
                  <Btn
                    small
                    tone={confirmKey === `rej:${a.uid}` ? "navy" : "ghost"}
                    disabled={acting === a.uid}
                    onClick={() => twoTap(`rej:${a.uid}`, () => reject(a.uid))}
                  >
                    {confirmKey === `rej:${a.uid}` ? "กดอีกครั้งเพื่อปฏิเสธ" : "ปฏิเสธ"}
                  </Btn>
                </RowSide>
                <ApplicationPanel a={a} />
              </Row>
            ))}
          </Rows>
        </>
      )}

      {/* เพิ่มตัวแทนเองด้วยอีเมล (ทางลัด ไม่ต้องรอใบสมัคร) — ต้องเป็นบัญชีสมาชิกที่มีอยู่แล้ว */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="mt-5 grid gap-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <Field label="อีเมลบัญชีสมาชิก" value={email} onChange={setEmail} placeholder="เช่น dealer@shop.com" type="email" />
        <Field label="โน้ต (ชื่อร้าน/ทีม — ไม่บังคับ)" value={note} onChange={setNote} placeholder="เช่น ร้านป้ายเชียงใหม่" />
        <Btn tone="yolk" onClick={add} disabled={busy || !email.trim()}>
          {busy ? "กำลังเพิ่ม…" : "➕ เพิ่มตัวแทน"}
        </Btn>
        {/* ให้กด Enter ในช่องกรอกแล้วส่งฟอร์มได้ (Btn เป็น type=button) */}
        <button type="submit" hidden aria-hidden />
      </form>
      {err && (
        <p className="mt-2 px-1 text-[13px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
          {err}
        </p>
      )}

      <ListHead title="รายชื่อตัวแทน" note={loading ? "กำลังโหลด…" : undefined} />
      {loading ? (
        <Empty title="กำลังโหลดรายชื่อ…" body="ดึงทะเบียนตัวแทนกับข้อมูลบัญชีสมาชิกอยู่" />
      ) : dealers.length === 0 ? (
        <Empty
          title="ยังไม่มีตัวแทนจำหน่าย"
          body="ส่งลิงก์สมัคร iduckystore.com/dealer ให้ลูกค้า หรือเพิ่มเองด้วยอีเมลด้านบน — และอย่าลืมไปติ๊ก 🤝 เรทตัวแทนในสินค้าที่จะขายราคาตัวแทน"
        />
      ) : (
        <Rows>
          {dealers.map((d) => (
            <Row key={d.uid} tone="var(--dk-mint)">
              <RowMain
                name={d.name || d.email || d.uid.slice(0, 8)}
                tags={<Tag tone="mint">ตัวแทน</Tag>}
                meta={
                  <>
                    {d.email && <span>{d.email}</span>}
                    {d.phone && <span> · {d.phone}</span>}
                    <span> · เพิ่มเมื่อ {thDate(d.since)}</span>
                    {d.note && <span> · 📝 {d.note}</span>}
                  </>
                }
              />
              <RowSide>
                <Btn small tone="ghost" onClick={() => setOpenApp((o) => ({ ...o, [d.uid]: !o[d.uid] }))}>
                  {openApp[d.uid] ? "ซ่อนรายละเอียด" : "📄 ดูรายละเอียด"}
                </Btn>
                <Btn
                  small
                  tone={confirmKey === `rm:${d.uid}` ? "navy" : "ghost"}
                  onClick={() => twoTap(`rm:${d.uid}`, () => remove(d.uid))}
                >
                  {confirmKey === `rm:${d.uid}` ? "กดอีกครั้งเพื่อถอดออก" : "ถอดออก"}
                </Btn>
              </RowSide>
              {openApp[d.uid] && <DealerPanel d={d} onSave={(application) => manage({ uid: d.uid, application })} />}
            </Row>
          ))}
        </Rows>
      )}
    </PageShell>
  );
}
