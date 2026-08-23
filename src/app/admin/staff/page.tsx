"use client";

/**
 * พนักงาน /admin/staff  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * กำหนดบทบาท/แผนก และเปิด–ปิดการเข้าใช้งาน "เฉพาะระบบนี้" — ระบบอื่นไม่กระทบ
 *
 * ของที่เพิ่มจากเดิม: เขียนสิทธิ์เป็นภาษาคน ("ไม่เห็นตัวเลขเงิน") แทนชื่อ perm ·
 * คนที่ยังไม่กำหนดแผนกขึ้นแถบแดง เพราะเขาล็อกอินไม่ได้และมักไม่มีใครรู้
 */

import RequirePerm from "@/components/RequirePerm";
import { useEffect, useState } from "react";
import {
  Banner,
  Btn,
  Empty,
  FChip,
  FilterCard,
  HeroStat,
  ListHead,
  PageHead,
  PageShell,
  Row,
  RowMain,
  RowSide,
  Rows,
  Stat,
  Stats,
  TabRow,
  Tag,
} from "@/components/admin/ui";
import { DEPT_ADMIN, DEPT_CONTENT, DEPT_GRAPHIC, DEPT_PACKING, ROLE_ADMINISTRATOR, ROLE_STAFF } from "@/lib/permissions";

interface Staff {
  id: string;
  username: string;
  name: string;
  fullname: string;
  role: string;
  department: string;
  workStatus: string;
  suspended: boolean;
  /** เซิร์ฟเวอร์คิดให้จากชุดสิทธิ์จริง (รวมบทบาทที่แอดมินแก้เอง + สถานะระงับ) */
  hasAccess: boolean;
}

const DEFAULT_DEPTS = [DEPT_ADMIN, DEPT_GRAPHIC, DEPT_PACKING, DEPT_CONTENT];

/** แถวพนักงาน 1 คน — แก้บทบาท/แผนก/สถานะ แล้วบันทึกเป็นรายคน */
function StaffRow({
  s,
  locked,
  lockNote,
  canGrantAdmin,
  depts,
  onSaved,
}: {
  s: Staff;
  locked: boolean;
  lockNote?: string;
  canGrantAdmin: boolean;
  depts: string[];
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

  /** อธิบายสิทธิ์เป็นภาษาคน — ชื่อ perm ไม่มีใครอ่านออก */
  const dutyOf = () => {
    if (isAdminRole) return "ทุกสิทธิ์";
    const d = department.trim();
    if (!d) return "ยังไม่กำหนดแผนก — ล็อกอินไม่ได้";
    if (d === DEPT_ADMIN) return "ออฟฟิศ · เห็นเกือบทุกอย่าง";
    if (d === DEPT_GRAPHIC) return "ทำแบบงาน · ไม่เห็นตัวเลขเงิน";
    if (d === DEPT_PACKING) return "เห็นเฉพาะคิวแพ็ค · ไม่เห็นตัวเลขเงิน";
    if (d.toLowerCase() === "content" || d === DEPT_CONTENT) return "สินค้า/ราคา/บทความ";
    return "แผนกนี้ยังไม่ถูกกำหนดสิทธิ์ — ล็อกอินไม่ได้";
  };
  const blocked = s.suspended || (!isAdminRole && !department.trim());

  return (
    <Row tone={blocked ? "var(--dk-coral-deep)" : isAdminRole ? "var(--dk-lilac)" : "var(--dk-mint)"} done={s.suspended}>
      <RowMain
        name={s.fullname || s.name || s.username}
        tags={
          <>
            {lockNote === "self" && <Tag tone="yolk">คุณ</Tag>}
            {isAdminRole && <Tag tone="lilac">ทุกสิทธิ์</Tag>}
            {s.suspended && <Tag tone="solid">ปิดการเข้าใช้งาน (เฉพาะระบบนี้)</Tag>}
            {!s.suspended && !isAdminRole && !department.trim() && <Tag tone="solid">ยังไม่กำหนดแผนก — เข้าไม่ได้</Tag>}
          </>
        }
        meta={
          <>
            <span className="id">{s.username}</span>
            {s.name && s.fullname && <span>{s.name}</span>}
            <span>{dutyOf()}</span>
          </>
        }
      />
      <RowSide>
        {locked ? (
          <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
            {lockNote === "self" ? "แก้บทบาทตัวเองไม่ได้ — ให้ผู้ดูแลระบบคนอื่นแก้ให้" : "แก้ได้เฉพาะผู้ดูแลระบบ"}
          </span>
        ) : (
          <span className="flex flex-wrap items-center justify-end gap-2">
            <label className="dkb-g dkb-field !py-1.5">
              <span className="lb">บทบาท</span>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value={ROLE_STAFF}>พนักงาน</option>
                <option value={ROLE_ADMINISTRATOR} disabled={!canGrantAdmin}>
                  ผู้ดูแลระบบ{!canGrantAdmin ? " (เฉพาะผู้ดูแลระบบ)" : ""}
                </option>
              </select>
            </label>
            <label className="dkb-g dkb-field !py-1.5">
              <span className="lb">แผนก</span>
              <select value={isAdminRole ? "" : department} onChange={(e) => setDepartment(e.target.value)} disabled={isAdminRole}>
                <option value="">— {isAdminRole ? "ทุกสิทธิ์" : "ยังไม่กำหนด (เข้าไม่ได้)"} —</option>
                {depts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                {department && !depts.includes(department) && <option value={department}>{department} (เดิม)</option>}
              </select>
            </label>
            <Btn tone={flash === "ok" ? "ghost" : "navy"} small onClick={() => void save()} disabled={!dirty || busy}>
              {busy ? "กำลังบันทึก…" : flash === "ok" ? "บันทึกแล้ว" : "บันทึก"}
            </Btn>
            <Btn small onClick={() => void toggleSuspend()} disabled={suspending}>
              {suspending ? "…" : s.suspended ? "เปิดการเข้าใช้งาน" : "ปิดการเข้าใช้งาน"}
            </Btn>
            {err && (
              <span className="w-full text-right text-[12px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
                {err}
              </span>
            )}
          </span>
        )}
      </RowSide>
    </Row>
  );
}

function StaffPageInner() {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [canGrantAdmin, setCanGrantAdmin] = useState(false);
  const [depts, setDepts] = useState<string[]>(DEFAULT_DEPTS);
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
        if (Array.isArray(j.departments) && j.departments.length) setDepts(j.departments);
        setMe(j.me ?? "");
      })
      .catch(() => setErr("โหลดรายชื่อไม่สำเร็จ"));

  useEffect(() => {
    void load();
  }, []);

  // ต้องตรงกับ loginKey() ฝั่งเซิร์ฟเวอร์ — ชื่อไทย/อีโมจิล้วนเหลือ "" จึงถอยไปใช้ชื่อดิบ
  const norm = (u: string) =>
    u.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "") ||
    u.trim().toLowerCase();

  // แสดงเฉพาะคนที่ยังทำงานอยู่ (พ้นสภาพแล้วไม่โชว์)
  const working = (staff ?? []).filter((s) => s.workStatus === "working");
  // "ใช้งานระบบได้" — เซิร์ฟเวอร์คิดมาให้แล้ว (ชุดสิทธิ์เดียวกับตอนล็อกอิน รวมบทบาทที่แอดมินแก้เอง)
  const hasAccess = (s: Staff) => s.hasAccess;

  // จัดกลุ่มตามตำแหน่ง/แผนก (อีโมจิชุดเดียวกับตารางบทบาทในตั้งค่าระบบ)
  const groupOf = (s: Staff) => {
    if (s.role === ROLE_ADMINISTRATOR) return "ผู้ดูแลระบบ";
    const d = s.department.trim();
    if (!d) return "ยังไม่ระบุแผนก";
    if (d === DEPT_ADMIN) return DEPT_ADMIN;
    if (d === DEPT_GRAPHIC) return DEPT_GRAPHIC;
    if (d === DEPT_PACKING) return DEPT_PACKING;
    if (d.toLowerCase() === "content" || d === DEPT_CONTENT) return DEPT_CONTENT;
    return d;
  };
  // ลำดับกลุ่มหลักก่อน แผนกอื่นเรียงชื่อ ก-ฮ ต่อท้าย
  const GROUP_ORDER = ["ผู้ดูแลระบบ", DEPT_ADMIN, DEPT_GRAPHIC, DEPT_PACKING, DEPT_CONTENT];
  const groupsOf = (list: Staff[]) => {
    const m = new Map<string, Staff[]>();
    list.forEach((s) => {
      const g = groupOf(s);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(s);
    });
    return [...m.entries()].sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a[0]);
      const ib = GROUP_ORDER.indexOf(b[0]);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a[0].localeCompare(b[0], "th");
    });
  };

  const list = working.filter((s) => (view === "access" ? hasAccess(s) : !hasAccess(s)));
  const noAccessCount = working.filter((s) => !hasAccess(s)).length;
  const suspended = working.filter((s) => s.suspended).length;

  return (
    <PageShell>
      <PageHead
        group="ระบบ"
        title="พนักงาน"
        count={staff ? `${working.length} คน` : undefined}
        sub="กำหนดบทบาท/แผนก และเปิด–ปิดการเข้าใช้งานระบบนี้ — มีผลทันทีที่ล็อกอินครั้งถัดไป"
      />

      {!canGrantAdmin && staff !== null && (
        <div className="mt-4">
          <Banner
            tone="warm"
            title="คุณเป็นพนักงานแอดมิน"
            detail="กำหนดบทบาทให้พนักงานคนอื่นได้ ยกเว้นตั้งหรือแก้ระดับผู้ดูแลระบบ"
          />
        </div>
      )}
      {err && (
        <div className="mt-4">
          <Banner tone="hot" title={err} />
        </div>
      )}

      {staff === null ? (
        <div className="mt-4">
          <Empty title="กำลังโหลดรายชื่อ…" body="ดึงข้อมูลพนักงานจากเซิร์ฟเวอร์" />
        </div>
      ) : (
        <>
          <Stats cols={4}>
            <HeroStat
              n={noAccessCount}
              label="ยังเข้าระบบไม่ได้"
              detail={
                noAccessCount
                  ? `ในนี้ถูกปิดการเข้าใช้งานไว้ ${suspended} คน · ที่เหลือยังไม่กำหนดแผนก`
                  : "ทุกคนที่ยังทำงานอยู่เข้าระบบได้ครบ"
              }
              pct={working.length ? (noAccessCount / working.length) * 100 : 0}
            />
            <Stat label="ใช้งานระบบได้" value={working.filter(hasAccess).length} hint="ล็อกอินเข้าหลังบ้านได้" />
            <Stat
              label="ปิดการเข้าใช้งาน"
              value={suspended}
              hint={suspended ? "คน — เฉพาะระบบนี้" : "คน"}
              tone={suspended ? "due" : undefined}
            />
          </Stats>

          <FilterCard>
            <TabRow>
              <FChip on={view === "access"} onClick={() => setView("access")} label="ใช้งานระบบได้" count={working.filter(hasAccess).length} />
              <FChip on={view === "noAccess"} onClick={() => setView("noAccess")} label="ยังไม่มีสิทธิ์" count={noAccessCount} />
            </TabRow>
          </FilterCard>

          <ListHead
            title="รายชื่อ"
            note={
              view === "access"
                ? "กด “ปิดการเข้าใช้งาน” เพื่อปิดเฉพาะระบบนี้ (ระบบอื่นใช้ได้ปกติ)"
                : "เปลี่ยนแผนกเป็น แอดมิน / แพ็คของ / คอนเทนต์ เพื่อเปิดสิทธิ์"
            }
          />

          {list.length === 0 ? (
            <Empty
              title="ไม่มีพนักงานในกลุ่มนี้"
              body={view === "access" ? "ลองดูกลุ่ม “ยังไม่มีสิทธิ์”" : "ทุกคนเข้าระบบได้หมดแล้ว"}
            />
          ) : (
            groupsOf(list).map(([g, members]) => (
              <section key={g} className="mb-5">
                <div className="flex items-baseline gap-2 px-2 pb-2">
                  <h2 className="dkb-h2 text-[0.98rem]">{g}</h2>
                  <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                    {members.length} คน
                  </span>
                </div>
                <Rows>
                  {members.map((s) => {
                    const self = norm(s.username) === me;
                    const adminLocked = !canGrantAdmin && s.role === ROLE_ADMINISTRATOR;
                    return (
                      <StaffRow
                        key={s.id}
                        s={s}
                        locked={self || adminLocked}
                        lockNote={self ? "self" : adminLocked ? "admin" : undefined}
                        canGrantAdmin={canGrantAdmin}
                        depts={depts}
                        onSaved={load}
                      />
                    );
                  })}
                </Rows>
              </section>
            ))
          )}
        </>
      )}
    </PageShell>
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
