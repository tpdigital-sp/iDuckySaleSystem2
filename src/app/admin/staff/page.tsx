"use client";

import RequirePerm from "@/components/RequirePerm";
import { useEffect, useState } from "react";
import { cardPad, faint, h1, h2, muted } from "@/lib/admin-ui";
import { DEPT_ADMIN, DEPT_CONTENT, DEPT_PACKING, ROLE_ADMINISTRATOR, ROLE_STAFF } from "@/lib/permissions";

interface Staff {
  id: string;
  username: string;
  name: string;
  role: string;
  department: string;
  workStatus: string;
  isSuspended: boolean;
}

const DEPTS = [DEPT_ADMIN, DEPT_PACKING, DEPT_CONTENT];
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "working", label: "ทำงานอยู่" },
  { value: "left", label: "พ้นสภาพ" },
];

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
  const [workStatus, setWorkStatus] = useState(s.workStatus);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);
  const [err, setErr] = useState("");

  const dirty = role !== s.role || department !== s.department || workStatus !== s.workStatus;
  const isAdminRole = role === ROLE_ADMINISTRATOR;
  // สถานะปัจจุบันที่ไม่อยู่ในตัวเลือกมาตรฐาน (ค่าเก่าจากระบบ TP) — โชว์ให้เลือกคงไว้ได้
  const customStatus = workStatus && !STATUS_OPTIONS.some((o) => o.value === workStatus);

  async function save() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: s.id, role, department: isAdminRole ? "" : department, workStatus }),
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

  const sel =
    "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-800 focus:border-amber-300 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-bold text-slate-800">
          {s.name || s.username} {lockNote === "self" && <span className="text-xs font-semibold text-amber-600">(คุณ)</span>}
        </p>
        <p className={`truncate text-[11px] ${faint}`}>{s.username}</p>
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

          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            สถานะ
            <select value={workStatus} onChange={(e) => setWorkStatus(e.target.value)} className={sel}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {customStatus && <option value={workStatus}>{workStatus} (เดิม)</option>}
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
          {err && <p className="w-full text-xs font-medium text-rose-600">{err}</p>}
        </>
      )}
    </div>
  );
}

function StaffPageInner() {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [canGrantAdmin, setCanGrantAdmin] = useState(false);
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

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className={h1}>👥 พนักงาน</h1>
      <p className={`mt-1 ${muted}`}>
        กำหนดบทบาท/แผนก/สถานะการทำงาน — มีผลกับสิทธิ์ทันทีที่พนักงานล็อกอินครั้งถัดไป · ดูสิทธิ์ของแต่ละตำแหน่งได้ที่
        ตั้งค่าระบบ → แท็บบทบาท
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
          <section className="mt-5">
            <h2 className={`mb-2 ${h2}`}>ทำงานอยู่ ({staff.filter((s) => s.workStatus === "working").length})</h2>
            <div className="space-y-2">
              {staff
                .filter((s) => s.workStatus === "working")
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
          </section>

          {staff.some((s) => s.workStatus !== "working") && (
            <section className={`mt-6 ${cardPad}`}>
              <h2 className={`mb-2 ${h2}`}>ไม่ได้ทำงานแล้ว ({staff.filter((s) => s.workStatus !== "working").length})</h2>
              <p className={`mb-2 text-xs ${faint}`}>บัญชีเหล่านี้ล็อกอินไม่ได้ — เปลี่ยนสถานะเป็น &quot;ทำงานอยู่&quot; เพื่อเปิดใช้อีกครั้ง</p>
              <div className="space-y-2">
                {staff
                  .filter((s) => s.workStatus !== "working")
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
            </section>
          )}
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
