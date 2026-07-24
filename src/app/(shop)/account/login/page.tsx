"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/customer-auth";
import { useCustomer } from "@/lib/customer-context";

const LINE_ERR: Record<string, string> = {
  notset: "ร้านยังไม่ได้ตั้งค่า LINE Login",
  state: "เซสชันหมดอายุ ลองใหม่อีกครั้ง",
  token: "เชื่อมต่อ LINE ไม่สำเร็จ (เช็ก Channel ID/Secret)",
  profile: "ดึงข้อมูลโปรไฟล์ LINE ไม่สำเร็จ",
  session: "สร้างเซสชันไม่สำเร็จ",
  createuser: "สร้างบัญชีไม่สำเร็จ",
  nodb: "ระบบยังไม่พร้อม",
};

function LoginInner() {
  const router = useRouter();
  const { refresh } = useCustomer();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmMsg, setConfirmMsg] = useState("");

  const params = useSearchParams();
  useEffect(() => {
    const l = params.get("line");
    if (l) setErr(LINE_ERR[l] ?? "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ");
  }, [params]);

  async function submit() {
    setErr("");
    setConfirmMsg("");
    if (!email.trim() || !password) {
      setErr("กรอกอีเมลและรหัสผ่าน");
      return;
    }
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
        return setErr("กรอกชื่อ");
      }
      const res = await signUp(email.trim(), password, { name: name.trim(), phone: phone.trim(), address: address.trim() });
      setBusy(false);
      if (!res.ok) return setErr(res.error ?? "สมัครไม่สำเร็จ");
      if (res.needsConfirm) {
        setConfirmMsg("สมัครแล้ว! กรุณายืนยันอีเมลที่ส่งไป แล้วเข้าสู่ระบบ");
        setMode("login");
        return;
      }
      refresh();
      router.push("/account");
    }
  }

  const inputCls = "w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300";

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-center text-2xl font-extrabold text-amber-950">
        {mode === "login" ? "เข้าสู่ระบบสมาชิก" : "สมัครสมาชิก"}
      </h1>
      <p className="mt-1 text-center text-sm text-stone-500">
        {mode === "login" ? "ยังไม่มีบัญชี? " : "มีบัญชีแล้ว? "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setErr("");
          }}
          className="font-bold text-amber-600 hover:underline"
        >
          {mode === "login" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
        </button>
      </p>

      <div className="mt-6 space-y-3">
        {mode === "signup" && (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ-นามสกุล" className={inputCls} />
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\-+ ]/g, ""))} inputMode="tel" placeholder="เบอร์โทร (ไม่บังคับ)" className={inputCls} />
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="ที่อยู่จัดส่ง (ไม่บังคับ)" className={`${inputCls} resize-y`} />
          </>
        )}
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="อีเมล" className={inputCls} />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)"
          onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
          className={inputCls}
        />
        <div className="text-right">
          <Link href="/account/reset" className="text-xs font-semibold text-amber-600 hover:underline">
            ลืมรหัสผ่าน?
          </Link>
        </div>
      </div>

      {err && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{err}</p>}
      {confirmMsg && <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">{confirmMsg}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-4 w-full rounded-full bg-amber-400 px-6 py-3.5 text-base font-bold text-white shadow-lg transition hover:scale-[1.01] hover:bg-amber-500 disabled:opacity-50"
      >
        {busy ? "กำลังดำเนินการ…" : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
      </button>

      <div className="my-4 flex items-center gap-3 text-xs text-stone-400">
        <span className="h-px flex-1 bg-stone-200" /> หรือ <span className="h-px flex-1 bg-stone-200" />
      </div>
      <a
        href="/api/auth/line/login"
        className="flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] px-6 py-3.5 text-base font-bold text-white shadow transition hover:bg-[#05b34c]"
      >
        💬 เข้าสู่ระบบด้วย LINE
      </a>

      <Link href="/products" className="mt-4 block text-center text-sm font-semibold text-stone-400 hover:text-stone-600">
        ← เลือกซื้อสินค้าต่อ
      </Link>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-stone-400">กำลังโหลด…</div>}>
      <LoginInner />
    </Suspense>
  );
}
