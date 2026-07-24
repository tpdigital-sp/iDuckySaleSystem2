"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthChange, requestPasswordReset, updatePassword } from "@/lib/customer-auth";
import { getSupabase } from "@/lib/supabase";

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

  const inputCls = "w-full rounded-2xl bg-white px-4 py-3 text-sm text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300";

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold text-amber-950">
        {mode === "set" ? "ตั้งรหัสผ่านใหม่" : "ลืมรหัสผ่าน"}
      </h1>

      {mode === "set" ? (
        done ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 p-4 text-center text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
            ✅ ตั้งรหัสใหม่แล้ว กำลังพาไปหน้าบัญชี…
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"
              className={inputCls}
            />
            {err && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600">{err}</p>}
            <button
              type="button"
              onClick={setNewPassword}
              disabled={busy}
              className="w-full rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-white transition hover:bg-amber-500 disabled:opacity-50"
            >
              {busy ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}
            </button>
          </div>
        )
      ) : sent ? (
        <p className="mt-6 rounded-2xl bg-emerald-50 p-4 text-center text-sm text-emerald-700 ring-1 ring-emerald-200">
          📧 ส่งลิงก์รีเซ็ตไปที่ <strong>{email}</strong> แล้ว — เปิดอีเมลแล้วกดลิงก์เพื่อตั้งรหัสใหม่
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-center text-sm text-stone-500">กรอกอีเมลที่สมัครไว้ เราจะส่งลิงก์ตั้งรหัสใหม่ให้</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="อีเมล"
            className={inputCls}
          />
          {err && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600">{err}</p>}
          <button
            type="button"
            onClick={sendLink}
            disabled={busy}
            className="w-full rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-white transition hover:bg-amber-500 disabled:opacity-50"
          >
            {busy ? "กำลังส่ง…" : "ส่งลิงก์รีเซ็ต"}
          </button>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/account/login" className="text-sm font-semibold text-stone-400 hover:text-stone-600">← กลับไปเข้าสู่ระบบ</Link>
      </div>
    </div>
  );
}
