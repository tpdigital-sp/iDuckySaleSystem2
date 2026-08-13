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
        className="pointer-events-none absolute left-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-[#E2F3FE]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="#2C81C4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5" width={17} height={17}>
          <path d={d} />
        </svg>
      </span>
      <input
        {...props}
        className="h-12 w-full rounded-full bg-white pl-[52px] pr-5 text-sm text-[#173A6B] ring-1 ring-[#C6E8FB] placeholder:text-[#8FA6C4] focus:outline-none focus:ring-2 focus:ring-[#57B6E8]"
      />
    </div>
  );
}

/** ช่องกรอกข้อความกลางช่อง (หน้าสมัครสมาชิก) */
const centerInputCls =
  "h-12 w-full rounded-full bg-white px-5 text-center text-sm text-[#173A6B] ring-1 ring-[#C6E8FB] placeholder:text-[#8FA6C4] focus:outline-none focus:ring-2 focus:ring-[#57B6E8]";

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
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--navy)" }}>
      <div className="mx-auto max-w-[620px] px-4 py-10">
        <div
          className="relative px-5 pb-10 pt-6 sm:px-12"
          style={{ background: "var(--sky-100)", borderRadius: "var(--r-l)", boxShadow: "var(--shadow-m)" }}
        >
          {/* ปุ่มสลับโหมดมุมขวาบน — ปุ่ม pill แบบเดียวกับหน้าแรก */}
          <div className="dl flex justify-end" style={{ background: "transparent" }}>
            <button
              type="button"
              onClick={switchMode}
              className="btn btn-primary"
              style={{ padding: "9px 14px 9px 20px", fontSize: ".92rem" }}
            >
              {mode === "login" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"} <span className="dot">→</span>
            </button>
          </div>

          {mode === "login" ? (
            <>
              {/* เป็ดนั่งหน้าคอมในซุ้มโค้ง */}
              <img
                src="/account/duck-login.svg"
                alt=""
                className="mx-auto -mt-3 w-[82%] max-w-[360px]"
                width={408}
                height={317}
              />
              <p className="mt-4 text-center text-[11px] font-bold tracking-[0.32em]" style={{ color: "var(--blue-deep)" }}>
                USER LOGIN
              </p>
              <h1 className="mt-1 text-center text-3xl sm:text-[2.15rem]" style={{ color: "var(--navy)", fontFamily: "var(--display)", fontWeight: 500 }}>
                เข้าสู่ระบบสมาชิก
              </h1>
              <p className="mt-1 text-center text-sm" style={{ color: "var(--navy-soft)" }}>
                ยินดีต้อนรับกลับมา ที่ iDucky Prints Studio
              </p>

              <div className="mx-auto mt-6 max-w-[400px] space-y-4">
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
                <div className="flex items-center justify-between px-1 text-sm" style={{ color: "var(--navy-soft)" }}>
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
                    ลืมรหัสผ่าน?
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
                className="mx-auto mt-2 w-[44%] max-w-[190px]"
                width={243}
                height={299}
              />
              <p className="mt-3 text-center text-[11px] font-bold tracking-[0.32em]" style={{ color: "var(--blue-deep)" }}>
                CREATE ACCOUNT
              </p>
              <h1 className="mt-1 text-center text-3xl sm:text-[2.15rem]" style={{ color: "var(--navy)", fontFamily: "var(--display)", fontWeight: 500 }}>
                สมัครสมาชิก
              </h1>
              <p className="mt-1 text-center text-sm" style={{ color: "var(--navy-soft)" }}>
                สมัครฟรี สะสมประวัติสั่งซื้อ รับส่วนลดสมาชิก
              </p>

              <div className="mx-auto mt-6 max-w-[400px] space-y-4">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ-นามสกุล *" className={centerInputCls} />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d\-+ ]/g, ""))}
                  inputMode="tel"
                  placeholder="เบอร์โทร (ไม่บังคับ)"
                  className={centerInputCls}
                />
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ที่อยู่จัดส่ง (ไม่บังคับ)" className={centerInputCls} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="อีเมล *" className={centerInputCls} />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="รหัสผ่าน (6 ตัวขึ้นไป) *"
                  onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
                  className={centerInputCls}
                />
                <p className="px-1 text-xs" style={{ color: "var(--navy-soft)" }}>
                  * จำเป็นต้องกรอก
                </p>
              </div>
            </>
          )}

          <div className="mx-auto max-w-[400px]">
            {err && <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{err}</p>}
            {confirmMsg && <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">{confirmMsg}</p>}
          </div>

          <div className="dl mt-7 text-center" style={{ background: "transparent" }}>
            <button type="button" onClick={submit} disabled={busy} className="btn btn-yolk" style={busy ? { opacity: 0.6 } : undefined}>
              {busy ? "กำลังดำเนินการ…" : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"} <span className="dot">→</span>
            </button>
          </div>

          <div className="mx-auto mt-6 max-w-[400px]">
            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--navy-soft)" }}>
              <span className="h-px flex-1 bg-[#C6E8FB]" /> หรือ <span className="h-px flex-1 bg-[#C6E8FB]" />
            </div>
            <a
              href="/api/auth/line/login"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-[#05b34c]"
              style={{ fontFamily: "var(--display)" }}
            >
              💬 เข้าสู่ระบบด้วย LINE
            </a>
          </div>
        </div>

        <Link
          href="/products"
          className="mt-5 block text-center text-sm hover:underline"
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
    <Suspense fallback={<div className="py-16 text-center text-sm text-stone-400">กำลังโหลด…</div>}>
      <LoginInner />
    </Suspense>
  );
}
