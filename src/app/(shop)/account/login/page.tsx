"use client";

/* eslint-disable @next/next/no-img-element */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/customer-auth";
import { useCustomer } from "@/lib/customer-context";

const LINE_ERR: Record<string, string> = {
  notset: "ยังไม่ได้ตั้งค่าเข้าสู่ระบบด้วย LINE",
  state: "เซสชันหมดอายุ — ลองใหม่อีกครั้งครับ",
  token: "เชื่อมต่อ LINE ไม่สำเร็จ (ตรวจ Channel ID/Secret)",
  profile: "โหลดโปรไฟล์ LINE ไม่สำเร็จ",
  session: "สร้างเซสชันไม่สำเร็จ",
  createuser: "สร้างบัญชีไม่สำเร็จ",
  nodb: "ระบบยังไม่พร้อมใช้งาน",
};

/*
 * หน้าเข้าสู่ระบบ / สมัครสมาชิก — ภาษาการออกแบบเดียวกับหน้าแรก
 * ครอบด้วย .dl dl-page auth-page เพื่อใช้ token ของ landing.css ทั้งชุด
 * (Mitr หัวเรื่อง+ปุ่ม · Plex Looped เนื้อความ · sky/navy/yolk · พื้นฟ้าไล่สี + เมฆลอย)
 * สไตล์ทั้งหมดอยู่ใน landing.css หัวข้อ "หน้าเข้าสู่ระบบ…" prefix .auth-
 */

/** ไอคอนวงกลมฟ้าหน้าช่องกรอก */
function FieldIcon({ name }: { name: "user" | "lock" }) {
  const d =
    name === "user"
      ? "M12 12a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm-5.6 6.4a5.6 5.6 0 0 1 11.2 0"
      : "M8.4 11V8.8a3.6 3.6 0 0 1 7.2 0V11M7.6 11h8.8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H7.6a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z";
  return (
    <span className="ico" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

/** ช่องกรอกแบบมีไอคอนด้านซ้าย */
function IconField({ icon, ...props }: { icon: "user" | "lock" } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="auth-field">
      <FieldIcon name={icon} />
      <input {...props} className="auth-input" />
    </label>
  );
}

function LoginInner() {
  const router = useRouter();
  const { refresh } = useCustomer();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmMsg, setConfirmMsg] = useState("");

  const params = useSearchParams();
  useEffect(() => {
    const l = params.get("line");
    if (l) setErr(LINE_ERR[l] ?? "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ");
  }, [params]);

  // "จำอีเมลไว้" — เก็บเฉพาะอีเมลใน localStorage ไว้เติมให้ครั้งหน้า (เซสชันล็อกอินคงอยู่ตามระบบอยู่แล้ว)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("login-email");
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {}
  }, []);

  async function submit() {
    setErr("");
    setConfirmMsg("");
    if (!email.trim() || !password) {
      setErr("กรอกอีเมลและรหัสผ่านก่อนนะครับ");
      return;
    }
    try {
      if (remember) localStorage.setItem("login-email", email.trim());
      else localStorage.removeItem("login-email");
    } catch {}
    setBusy(true);
    if (mode === "login") {
      const res = await signIn(email.trim(), password);
      setBusy(false);
      if (!res.ok) return setErr(res.error ?? "เข้าสู่ระบบไม่สำเร็จ");
      refresh();
      router.push("/account");
    } else {
      if (!name.trim()) {
        setBusy(false);
        return setErr("กรอกชื่อ-นามสกุลด้วยครับ");
      }
      const res = await signUp(email.trim(), password, { name: name.trim(), phone: phone.trim(), address: address.trim() });
      setBusy(false);
      if (!res.ok) return setErr(res.error ?? "สมัครสมาชิกไม่สำเร็จ");
      if (res.needsConfirm) {
        setConfirmMsg("สมัครเรียบร้อย! กรุณายืนยันอีเมลก่อน แล้วกลับมาเข้าสู่ระบบได้เลย");
        setMode("login");
        return;
      }
      refresh();
      router.push("/account");
    }
  }

  function pickMode(m: "login" | "signup") {
    if (m === mode) return;
    setMode(m);
    setErr("");
    setConfirmMsg("");
  }

  return (
    <div className="dl dl-page auth-page">
      <div className="top-stack auth-stack">
        <img className="bg-cloud auth-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud auth-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud auth-c3" src="/landing/cloud.webp" alt="" aria-hidden="true" />

        <div className="auth-wrap">
          <div className="auth-card">
            {/* สลับโหมด — เห็นทั้งสองทางเลือกพร้อมกัน รู้ว่าอยู่โหมดไหน */}
            <div className="auth-tabs" role="tablist" aria-label="เลือกโหมด">
              <button type="button" role="tab" aria-selected={mode === "login"} className={`auth-tab${mode === "login" ? " on" : ""}`} onClick={() => pickMode("login")}>
                เข้าสู่ระบบ
              </button>
              <button type="button" role="tab" aria-selected={mode === "signup"} className={`auth-tab${mode === "signup" ? " on" : ""}`} onClick={() => pickMode("signup")}>
                สมัครสมาชิก
              </button>
            </div>

            {mode === "login" ? (
              <>
                {/* เป็ดนั่งหน้าคอมในซุ้มโค้ง */}
                <img src="/account/duck-login.svg" alt="" className="auth-art" width={408} height={317} />
                <h1 className="auth-h1">
                  ยินดีต้อนรับ<em>กลับมา</em>
                </h1>
                <p className="auth-sub">เข้าสู่ระบบสมาชิก iDucky Prints Studio</p>

                <div className="auth-form">
                  <IconField
                    icon="user"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    inputMode="email"
                    placeholder="อีเมล"
                    aria-label="อีเมล"
                  />
                  <IconField
                    icon="lock"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="รหัสผ่าน"
                    aria-label="รหัสผ่าน"
                    onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
                  />
                  <div className="auth-row">
                    <label className="auth-check">
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                      จำอีเมลไว้
                    </label>
                    <Link href="/account/reset" className="auth-link">
                      ลืมรหัสผ่าน?
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* เป็ดในวงกลม + หัวข้อสมัครสมาชิก */}
                <img src="/account/duck-avatar.svg" alt="" className="auth-art small" width={243} height={299} />
                <h1 className="auth-h1">
                  สมัครสมาชิก<em>ฟรี</em>
                </h1>
                <p className="auth-sub">เก็บประวัติสั่งซื้อ ติดตามงาน และรับส่วนลดสมาชิก</p>

                <div className="auth-form">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ-นามสกุล *" aria-label="ชื่อ-นามสกุล" className="auth-input" />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d\-+ ]/g, ""))}
                    inputMode="tel"
                    placeholder="เบอร์โทร (ไม่บังคับ)"
                    aria-label="เบอร์โทร"
                    className="auth-input"
                  />
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={2}
                    placeholder="ที่อยู่จัดส่ง (ไม่บังคับ)"
                    aria-label="ที่อยู่จัดส่ง"
                    className="auth-input"
                  />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="อีเมล *" aria-label="อีเมล" className="auth-input" />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="รหัสผ่าน (6 ตัวขึ้นไป) *"
                    aria-label="รหัสผ่าน"
                    onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
                    className="auth-input"
                  />
                  <p className="auth-hint">* จำเป็นต้องกรอก</p>
                </div>
              </>
            )}

            {err && <p className="auth-msg err">{err}</p>}
            {confirmMsg && <p className="auth-msg ok">{confirmMsg}</p>}

            <div className="auth-actions">
              <button type="button" onClick={submit} disabled={busy} className="btn btn-yolk">
                {busy ? "รอสักครู่…" : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"} <span className="dot">→</span>
              </button>
            </div>

            <div className="auth-or">หรือ</div>
            <a href="/api/auth/line/login" className="auth-line">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M12 3C6.9 3 2.8 6.4 2.8 10.5c0 3.7 3.2 6.8 7.6 7.4.3.06.7.2.8.45.1.23.06.58.03.81l-.13.77c-.04.23-.18.9.79.49s5.23-3.08 7.13-5.27c1.31-1.44 1.94-2.9 1.94-4.65C20.96 6.4 16.9 3 12 3Z" />
              </svg>
              เข้าสู่ระบบด้วย LINE
            </a>
          </div>

          <Link href="/products" className="auth-back">
            ← เลือกซื้อสินค้าต่อ
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="dl dl-page auth-page"><div className="top-stack auth-stack"><div className="auth-wrap"><p className="auth-sub">กำลังโหลด…</p></div></div></div>}>
      <LoginInner />
    </Suspense>
  );
}
