"use client";

import RequirePerm from "@/components/RequirePerm";
import { useEffect, useState } from "react";
import { faint, h1, muted } from "@/lib/admin-ui";
import { can, DEPT_ADMIN, DEPT_CONTENT, DEPT_PACKING, ROLE_ADMINISTRATOR, ROLE_STAFF } from "@/lib/permissions";

interface Staff {
  id: string;
  username: string;
  name: string;
  fullname: string;
  role: string;
  department: string;
  workStatus: string;
  suspended: boolean;
}

const DEPTS = [DEPT_ADMIN, DEPT_PACKING, DEPT_CONTENT];

/** แถวพนักงาน 1 คน — แก้บทบาท/แผนก/สถานะ แล้วบันทึกเป็นรายคน */
function StaffRow({
  s,
  locked,
  lockNote,
  canGrantAdmin,
  onSaved,
}: {
  s: Staff;
  locked: boolean;
  lockNote?: string;
  canGrantAdmin: boolean;
  onSaved: () => void;
}) {
  const [role, setRole] = useState(s.role);
  const [department, setDepartment] = useState(s.department);
  const [busy, setBusy] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);
  const [err, setErr] = useState("");

  const dirty = role !== s.role || department !== s.department;
  const isAdminRole = role === ROLE_ADMINISTRATOR;

  async function save() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // workStatus ส่งค่าเดิมกลับไปเฉย ๆ (หน้านี้ไม่มีตัวแก้สถานะแล้ว — จัดการที่ระบบ TP)
      body: JSON.stringify({ id: s.id, role, department: isAdminRole ? "" : department, workStatus: s.workStatus }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(j.error ?? "บันทึกไม่สำเร็จ");
      setFlash("err");
      return;
    }
    setFlash("ok");
    setTimeout(() => setFlash(null), 2000);
    onSaved();
  }

  /** ระงับ/คืนสิทธิ์เข้าหลังบ้าน "เฉพาะระบบนี้" — ไม่แตะสถานะการทำงาน และไม่กระทบระบบอื่น */
  async function toggleSuspend() {
    const who = s.fullname || s.name || s.username;
    const msg = s.suspended
      ? `เปิดการเข้าใช้งานให้ "${who}" กลับมาเข้าระบบนี้ได้เหมือนเดิม?`
      : `ปิดการเข้าใช้งานระบบนี้ของ "${who}"?\n(เฉพาะระบบนี้เท่านั้น — ระบบอื่นใช้ได้ปกติ · ยังเป็นพนักงานอยู่ เปิดกลับได้ทุกเมื่อ)`;
    if (!window.confirm(msg)) return;
    setSuspending(true);
    setErr("");
    const res = await fetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: s.id, suspended: !s.suspended }),
    });
    const j = await res.json().catch(() => ({}));
    setSuspending(false);
    if (!res.ok) {
      setErr(j.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    onSaved();
  }

  const sel =
    "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-800 focus:border-amber-300 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-bold text-slate-800">
          {s.fullname || s.name || s.username}{" "}
          {lockNote === "self" && <span className="text-xs font-semibold text-amber-600">(คุณ)</span>}
          {s.suspended && (
            <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-600">
              ⛔ ปิดการเข้าใช้งาน (เฉพาะระบบนี้)
            </span>
          )}
        </p>
        <p className={`truncate text-[11px] ${faint}`}>
          {s.name && s.fullname ? `${s.name} · ` : ""}
          {s.username}
        </p>
      </div>

      {locked ? (
        <p className="text-xs font-semibold text-slate-400">
          🔒 {lockNote === "self" ? "แก้บทบาทตัวเองไม่ได้ — ให้ผู้ดูแลระบบคนอื่นแก้ให้" : "แก้ได้เฉพาะผู้ดูแลระบบ"}
        </p>
      ) : (
        <>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            บทบาท
            <select value={role} onChange={(e) => setRole(e.target.value)} className={sel}>
              <option value={ROLE_STAFF}>พนักงาน</option>
              <option value={ROLE_ADMINISTRATOR} disabled={!canGrantAdmin}>
                ผู้ดูแลระบบ{!canGrantAdmin ? " (เฉพาะผู้ดูแลระบบ)" : ""}
              </option>
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            แผนก
            <select value={isAdminRole ? "" : department} onChange={(e) => setDepartment(e.target.value)} disabled={isAdminRole} className={sel}>
              <option value="">— {isAdminRole ? "ทุกสิทธิ์" : "ยังไม่กำหนด (เข้าไม่ได้)"} —</option>
              {DEPTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              {department && !DEPTS.includes(department) && <option value={department}>{department} (เดิม)</option>}
            </select>
          </label>

          <button
            type="button"
            onClick={save}
            disabled={!dirty || busy}
            className={`rounded-full px-4 py-1.5 text-xs font-bold text-white transition disabled:opacity-40 ${
              flash === "ok" ? "bg-emerald-500" : "bg-amber-500 hover:bg-amber-600"
            }`}
          >
            {busy ? "กำลังบันทึก…" : flash === "ok" ? "✓ บันทึกแล้ว" : "บันทึก"}
          </button>
          <button
            type="button"
            onClick={toggleSuspend}
            disabled={suspending}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 ${
              s.suspended
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                : "bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
            }`}
          >
            {suspending ? "…" : s.suspended ? "↩️ เปิดการเข้าใช้งาน" : "⛔ ปิดการเข้าใช้งาน"}
          </button>
          {err && <p className="w-full text-xs font-medium text-rose-600">{err}</p>}
        </>
      )}
    </div>
  );
}

function StaffPageInner() {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [canGrantAdmin, setCanGrantAdmin] = useState(false);
  const [view, setView] = useState<"access" | "noAccess">("access");
  const [me, setMe] = useState("");
  const [err, setErr] = useState("");

  const load = () =>
    fetch("/api/admin/staff", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) {
          setErr(j.error);
          setStaff([]);
          return;
        }
        setStaff(j.staff ?? []);
        setCanGrantAdmin(!!j.canGrantAdmin);
        setMe(j.me ?? "");
      })
      .catch(() => setErr("โหลดรายชื่อไม่สำเร็จ"));

  useEffect(() => {
    void load();
  }, []);

  const norm = (u: string) =>
    u.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "");

  // แสดงเฉพาะคนที่ยังทำงานอยู่ (พ้นสภาพแล้วไม่โชว์)
  const working = (staff ?? []).filter((s) => s.workStatus === "working");
  // "ใช้งานระบบได้" = ไม่ถูกระงับ + บทบาท/แผนกเปิดสิทธิ์เข้าหลังบ้าน (กติกาเดียวกับตอนล็อกอินจริง)
  const hasAccess = (s: Staff) =>
    !s.suspended && can({ username: s.username, role: s.role, department: s.department }, "admin.access");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className={h1}>👥 พนักงาน</h1>
      <p className={`mt-1 ${muted}`}>
        กำหนดบทบาท/แผนก และเปิด–ปิดการเข้าใช้งานระบบนี้ — มีผลทันทีที่ล็อกอินครั้งถัดไป · ดูสิทธิ์แต่ละตำแหน่งได้ที่ ตั้งค่าระบบ → แท็บบทบาท
      </p>
      {!canGrantAdmin && staff !== null && (
        <p className="mt-3 rounded-xl bg-sky-50 px-4 py-2.5 text-xs font-medium text-sky-700 ring-1 ring-sky-100">
          ℹ️ คุณเป็นพนักงานแอดมิน — กำหนดบทบาทให้พนักงานคนอื่นได้ ยกเว้นตั้ง/แก้ระดับผู้ดูแลระบบ
        </p>
      )}

      {err && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{err}</p>}

      {staff === null ? (
        <p className="py-16 text-center text-sm text-slate-400">กำลังโหลดรายชื่อ…</p>
      ) : (
        <>
          {/* แท็บย่อย: แบ่งตามสิทธิ์เข้าหลังบ้าน — มีสิทธิ์แล้ว / ยังไม่มีสิทธิ์ (แผนกยังไม่ถูกกำหนดสิทธิ์) */}
          <div className="mt-5 flex gap-2">
            {(
              [
                ["access", `🔓 ใช้งานระบบได้ (${working.filter(hasAccess).length})`],
                ["noAccess", `🔒 ยังไม่มีสิทธิ์ (${working.filter((s) => !hasAccess(s)).length})`],
              ] as ["access" | "noAccess", string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                aria-pressed={view === k}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  view === k
                    ? "bg-amber-500 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <section className="mt-3">
            <p className={`mb-2 text-xs ${faint}`}>
              {view === "access"
                ? "พนักงานกลุ่มนี้ล็อกอินเข้าหลังบ้านได้ตามสิทธิ์ของแผนก · กด “⛔ ปิดการเข้าใช้งาน” เพื่อปิดเฉพาะระบบนี้ (ระบบอื่นใช้ได้ปกติ ยังเป็นพนักงานอยู่)"
                : "กลุ่มนี้เข้าหลังบ้านไม่ได้ — แผนกยังไม่ถูกกำหนดสิทธิ์ (เปลี่ยนเป็น แอดมิน / แพ็คของ / คอนเทนต์ เพื่อเปิด) หรือถูกปิดการเข้าใช้งานไว้ (กด “↩️ เปิดการเข้าใช้งาน”)"}
            </p>
            <div className="space-y-2">
              {working
                .filter((s) => (view === "access" ? hasAccess(s) : !hasAccess(s)))
                .map((s) => {
                  const self = norm(s.username) === me;
                  const adminLocked = !canGrantAdmin && s.role === ROLE_ADMINISTRATOR;
                  return (
                    <StaffRow
                      key={s.id}
                      s={s}
                      locked={self || adminLocked}
                      lockNote={self ? "self" : adminLocked ? "admin" : undefined}
                      canGrantAdmin={canGrantAdmin}
                      onSaved={load}
                    />
                  );
                })}
            </div>
            {working.filter((s) => (view === "access" ? hasAccess(s) : !hasAccess(s))).length === 0 && (
              <p className={`rounded-xl bg-slate-50 px-4 py-6 text-center text-sm ${muted}`}>ไม่มีพนักงานในกลุ่มนี้</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** กันคนไม่มีสิทธิ์พิมพ์ URL เข้าตรง ๆ (ของจริงบังคับที่ API อีกชั้น) */
export default function StaffPage() {
  return (
    <RequirePerm perm="staff.manage">
      <StaffPageInner />
    </RequirePerm>
  );
}
