"use client";

/**
 * ตัวแทนจำหน่าย /admin/dealers
 *
 * ทะเบียนบัญชีสมาชิกที่เห็น "เรทราคาตัวแทนจำหน่าย" (เรทที่ติ๊ก dealerOnly ในหน้าแก้ไขสินค้า)
 * ลูกค้าสมัครเองได้จากหน้า /dealer → ขึ้นแถบรออนุมัติบนสุด · หรือแอดมินเพิ่มเองด้วยอีเมล
 * ตัวแทนได้ราคาเรทตัวแทนอย่างเดียว ไม่ได้ส่วนลดสมาชิก/คูปอง/โอนไว/ของแถม (เซิร์ฟเวอร์บังคับ)
 */

import { useCallback, useEffect, useState } from "react";
import { Btn, Empty, Field, ListHead, PageHead, PageShell, Row, RowMain, RowSide, Rows, Tag } from "@/components/admin/ui";

interface DealerRow {
  uid: string;
  email: string;
  name: string;
  phone: string;
  picture: string;
  note: string;
  since: string;
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
}

/** วันที่แบบที่ทีมใช้คุยกัน (พ.ศ.) — ค่าเก่าที่ไม่มี = "—" */
function thDate(iso: string): string {
  const d = new Date(iso);
  if (!iso || !isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dealers", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) setErr(j.error ?? "โหลดรายชื่อไม่สำเร็จ — ลองรีเฟรชหน้า");
      setDealers(j.dealers ?? []);
      setApplications(j.applications ?? []);
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
  async function manage(body: Record<string, string>): Promise<boolean> {
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
                      <span> · ช่องทาง: {a.channel}</span>
                      {a.detail && <span> · {a.detail}</span>}
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
                <Btn
                  small
                  tone={confirmKey === `rm:${d.uid}` ? "navy" : "ghost"}
                  onClick={() => twoTap(`rm:${d.uid}`, () => remove(d.uid))}
                >
                  {confirmKey === `rm:${d.uid}` ? "กดอีกครั้งเพื่อถอดออก" : "ถอดออก"}
                </Btn>
              </RowSide>
            </Row>
          ))}
        </Rows>
      )}
    </PageShell>
  );
}
