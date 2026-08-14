"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAdminSession, signInAdmin } from "@/lib/auth";

/** จำ "ชื่อผู้ใช้" ล่าสุดไว้ในเครื่อง (ไม่เก็บรหัสผ่านเอง — ให้ตัวจำรหัสของเบราว์เซอร์ทำ) */
const REMEMBER_KEY = "admin.login.username";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // เติมชื่อผู้ใช้ที่จำไว้ แล้วพาไปช่องรหัสผ่านเลย — พิมพ์แค่รหัสก็เข้าได้
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setUsername(saved);
        passwordRef.current?.focus();
      }
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
      // จำ/ลืมชื่อผู้ใช้ตามที่ติ๊ก — บันทึกเฉพาะตอนล็อกอินสำเร็จ (กันจำชื่อที่พิมพ์ผิด)
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, username.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {}
      router.push(nextDest());
    } else setError(res.error ?? "เข้าสู่ระบบไม่สำเร็จ");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-lg ring-1 ring-amber-100">
        <div className="mb-6 text-center">
          <span className="text-4xl">🦆</span>
          <h1 className="mt-2 text-xl font-extrabold text-amber-950">เข้าสู่ระบบหลังบ้าน</h1>
          <p className="mt-1 text-xs text-stone-400">iDucky Prints Studio — สำหรับแอดมิน</p>
        </div>

        {configured === false && (
          <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200">
            ⚠️ ยังไม่ได้ตั้งค่า Firebase — ตอนนี้เป็นโหมดเดโม เข้าหลังบ้านได้เลยไม่ต้องล็อกอิน{" "}
            <Link href="/admin" className="font-bold underline">
              ไปหลังบ้าน →
            </Link>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-stone-600">ชื่อผู้ใช้ (username)</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full rounded-xl bg-stone-50 px-4 py-2.5 text-sm ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-ducky"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-stone-600">รหัสผ่าน</span>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-xl bg-stone-50 px-4 py-2.5 text-sm ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-ducky"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-stone-500">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            จำชื่อผู้ใช้ในเครื่องนี้ — ครั้งหน้าพิมพ์แค่รหัสผ่าน
          </label>

          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 ring-1 ring-rose-200">
              ⚠️ {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-amber-950 px-6 py-3 text-sm font-bold text-ducky shadow-lg transition hover:bg-stone-800 disabled:opacity-50"
          >
            {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </button>
        </form>

        <Link href="/" className="mt-4 block text-center text-xs text-stone-400 hover:text-amber-600">
          ← กลับหน้าร้าน
        </Link>
      </div>
    </div>
  );
}
