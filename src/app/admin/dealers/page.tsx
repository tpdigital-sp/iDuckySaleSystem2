"use client";

/**
 * ตัวแทนจำหน่าย /admin/dealers
 *
 * ทะเบียนบัญชีสมาชิกที่เห็น "เรทราคาตัวแทนจำหน่าย" (เรทที่ติ๊ก dealerOnly ในหน้าแก้ไขสินค้า)
 * เพิ่มด้วยอีเมลของบัญชีสมาชิกที่มีอยู่แล้ว · ตัวแทนได้ราคาเรทตัวแทนอย่างเดียว
 * ไม่ได้ส่วนลดสมาชิก/คูปอง/โอนไว/ของแถม (เซิร์ฟเวอร์บังคับตอนสร้างออเดอร์)
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

/** วันที่แบบที่ทีมใช้คุยกัน (พ.ศ.) — since เก่าที่ไม่มีค่า = "—" */
function sinceText(iso: string): string {
  const d = new Date(iso);
  if (!iso || !isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminDealersPage() {
  const [dealers, setDealers] = useState<DealerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** uid ที่กด "ถอดออก" ครั้งแรกแล้ว — กดซ้ำถึงถอดจริง (ยืนยันในที่ ไม่เด้ง dialog) */
  const [confirmUid, setConfirmUid] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dealers", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) setErr(j.error ?? "โหลดรายชื่อไม่สำเร็จ — ลองรีเฟรชหน้า");
      setDealers(j.dealers ?? []);
    } catch {
      setErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — รายชื่อที่เห็นอาจไม่ใช่ล่าสุด");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/dealers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), note: note.trim() || undefined }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "เพิ่มตัวแทนไม่สำเร็จ");
        return;
      }
      setEmail("");
      setNote("");
      await load();
    } catch {
      setErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ยังไม่ได้เพิ่ม ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function remove(uid: string) {
    if (confirmUid !== uid) {
      setConfirmUid(uid);
      window.setTimeout(() => setConfirmUid((c) => (c === uid ? "" : c)), 4000);
      return;
    }
    setConfirmUid("");
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
        sub="บัญชีในรายชื่อนี้เห็นราคาเรทตัวแทน (เรทที่ติ๊ก 🤝 ในหน้าแก้ไขสินค้า) — ได้ราคาตัวแทนอย่างเดียว ไม่ได้ส่วนลด/คูปอง/ของแถม"
      />

      {/* เพิ่มตัวแทน — ต้องเป็นบัญชีสมาชิกที่มีอยู่แล้ว (สมัคร/ล็อกอินบนเว็บอย่างน้อย 1 ครั้ง) */}
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
          body="เพิ่มด้วยอีเมลของบัญชีสมาชิกด้านบน — ถ้ายังไม่มีบัญชี ให้ตัวแทนสมัครสมาชิก/ล็อกอินบนเว็บก่อน แล้วอย่าลืมไปติ๊ก 🤝 เรทตัวแทนในสินค้าที่จะขายราคาตัวแทน"
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
                    <span> · เพิ่มเมื่อ {sinceText(d.since)}</span>
                    {d.note && <span> · 📝 {d.note}</span>}
                  </>
                }
              />
              <RowSide>
                <Btn small tone={confirmUid === d.uid ? "navy" : "ghost"} onClick={() => remove(d.uid)}>
                  {confirmUid === d.uid ? "กดอีกครั้งเพื่อถอดออก" : "ถอดออก"}
                </Btn>
              </RowSide>
            </Row>
          ))}
        </Rows>
      )}
    </PageShell>
  );
}
