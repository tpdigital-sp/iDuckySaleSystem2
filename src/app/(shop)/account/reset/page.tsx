"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthChange, requestPasswordReset, updatePassword } from "@/lib/customer-auth";
import { getSupabase } from "@/lib/supabase";

/*
 * รีเซ็ตรหัสผ่าน — ชุดดีไซน์เดียวกับหน้าเข้าสู่ระบบ (prefix .auth- ใน landing.css)
 * 2 โหมด:
 *  • ยังไม่มีลิงก์ → กรอกอีเมล ส่งลิงก์รีเซ็ต
 *  • มาจากลิงก์อีเมล (เซสชัน recovery) → ตั้งรหัสใหม่
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"request" | "set">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  // ตรวจว่ามาจากลิงก์อีเมลไหม (Supabase ยิง event PASSWORD_RECOVERY) หรือมี session อยู่แล้ว
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      if (data.session) setMode("set");
    });
    const off = onAuthChange(() => {});
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setMode("set");
    });
    return () => {
      off();
      sub.subscription.unsubscribe();
    };
  }, []);

  async function sendLink() {
    setErr("");
    if (!email.trim()) return setErr("กรอกอีเมลที่สมัครไว้ก่อนนะครับ");
    setBusy(true);
    const res = await requestPasswordReset(email.trim());
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "ส่งลิงก์ไม่สำเร็จ");
    setSent(true);
  }

  async function setNewPassword() {
    setErr("");
    if (password.length < 6) return setErr("รหัสผ่านต้องยาว 6 ตัวขึ้นไป");
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    setDone(true);
    setTimeout(() => router.replace("/account"), 1500);
  }

  return (
    <div className="dl dl-page auth-page">
      <div className="top-stack auth-stack">
        <img className="bg-cloud auth-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud auth-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud auth-c3" src="/landing/cloud.webp" alt="" aria-hidden="true" />

        <div className="auth-wrap">
          <div className="auth-card">
            {/* เป็ดงง ๆ กับกุญแจล็อกรหัส */}
            <img src="/account/duck-reset.svg" alt="" className="auth-art" style={{ maxWidth: 196 }} width={343} height={303} />
            <h1 className="auth-h1">{mode === "set" ? <>ตั้ง<em>รหัสผ่านใหม่</em></> : <>ลืม<em>รหัสผ่าน</em>?</>}</h1>
            <p className="auth-sub">
              {mode === "set" ? "ตั้งรหัสผ่านใหม่ให้บัญชีของคุณ แล้วเข้าใช้งานได้ทันที" : "กรอกอีเมลที่สมัครไว้ เราจะส่งลิงก์ตั้งรหัสใหม่ไปให้"}
            </p>

            {mode === "set" ? (
              done ? (
                <p className="auth-msg ok">✅ เปลี่ยนรหัสผ่านเรียบร้อย — กำลังพาไปหน้าบัญชีของคุณ…</p>
              ) : (
                <>
                  <div className="auth-form">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="รหัสผ่านใหม่ (6 ตัวขึ้นไป) *"
                      aria-label="รหัสผ่านใหม่"
                      onKeyDown={(e) => e.key === "Enter" && !busy && setNewPassword()}
                      className="auth-input"
                    />
                  </div>
                  {err && <p className="auth-msg err">{err}</p>}
                  <div className="auth-actions">
                    <button type="button" onClick={setNewPassword} disabled={busy} className="btn btn-yolk">
                      {busy ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"} <span className="dot">→</span>
                    </button>
                  </div>
                </>
              )
            ) : sent ? (
              <p className="auth-msg ok">
                📧 ส่งลิงก์รีเซ็ตไปที่ <b>{email}</b> แล้ว — เปิดอีเมลแล้วกดลิงก์เพื่อตั้งรหัสใหม่ได้เลย
              </p>
            ) : (
              <>
                <div className="auth-form">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="อีเมล *"
                    aria-label="อีเมล"
                    onKeyDown={(e) => e.key === "Enter" && !busy && sendLink()}
                    className="auth-input"
                  />
                  <p className="auth-hint">* จำเป็นต้องกรอก</p>
                </div>
                {err && <p className="auth-msg err">{err}</p>}
                <div className="auth-actions">
                  <button type="button" onClick={sendLink} disabled={busy} className="btn btn-yolk">
                    {busy ? "กำลังส่ง…" : "ส่งลิงก์รีเซ็ต"} <span className="dot">→</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <Link href="/account/login" className="auth-back">
            ← กลับไปเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  );
}
