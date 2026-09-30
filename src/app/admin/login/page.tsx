"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAdminSession, signInAdmin } from "@/lib/auth";
/*
 * ดีไซน์ (30 ก.ย. 69): ยกเข้าภาษาการออกแบบเดียวกับหน้าแรก/หน้าล็อกอินลูกค้า
 * ครอบ .dl dl-page auth-page แล้วยืมชุด .auth-* จาก landing.css ทั้งชุด · ส่วนเสริมเฉพาะหน้านี้อยู่ login.css (prefix .adl-)
 * ⚠️ landing.css ต้องมาก่อน login.css (ลำดับ import = ลำดับทับ)
 */
import "@/app/(shop)/landing.css";
import "./login.css";

/** จำ "ชื่อผู้ใช้" ล่าสุดไว้ในเครื่อง */
const REMEMBER_KEY = "admin.login.username";
/**
 * จำ "รหัสผ่าน" ไว้ในเครื่องด้วย (ผู้ใช้สั่ง 14 ส.ค. 69 — ตัวจำรหัสของเบราว์เซอร์ไม่เด้งถามในหลายเครื่อง)
 * ⚠️ เก็บแบบเข้ารหัสพื้นฐาน (base64) ในเบราว์เซอร์เครื่องนั้น — กันตาเปล่า ไม่ใช่กันแฮ็กเกอร์
 * ใครใช้เครื่องนั้นได้ก็เข้าหลังบ้านได้ · จึงผูกกับติ๊ก "จำการเข้าสู่ระบบ" ให้ปิดได้บนเครื่องส่วนกลาง
 */
const SECRET_KEY = "admin.login.secret";
const enc = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const dec = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [showPw, setShowPw] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  // เติมชื่อผู้ใช้ + รหัสผ่านที่จำไว้ในเครื่อง — เหลือกดปุ่ม "เข้าสู่ระบบ" ปุ่มเดียว
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setUsername(saved);
        passwordRef.current?.focus();
      }
      const secret = localStorage.getItem(SECRET_KEY);
      if (secret) setPassword(dec(secret));
    } catch {}
  }, []);

  // ปลายทางหลังล็อกอิน — คืนค่า ?next= (เฉพาะ path ภายใน /admin กัน open-redirect) ไม่งั้น /admin
  function nextDest() {
    const n = new URLSearchParams(window.location.search).get("next");
    return n && n.startsWith("/admin") ? n : "/admin";
  }

  useEffect(() => {
    getAdminSession().then((s) => {
      setConfigured(s.configured);
      if (s.loggedIn) router.replace(nextDest());
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signInAdmin(username, password);
    setLoading(false);
    if (res.ok) {
      // จำ/ลืมชื่อผู้ใช้+รหัสผ่านตามที่ติ๊ก — บันทึกเฉพาะตอนล็อกอินสำเร็จ (กันจำค่าที่พิมพ์ผิด)
      try {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, username.trim());
          localStorage.setItem(SECRET_KEY, enc(password));
        } else {
          localStorage.removeItem(REMEMBER_KEY);
          localStorage.removeItem(SECRET_KEY);
        }
      } catch {}
      /**
       * เปลี่ยนหน้าแบบเต็ม (ไม่ใช่ SPA push) — ตัวจำรหัสของ Chrome/Safari จะถือว่า
       * "ส่งฟอร์มแล้วเปลี่ยนหน้า = ล็อกอินสำเร็จ" ถึงจะเด้งถามบันทึกรหัสผ่าน
       */
      window.location.assign(nextDest());
    } else setError(res.error ?? "เข้าสู่ระบบไม่สำเร็จ");
  }

  return (
    <div className="dl dl-page auth-page adl-page">
      <div className="top-stack auth-stack adl-stack">
        <img className="bg-cloud auth-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud auth-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud auth-c3" src="/landing/cloud.webp" alt="" aria-hidden="true" />

        <div className="auth-wrap">
          <div className="auth-card">
            <div className="adl-eyebrow-wrap">
              <span className="adl-eyebrow">
                <span className="lock" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8.4 11V8.8a3.6 3.6 0 0 1 7.2 0V11M7.6 11h8.8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H7.6a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z" />
                  </svg>
                </span>
                สำหรับทีมงาน iDucky
              </span>
            </div>

            {/* เป็ดนั่งหน้าคอม — ภาพเดียวกับหน้าล็อกอินลูกค้า */}
            <img src="/account/duck-login.svg" alt="" className="auth-art adl-art" width={408} height={317} />
            <h1 className="auth-h1">
              เข้าสู่ระบบ<em>หลังบ้าน</em>
            </h1>
            <p className="auth-sub">ระบบจัดการร้าน iDucky Prints Studio · สำหรับแอดมินและพนักงาน</p>

            {configured === false && (
              <p className="auth-msg warn">
                ⚠️ ยังไม่ได้ตั้งค่าฐานข้อมูล — ตอนนี้เป็นโหมดเดโม เข้าหลังบ้านได้เลยไม่ต้องล็อกอิน{" "}
                <Link href="/admin">ไปหลังบ้าน →</Link>
              </p>
            )}

            {/* method/action ใส่ไว้เป็น "ป้ายบอก" ตัวจำรหัสของ Safari ว่านี่คือฟอร์มล็อกอินจริง (JS ยิง API เองผ่าน onSubmit) */}
            <form onSubmit={handleSubmit} method="post" action="/admin" className="auth-form">
              <div className="adl-fld">
                <label htmlFor="admin-username" className="adl-lab">
                  ชื่อผู้ใช้ (username)
                </label>
                <span className="auth-field">
                  <FieldIcon name="user" />
                  <input
                    type="text"
                    name="username"
                    id="admin-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="เช่น champ"
                    required
                    className="auth-input"
                  />
                </span>
              </div>
              <div className="adl-fld">
                <label htmlFor="admin-password" className="adl-lab">
                  รหัสผ่าน
                </label>
                <span className="auth-field adl-has-eye">
                  <FieldIcon name="lock" />
                  <input
                    ref={passwordRef}
                    type={showPw ? "text" : "password"}
                    name="password"
                    id="admin-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                    className="auth-input"
                  />
                  <button
                    type="button"
                    className="adl-eye"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    aria-pressed={showPw}
                    title={showPw ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  >
                    <EyeIcon off={showPw} />
                  </button>
                </span>
              </div>

              <div className="auth-row">
                <label className="auth-check">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  จำการเข้าสู่ระบบในเครื่องนี้
                </label>
              </div>

              {error && (
                <p className="auth-msg err" role="alert">
                  ⚠️ {error}
                </p>
              )}

              <div className="auth-actions adl-actions">
                <button type="submit" disabled={loading} className="btn btn-yolk">
                  {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"} <span className="dot">→</span>
                </button>
              </div>
            </form>

            <p className="adl-help">
              ลืมรหัสผ่าน? แจ้ง<b>เจ้าของร้าน</b>ตั้งรหัสใหม่ให้ได้ที่หน้า “พนักงาน”
            </p>
          </div>

          <div className="adl-foot">
            <Link href="/">← กลับหน้าร้าน</Link>
            <span className="sep" aria-hidden="true">
              ·
            </span>
            <Link href="/account/login">เข้าสู่ระบบสมาชิก (ลูกค้า)</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ไอคอนวงกลมฟ้าหน้าช่องกรอก — ชุดเดียวกับหน้าล็อกอินลูกค้า */
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

/** ตา = แสดงรหัส · ตาขีดทับ = ซ่อน */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}
