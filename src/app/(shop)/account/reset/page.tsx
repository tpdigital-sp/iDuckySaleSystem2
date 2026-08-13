"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthChange, requestPasswordReset, updatePassword } from "@/lib/customer-auth";
import { getSupabase } from "@/lib/supabase";

/* โทน/ฟอนต์ตามหน้าแรก: ครอบด้วย .dl ใช้ token ของ landing.css (ชุดเดียวกับหน้า login) */

const inputCls =
  "h-12 w-full rounded-full bg-white px-5 text-center text-sm text-[#173A6B] ring-1 ring-[#C6E8FB] placeholder:text-[#8FA6C4] focus:outline-none focus:ring-2 focus:ring-[#57B6E8]";

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
    <div style={{ fontFamily: "var(--body)", color: "var(--navy)" }}>
      <div className="mx-auto max-w-[620px] px-4 py-10">
        <div
          className="px-5 pb-10 pt-8 sm:px-12"
          style={{ background: "var(--sky-100)", borderRadius: "var(--r-l)", boxShadow: "var(--shadow-m)" }}
        >
          {/* เป็ดงง ๆ กับกุญแจล็อกรหัส */}
          <img src="/account/duck-reset.svg" alt="" className="mx-auto w-[62%] max-w-[280px]" width={343} height={303} />
          <p className="mt-4 text-center text-[11px] font-bold tracking-[0.32em]" style={{ color: "var(--blue-deep)" }}>
            RESET PASSWORD
          </p>
          <h1 className="mt-1 text-center text-3xl sm:text-[2.15rem]" style={{ color: "var(--navy)", fontFamily: "var(--display)", fontWeight: 500 }}>
            {mode === "set" ? "ตั้งรหัสผ่านใหม่" : "รีเซ็ตรหัสผ่าน"}
          </h1>

          {mode === "set" ? (
            done ? (
              <p className="mx-auto mt-6 max-w-[400px] rounded-2xl bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
                ✅ ตั้งรหัสใหม่แล้ว กำลังพาไปหน้าบัญชี…
              </p>
            ) : (
              <div className="mx-auto mt-5 max-w-[400px] space-y-4">
                <p className="text-center text-sm" style={{ color: "var(--navy-soft)" }}>
                  ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ
                </p>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="รหัสผ่านใหม่ (6 ตัวขึ้นไป) *"
                  onKeyDown={(e) => e.key === "Enter" && !busy && setNewPassword()}
                  className={inputCls}
                />
                {err && <p className="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600">{err}</p>}
                <div className="dl pt-2 text-center" style={{ background: "transparent" }}>
                  <button type="button" onClick={setNewPassword} disabled={busy} className="btn btn-yolk" style={busy ? { opacity: 0.6 } : undefined}>
                    {busy ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"} <span className="dot">→</span>
                  </button>
                </div>
              </div>
            )
          ) : sent ? (
            <p className="mx-auto mt-6 max-w-[400px] rounded-2xl bg-emerald-50 p-4 text-center text-sm text-emerald-700 ring-1 ring-emerald-200">
              📧 ส่งลิงก์รีเซ็ตไปที่ <strong>{email}</strong> แล้ว — เปิดอีเมลแล้วกดลิงก์เพื่อตั้งรหัสใหม่
            </p>
          ) : (
            <div className="mx-auto mt-5 max-w-[400px] space-y-4">
              <p className="text-center text-sm" style={{ color: "var(--navy-soft)" }}>
                กรอกอีเมลที่สมัครไว้ เราจะส่งลิงก์ตั้งรหัสใหม่ให้
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="อีเมล *"
                onKeyDown={(e) => e.key === "Enter" && !busy && sendLink()}
                className={inputCls}
              />
              <p className="px-1 text-xs" style={{ color: "var(--navy-soft)" }}>
                * จำเป็นต้องกรอก
              </p>
              {err && <p className="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600">{err}</p>}
              <div className="dl pt-2 text-center" style={{ background: "transparent" }}>
                <button type="button" onClick={sendLink} disabled={busy} className="btn btn-yolk" style={busy ? { opacity: 0.6 } : undefined}>
                  {busy ? "กำลังส่ง…" : "ส่งลิงก์รีเซ็ต"} <span className="dot">→</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 text-center">
          <Link href="/account/login" className="text-sm hover:underline" style={{ color: "var(--navy-soft)" }}>
            ← กลับไปเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  );
}
