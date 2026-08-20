"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCustomer } from "@/lib/customer-context";
import { updateProfile } from "@/lib/customer-auth";
import { checkAvatarFile, removeAvatar, uploadAvatarBlob } from "@/lib/avatar-upload";
import AvatarCropper from "@/components/AvatarCropper";
import { AccountHead, AccountShell, MenuIco } from "@/components/account/AccountShell";

/*
 * ข้อมูลส่วนตัว — ดีไซน์เดียวกับหน้าแรก/แดชบอร์ด (โทนฟ้า-กรมท่า-ไข่แดง, ฟอนต์ Mitr + IBM Plex Sans Thai Looped)
 * โครง: เมนูข้าง + [หัวเรื่อง → การ์ดรูปโปรไฟล์ → การ์ดข้อมูลติดต่อ → การ์ดบัญชี/ความปลอดภัย]
 */

export default function ProfilePage() {
  const router = useRouter();
  const { customer, loading, refresh } = useCustomer();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avaBusy, setAvaBusy] = useState(false);
  const [avaMsg, setAvaMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /** ไฟล์ที่เพิ่งเลือก — เปิดหน้าต่างซูม/เลื่อนให้ตัดเองก่อนอัปโหลด */
  const [cropFile, setCropFile] = useState<File | null>(null);
  /** เปิดดูรูปโปรไฟล์ขนาดใหญ่ */
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    if (customer) {
      setName(customer.name);
      setPhone(customer.phone);
      setAddress(customer.address);
    }
  }, [customer]);

  useEffect(() => {
    if (!loading && !customer) router.replace("/account/login");
  }, [loading, customer, router]);

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await updateProfile({ name: name.trim(), phone: phone.trim(), address: address.trim() });
    setSaving(false);
    if (res.ok) {
      refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    }
  }

  /** เลือกไฟล์แล้วยังไม่อัปโหลดทันที — เปิดหน้าต่างซูม/เลื่อนให้จัดรูปก่อน */
  function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const bad = checkAvatarFile(file);
    if (bad) return setAvaMsg({ ok: false, text: bad });
    setAvaMsg(null);
    setCropFile(file);
  }

  /** ได้รูปที่ตัดแล้วจากหน้าต่างซูม → อัปโหลด */
  async function onCropped(blob: Blob) {
    setAvaBusy(true);
    const r = await uploadAvatarBlob(blob);
    setAvaBusy(false);
    setCropFile(null);
    if (r.ok) {
      refresh();
      setAvaMsg({ ok: true, text: "เปลี่ยนรูปโปรไฟล์แล้ว ✓" });
    } else setAvaMsg({ ok: false, text: r.error });
  }

  async function onRemoveAvatar() {
    setAvaBusy(true);
    setAvaMsg(null);
    const r = await removeAvatar();
    setAvaBusy(false);
    if (r.ok) {
      refresh();
      setAvaMsg({ ok: true, text: "ลบรูปโปรไฟล์แล้ว" });
    } else setAvaMsg({ ok: false, text: r.error || "ลบไม่สำเร็จ" });
  }

  if (loading || !customer) {
    return (
      <AccountShell active="profile">
        <div className="acd-loading">กำลังโหลด…</div>
      </AccountShell>
    );
  }

  const viaLine = /@line\.iducky\.local$/i.test(customer.email) || !!customer.lineUserId;
  const initial = (customer.name || customer.email || "ล").trim().charAt(0).toUpperCase();
  const dirty = name !== customer.name || phone !== customer.phone || address !== customer.address;

  return (
    <AccountShell active="profile">
      <AccountHead ico="profile" title="ข้อมูลส่วนตัว" sub="กรอกครั้งเดียว ระบบเติมให้อัตโนมัติทุกครั้งที่สั่งซื้อ — ไม่ต้องพิมพ์ซ้ำ" />

      {/* ───── รูปโปรไฟล์ ───── */}
      <section className="acd-card acd-photo">
        <div className="acd-ring acd-ring-plain">
          {customer.picture ? (
            <button
              type="button"
              className={`acd-avatar has-photo${avaBusy ? " busy" : ""}`}
              onClick={() => setZoomOpen(true)}
              title="ดูรูปใหญ่"
              aria-label="ดูรูปโปรไฟล์ขนาดใหญ่"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={customer.picture} alt="รูปโปรไฟล์" />
              <span className="acd-avatar-edit">{avaBusy ? "⏳" : "🔍"}</span>
            </button>
          ) : (
            <label className={`acd-avatar${avaBusy ? " busy" : ""}`} title="อัปโหลดรูปโปรไฟล์">
              <span className="acd-initial">{initial}</span>
              <span className="acd-avatar-edit">{avaBusy ? "⏳" : "📷"}</span>
              <input type="file" accept="image/*" onChange={onPickAvatar} disabled={avaBusy} aria-label="อัปโหลดรูปโปรไฟล์" />
            </label>
          )}
          {viaLine && (
            <span className="acd-avatar-badge" title="ยืนยันตัวตนผ่าน LINE">
              ✓
            </span>
          )}
        </div>

        <div className="acd-photo-txt">
          <span className="acd-chip acd-chip-sky">รูปโปรไฟล์</span>
          <p className="acd-photo-hint">
            JPG / PNG ไม่เกิน 8MB — เลือกไฟล์แล้วซูม/เลื่อนให้พอดีวงกลมได้เอง
            {customer.picture ? " · กดที่รูปเพื่อดูขนาดใหญ่" : ""}
          </p>
          <div className="acd-photo-actions">
            <label className={`btn btn-primary acd-btn-compact acd-file-btn${avaBusy ? " disabled" : ""}`}>
              {avaBusy ? "กำลังอัปโหลด…" : customer.picture ? "เปลี่ยนรูป" : "อัปโหลดรูป"} <span className="dot">📷</span>
              <input type="file" accept="image/*" onChange={onPickAvatar} disabled={avaBusy} />
            </label>
            {customer.picture && (
              <button type="button" className="acd-link-danger" onClick={onRemoveAvatar} disabled={avaBusy}>
                ลบรูป
              </button>
            )}
          </div>
          {avaMsg && <p className={`acd-msg${avaMsg.ok ? " ok" : " bad"}`}>{avaMsg.text}</p>}
        </div>
      </section>

      {/* ───── ข้อมูลติดต่อ ───── */}
      <section className="acd-card">
        <div className="acd-card-head">
          <span className="acd-chip acd-chip-sky">ข้อมูลติดต่อ</span>
          <p className="acd-card-sub">ใช้สำหรับออกใบเสร็จและจัดส่งพัสดุ</p>
        </div>

        <div className="acd-form">
          <div className="acd-field">
            <label htmlFor="pf-name">ชื่อ-นามสกุล</label>
            <input
              id="pf-name"
              className="acd-input"
              value={name}
              placeholder="ชื่อผู้รับ / ชื่อร้าน"
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="acd-field">
            <label htmlFor="pf-phone">เบอร์โทร</label>
            <input
              id="pf-phone"
              className="acd-input"
              value={phone}
              inputMode="tel"
              placeholder="08x-xxx-xxxx"
              onChange={(e) => {
                setPhone(e.target.value.replace(/[^\d\-+ ]/g, ""));
                setSaved(false);
              }}
            />
          </div>
          <div className="acd-field full">
            <label htmlFor="pf-addr">ที่อยู่จัดส่ง</label>
            <textarea
              id="pf-addr"
              className="acd-input"
              rows={4}
              value={address}
              placeholder="บ้านเลขที่ · ถนน · ตำบล/อำเภอ · จังหวัด · รหัสไปรษณีย์"
              onChange={(e) => {
                setAddress(e.target.value);
                setSaved(false);
              }}
            />
            <p className="acd-field-hint">📍 ที่อยู่นี้จะถูกเติมให้อัตโนมัติในหน้าชำระเงิน แก้ไขตอนสั่งซื้อได้เสมอ</p>
          </div>
        </div>

        <div className="acd-save-bar">
          <span className={`acd-save-note${saved ? " ok" : ""}`}>{saved ? "บันทึกเรียบร้อยแล้ว ✓" : dirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก" : ""}</span>
          <button type="button" className={`btn ${saved ? "btn-ghost" : "btn-primary"}`} onClick={save} disabled={saving || (!dirty && !saved)}>
            {saving ? "กำลังบันทึก…" : saved ? "บันทึกแล้ว" : "บันทึกข้อมูล"} <span className="dot">{saved ? "✓" : "💾"}</span>
          </button>
        </div>
      </section>

      {/* ───── บัญชีเข้าสู่ระบบ ───── */}
      <section className="acd-menu">
        <div className="acd-menu-head">บัญชีเข้าสู่ระบบ</div>
        <div className="acd-menu-item static">
          <div className={`acd-menu-ico ${viaLine ? "ico-mint" : "ico-blue"}`}>{viaLine ? "💬" : "✉️"}</div>
          <div className="acd-menu-col">
            <div className="acd-menu-label">{viaLine ? "เข้าสู่ระบบผ่าน LINE" : "เข้าสู่ระบบด้วยอีเมล"}</div>
            <div className="acd-menu-sub">{viaLine ? "ยืนยันตัวตนแล้ว — แจ้งเตือนสถานะออเดอร์ทาง LINE ได้" : customer.email}</div>
          </div>
          {viaLine && <span className="acd-line-badge">L</span>}
        </div>
        {!viaLine && (
          <Link href="/account/reset" className="acd-menu-item">
            <div className="acd-menu-ico ico-navy">🔒</div>
            <div className="acd-menu-label">เปลี่ยนรหัสผ่าน</div>
            <div className="acd-chevron">›</div>
          </Link>
        )}
        <Link href="/account/orders" className="acd-menu-item">
          <div className="acd-menu-ico ico-blue">
            <MenuIco name="orders" />
          </div>
          <div className="acd-menu-label">ประวัติการสั่งซื้อ</div>
          <div className="acd-menu-meta">ดูออเดอร์ทั้งหมด</div>
          <div className="acd-chevron">›</div>
        </Link>
      </section>

      {/* ซูม/เลื่อนรูปที่เพิ่งเลือกก่อนอัปโหลด */}
      {cropFile && <AvatarCropper file={cropFile} busy={avaBusy} onCancel={() => setCropFile(null)} onDone={onCropped} />}

      {/* ดูรูปโปรไฟล์ขนาดใหญ่ — คลิกพื้นหลังหรือกด Esc เพื่อปิด */}
      {zoomOpen && customer.picture && <AvatarLightbox src={customer.picture} onClose={() => setZoomOpen(false)} />}
    </AccountShell>
  );
}

/** ดูรูปโปรไฟล์เต็ม ๆ — ปิดด้วยคลิกพื้นหลัง ปุ่ม ✕ หรือปุ่ม Esc */
function AvatarLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="acd-lightbox" role="dialog" aria-modal="true" aria-label="รูปโปรไฟล์ขนาดใหญ่" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="รูปโปรไฟล์" onClick={(e) => e.stopPropagation()} />
      <button type="button" className="acd-modal-close" onClick={onClose} aria-label="ปิด">
        ✕
      </button>
    </div>
  );
}
