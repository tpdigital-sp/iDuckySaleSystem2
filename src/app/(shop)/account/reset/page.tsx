"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthChange, requestPasswordReset, updatePassword } from "@/lib/customer-auth";
import { getSupabase } from "@/lib/supabase";

/* โทนสีตามไฟล์ดีไซน์การ์ด Reset your password (ชุดเดียวกับหน้า login) */
const NAVY = "#243762";

const inputCls =
  "h-12 w-full rounded-md bg-white px-4 text-center text-sm text-[#243762] shadow-sm placeholder:italic placeholder:text-[#9aa7bd] focus:outline-none focus:ring-2 focus:ring-[#7ccad4]";

/**
 * รีเซ็ตรหัสผ่าน 2 โหมด:
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
    if (!email.trim()) return setErr("กรอกอีเมล");
    setBusy(true);
    const res = await requestPasswordReset(email.trim());
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "ส่งลิงก์ไม่สำเร็จ");
    setSent(true);
  }

  async function setNewPassword() {
    setErr("");
    if (password.length < 6) return setErr("รหัสผ่านอย่างน้อย 6 ตัวอักษร");
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "ตั้งรหัสใหม่ไม่สำเร็จ");
    setDone(true);
    setTimeout(() => router.replace("/account"), 1500);
  }

  return (
    <div className="mx-auto max-w-[620px] px-4 py-10">
      <div className="rounded-[28px] bg-[#DDEEF7] px-5 pb-10 pt-8 shadow-[0_14px_34px_rgba(44,129,196,.14)] sm:px-12">
        {/* เป็ดงง ๆ กับกุญแจล็อกรหัส ตามการ์ด Reset your password */}
        <img src="/account/duck-reset.svg" alt="" className="mx-auto w-[62%] max-w-[280px]" width={343} height={303} />
        <h1 className="mt-4 text-center text-3xl font-semibold sm:text-4xl" style={{ color: NAVY, fontFamily: "var(--display)" }}>
          {mode === "set" ? "ตั้งรหัสผ่านใหม่" : "Reset your password"}
        </h1>

        {mode === "set" ? (
          done ? (
            <p className="mx-auto mt-6 max-w-[400px] rounded-xl bg-emerald-50 p-4 text-center text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
              ✅ ตั้งรหัสใหม่แล้ว กำลังพาไปหน้าบัญชี…
            </p>
          ) : (
            <div className="mx-auto mt-6 max-w-[400px] space-y-4">
              <p className="text-center text-sm font-semibold" style={{ color: NAVY }}>
                ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="* รหัสผ่านใหม่ (6 ตัวขึ้นไป) *"
                onKeyDown={(e) => e.key === "Enter" && !busy && setNewPassword()}
                className={inputCls}
              />
              {err && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600">{err}</p>}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={setNewPassword}
                  disabled={busy}
                  className="rounded-md px-10 py-3.5 text-base font-bold uppercase tracking-[0.15em] text-white shadow-md transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: NAVY }}
                >
                  {busy ? "กำลังบันทึก…" : "Save Password"}
                </button>
              </div>
            </div>
          )
        ) : sent ? (
          <p className="mx-auto mt-6 max-w-[400px] rounded-xl bg-emerald-50 p-4 text-center text-sm text-emerald-700 ring-1 ring-emerald-200">
            📧 ส่งลิงก์รีเซ็ตไปที่ <strong>{email}</strong> แล้ว — เปิดอีเมลแล้วกดลิงก์เพื่อตั้งรหัสใหม่
          </p>
        ) : (
          <div className="mx-auto mt-5 max-w-[400px] space-y-4">
            <p className="text-center text-sm font-semibold" style={{ color: NAVY }}>
              กรอกอีเมลที่สมัครไว้ เราจะส่งลิงก์ตั้งรหัสใหม่ให้
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="* Your Email *"
              onKeyDown={(e) => e.key === "Enter" && !busy && sendLink()}
              className={inputCls}
            />
            <p className="text-sm font-semibold" style={{ color: NAVY }}>
              * จำเป็นต้องกรอก *
            </p>
            {err && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600">{err}</p>}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={sendLink}
                disabled={busy}
                className="rounded-md px-10 py-3.5 text-base font-bold uppercase tracking-[0.15em] text-white shadow-md transition hover:opacity-90 disabled:opacity-50"
                style={{ background: NAVY }}
              >
                {busy ? "กำลังส่ง…" : "Resend Password"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 text-center">
        <Link href="/account/login" className="text-sm font-semibold text-stone-400 hover:text-stone-600">
          ← กลับไปเข้าสู่ระบบ
        </Link>
      </div>
    </div>
  );
}
