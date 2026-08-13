"use client";

/* eslint-disable @next/next/no-img-element */
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

/* โทนสีตามไฟล์ดีไซน์ Log in+Create account.svg: การ์ด #bbddef/50%, ตัวอักษร #243762, ปุ่ม LOGIN #7ccad4 */
const NAVY = "#243762";
const TEAL = "#7ccad4";

/** ช่องกรอกแบบมีไอคอนวงกลมฟ้าด้านซ้าย (ตามการ์ด User Login) */
function IconField({
  icon,
  ...props
}: { icon: "user" | "lock" } & React.InputHTMLAttributes<HTMLInputElement>) {
  const d =
    icon === "user"
      ? "M12 12a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm-5.6 6.4a5.6 5.6 0 0 1 11.2 0"
      : "M8.4 11V8.8a3.6 3.6 0 0 1 7.2 0V11M7.6 11h8.8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H7.6a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z";
  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-[#b9ddef]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d={d} />
        </svg>
      </span>
      <input
        {...props}
        className="h-12 w-full rounded-md bg-white pl-12 pr-4 text-sm text-[#243762] shadow-sm placeholder:italic placeholder:text-[#9aa7bd] focus:outline-none focus:ring-2 focus:ring-[#7ccad4]"
      />
    </div>
  );
}

/** ช่องกรอกแบบข้อความกลางช่อง (ตามการ์ด Create Account) */
const centerInputCls =
  "h-12 w-full rounded-md bg-white px-4 text-center text-sm text-[#243762] shadow-sm placeholder:italic placeholder:text-[#9aa7bd] focus:outline-none focus:ring-2 focus:ring-[#7ccad4]";

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
      setErr("กรอกอีเมลและรหัสผ่าน");
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

  function switchMode() {
    setMode(mode === "login" ? "signup" : "login");
    setErr("");
    setConfirmMsg("");
  }

  return (
    <div className="mx-auto max-w-[620px] px-4 py-10">
      <div className="relative rounded-[28px] bg-[#DDEEF7] px-5 pb-10 pt-6 shadow-[0_14px_34px_rgba(44,129,196,.14)] sm:px-12">
        {/* ปุ่มสลับโหมดมุมขวาบน (ตามดีไซน์: ป้ายกรมท่า Create Account) */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={switchMode}
            className="rounded-md px-4 py-2.5 text-sm font-bold tracking-wide text-white transition hover:opacity-90"
            style={{ background: NAVY }}
          >
            {mode === "login" ? "Create Account" : "User Login"}
          </button>
        </div>

        {mode === "login" ? (
          <>
            {/* เป็ดนั่งหน้าคอมในซุ้มโค้ง */}
            <img
              src="/account/duck-login.svg"
              alt=""
              className="mx-auto -mt-2 w-[82%] max-w-[360px]"
              width={408}
              height={317}
            />
            <h1 className="mt-4 text-center text-3xl font-semibold sm:text-4xl" style={{ color: NAVY, fontFamily: "var(--display)" }}>
              User Login
            </h1>
            <p className="mt-1 text-center text-sm font-semibold" style={{ color: NAVY }}>
              Welcome back — ยินดีต้อนรับกลับ
            </p>

            <div className="mx-auto mt-6 max-w-[400px] space-y-4">
              <IconField
                icon="user"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                inputMode="email"
                placeholder="Your Email"
                aria-label="อีเมล"
              />
              <IconField
                icon="lock"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Password"
                aria-label="รหัสผ่าน"
                onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
              />
              <div className="flex items-center justify-between px-0.5 text-sm font-bold" style={{ color: NAVY }}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded accent-[#7ccad4]"
                  />
                  จำอีเมลไว้
                </label>
                <Link href="/account/reset" className="hover:underline">
                  Forgot password?
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* เป็ดในวงกลม + หัวข้อ Create Account */}
            <img
              src="/account/duck-avatar.svg"
              alt=""
              className="mx-auto mt-2 w-[44%] max-w-[190px]"
              width={243}
              height={299}
            />
            <h1 className="mt-3 text-center text-3xl font-semibold sm:text-4xl" style={{ color: NAVY, fontFamily: "var(--display)" }}>
              Create Account
            </h1>
            <p className="mt-1 text-center text-sm font-semibold" style={{ color: NAVY }}>
              สมัครสมาชิก iDucky Prints Studio
            </p>

            <div className="mx-auto mt-6 max-w-[400px] space-y-4">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="* ชื่อ-นามสกุล *" className={centerInputCls} />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\-+ ]/g, ""))}
                inputMode="tel"
                placeholder="เบอร์โทร (ไม่บังคับ)"
                className={centerInputCls}
              />
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ที่อยู่จัดส่ง (ไม่บังคับ)" className={centerInputCls} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="* Your Email *" className={centerInputCls} />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="* Create Password (6 ตัวขึ้นไป) *"
                onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
                className={centerInputCls}
              />
              <p className="text-sm font-semibold" style={{ color: NAVY }}>
                * จำเป็นต้องกรอก *
              </p>
            </div>
          </>
        )}

        <div className="mx-auto max-w-[400px]">
          {err && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{err}</p>}
          {confirmMsg && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">{confirmMsg}</p>}
        </div>

        <div className="mt-7 text-center">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-md px-12 py-3.5 text-base font-bold uppercase tracking-[0.2em] text-white shadow-md transition hover:opacity-90 disabled:opacity-50"
            style={{ background: mode === "login" ? TEAL : NAVY }}
          >
            {busy ? "กำลังดำเนินการ…" : mode === "login" ? "Login" : "Register"}
          </button>
        </div>

        <div className="mx-auto mt-6 max-w-[400px]">
          <div className="flex items-center gap-3 text-xs font-semibold" style={{ color: NAVY }}>
            <span className="h-px flex-1 bg-[#b9ddef]" /> หรือ <span className="h-px flex-1 bg-[#b9ddef]" />
          </div>
          <a
            href="/api/auth/line/login"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#06C755] px-6 py-3 text-base font-bold text-white shadow-sm transition hover:bg-[#05b34c]"
          >
            💬 เข้าสู่ระบบด้วย LINE
          </a>
        </div>
      </div>

      <Link href="/products" className="mt-5 block text-center text-sm font-semibold text-stone-400 hover:text-stone-600">
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
