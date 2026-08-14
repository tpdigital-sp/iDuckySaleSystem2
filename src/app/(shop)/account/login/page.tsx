"use client";

/* eslint-disable @next/next/no-img-element */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/customer-auth";
import { useCustomer } from "@/lib/customer-context";

const LINE_ERR: Record<string, string> = {
  notset: "LINE Login is not set up yet",
  state: "Session expired — please try again",
  token: "Could not connect to LINE (check Channel ID/Secret)",
  profile: "Could not load your LINE profile",
  session: "Could not create a session",
  createuser: "Could not create your account",
  nodb: "Service is not ready yet",
};

/*
 * โทน/ฟอนต์ตามหน้าแรก: ครอบด้วย .dl เพื่อใช้ token ของ landing.css ตรง ๆ
 * (Mitr หัวเรื่อง+ปุ่ม · Plex Looped เนื้อความ · sky/navy/yolk · ปุ่ม .btn มี .dot ลูกศร)
 */

/** ช่องกรอกแบบมีไอคอนวงกลมฟ้าด้านซ้าย (หน้า login) */
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
        className="pointer-events-none absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-[#E2F3FE]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="#2C81C4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" width={15} height={15}>
          <path d={d} />
        </svg>
      </span>
      <input
        {...props}
        className="h-11 w-full rounded-full bg-white pl-[44px] pr-4 text-[13.5px] text-[#173A6B] ring-1 ring-[#C6E8FB] placeholder:text-[#8FA6C4] focus:outline-none focus:ring-2 focus:ring-[#57B6E8]"
      />
    </div>
  );
}

/** ช่องกรอกข้อความกลางช่อง (หน้าสมัครสมาชิก) */
const centerInputCls =
  "h-11 w-full rounded-full bg-white px-4 text-center text-[13.5px] text-[#173A6B] ring-1 ring-[#C6E8FB] placeholder:text-[#8FA6C4] focus:outline-none focus:ring-2 focus:ring-[#57B6E8]";

/** ปุ่ม .btn ของหน้าแรกใหญ่ไปสำหรับการ์ดล็อกอิน — ย่อระยะขอบ/ตัวอักษรลง (มือถืออ่านง่ายขึ้น ไม่ล้นจอ) */
const btnCompact = { padding: "12px 16px 12px 24px", fontSize: ".95rem" } as const;

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
    if (l) setErr(LINE_ERR[l] ?? "Sign in with LINE failed");
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
      setErr("Enter your email and password");
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
      if (!res.ok) return setErr(res.error ?? "Sign in failed");
      refresh();
      router.push("/account");
    } else {
      if (!name.trim()) {
        setBusy(false);
        return setErr("Enter your name");
      }
      const res = await signUp(email.trim(), password, { name: name.trim(), phone: phone.trim(), address: address.trim() });
      setBusy(false);
      if (!res.ok) return setErr(res.error ?? "Sign up failed");
      if (res.needsConfirm) {
        setConfirmMsg("Account created! Please confirm your email, then sign in.");
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
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--navy)" }}>
      <div className="mx-auto max-w-[480px] px-4 py-6 sm:py-9">
        <div
          className="relative px-4 pb-7 pt-4 sm:px-9 sm:pb-8 sm:pt-5"
          style={{ background: "var(--sky-100)", borderRadius: "var(--r-l)", boxShadow: "var(--shadow-m)" }}
        >
          {/* ปุ่มสลับโหมดมุมขวาบน — ปุ่ม pill แบบเดียวกับหน้าแรก */}
          <div className="dl flex justify-end" style={{ background: "transparent" }}>
            <button
              type="button"
              onClick={switchMode}
              className="btn btn-primary"
              style={{ padding: "7px 11px 7px 16px", fontSize: ".82rem" }}
            >
              {mode === "login" ? "Create Account" : "เข้าสู่ระบบ"} <span className="dot">→</span>
            </button>
          </div>

          {mode === "login" ? (
            <>
              {/* เป็ดนั่งหน้าคอมในซุ้มโค้ง */}
              <img
                src="/account/duck-login.svg"
                alt=""
                className="mx-auto -mt-2 w-[68%] max-w-[248px]"
                width={408}
                height={317}
              />
              <h1 className="mt-3 text-center text-[1.75rem] sm:text-[2.05rem]" style={{ color: "var(--navy)", fontFamily: "var(--display)", fontWeight: 500 }}>
                User Login
              </h1>
              <p className="mt-1 text-center text-[12.5px] sm:text-[13.5px]" style={{ color: "var(--navy-soft)" }}>
                เข้าสู่ระบบสมาชิก — ยินดีต้อนรับกลับมาที่ iDucky Prints Studio
              </p>

              <div className="mx-auto mt-5 max-w-[360px] space-y-3">
                <IconField
                  icon="user"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  inputMode="email"
                  placeholder="Email"
                  aria-label="Email"
                />
                <IconField
                  icon="lock"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="Password"
                  aria-label="Password"
                  onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
                />
                <div className="flex items-center justify-between px-1 text-[13px]" style={{ color: "var(--navy-soft)" }}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#57B6E8]"
                    />
                    จำอีเมลไว้
                  </label>
                  <Link href="/account/reset" className="font-medium hover:underline" style={{ color: "var(--blue-deep)" }}>
                    Forgot password?
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* เป็ดในวงกลม + หัวข้อสมัครสมาชิก */}
              <img
                src="/account/duck-avatar.svg"
                alt=""
                className="mx-auto mt-1 w-[36%] max-w-[132px]"
                width={243}
                height={299}
              />
              <h1 className="mt-2 text-center text-[1.75rem] sm:text-[2.05rem]" style={{ color: "var(--navy)", fontFamily: "var(--display)", fontWeight: 500 }}>
                Create Account
              </h1>
              <p className="mt-1 text-center text-[12.5px] sm:text-[13.5px]" style={{ color: "var(--navy-soft)" }}>
                สมัครสมาชิกฟรี เก็บประวัติสั่งซื้อ รับส่วนลดสมาชิก
              </p>

              <div className="mx-auto mt-5 max-w-[360px] space-y-3">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name *" className={centerInputCls} />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d\-+ ]/g, ""))}
                  inputMode="tel"
                  placeholder="Phone (optional)"
                  className={centerInputCls}
                />
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shipping address (optional)" className={centerInputCls} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="Email *" className={centerInputCls} />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="Password (6+ characters) *"
                  onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
                  className={centerInputCls}
                />
                <p className="px-1 text-[11.5px]" style={{ color: "var(--navy-soft)" }}>
                  * จำเป็นต้องกรอก
                </p>
              </div>
            </>
          )}

          <div className="mx-auto max-w-[360px]">
            {err && <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-2 text-[13px] font-medium text-rose-700">{err}</p>}
            {confirmMsg && <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-2 text-[13px] font-medium text-emerald-700">{confirmMsg}</p>}
          </div>

          <div className="dl mt-5 text-center" style={{ background: "transparent" }}>
            <button type="button" onClick={submit} disabled={busy} className="btn btn-yolk" style={busy ? { ...btnCompact, opacity: 0.6 } : btnCompact}>
              {busy ? "Please wait…" : mode === "login" ? "เข้าสู่ระบบ" : "Create Account"} <span className="dot">→</span>
            </button>
          </div>

          <div className="mx-auto mt-5 max-w-[360px]">
            <div className="flex items-center gap-3 text-[11.5px]" style={{ color: "var(--navy-soft)" }}>
              <span className="h-px flex-1 bg-[#C6E8FB]" /> or <span className="h-px flex-1 bg-[#C6E8FB]" />
            </div>
            <a
              href="/api/auth/line/login"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] px-5 py-2.5 text-[15px] font-medium text-white shadow-sm transition hover:bg-[#05b34c]"
              style={{ fontFamily: "var(--display)" }}
            >
              💬 เข้าสู่ระบบด้วย LINE
            </a>
          </div>
        </div>

        <Link
          href="/products"
          className="mt-4 block text-center text-[13px] hover:underline"
          style={{ color: "var(--navy-soft)" }}
        >
          ← เลือกซื้อสินค้าต่อ
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-stone-400">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
