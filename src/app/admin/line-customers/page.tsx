"use client";

/**
 * 💬 /admin/line-customers — ลูกค้า LINE + สวิตช์บอทรายคน
 *
 * ย้ายมาจากหน้า AdminBuddy (line-customers.html บนพอร์ต 8765) ที่ยิง Firestore จากเบราว์เซอร์ตรง ๆ
 * ตอนนี้อยู่ในระบบขายแล้ว: ใช้ล็อกอิน/สิทธิ์ชุดเดียวกัน · คีย์ Firebase ไม่หลุดออกหน้าเว็บ ·
 * ใช้ดัชนีคลังแชทก้อนเดียวกับช่อง "ผูก LINE" ในหน้าออเดอร์ (ไม่ได้เพิ่มค่าอ่าน Firestore อีกชุด)
 *
 * คำถามที่หน้านี้ต้องตอบใน 3 วินาที: "ตอนนี้มีลูกค้าคนไหนรอแอดมินตอบอยู่บ้าง"
 * → ชิป "รอแอดมินตอบ" กับแถบแดงซ้ายแถวคือของที่ต้องเห็นก่อน ที่เหลือเงียบไว้
 *
 * ⚠️ สวิตช์รายคนมีผลก็ต่อเมื่อ "โหมดเลือกตอบ" เปิดอยู่ — ปิดโหมดนี้ บอทตอบทุกคนไม่ว่าสวิตช์จะเป็นยังไง
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import {
  Banner,
  Btn,
  Empty,
  FChip,
  FilterCard,
  ListHead,
  PageHead,
  PageShell,
  Row,
  RowMain,
  RowSide,
  Rows,
  SearchBox,
  Switch,
  TabRow,
  Tag,
} from "@/components/admin/ui";
import { usePolling } from "@/lib/use-polling";
import { CUSTOMER_TAGS, tagInfo, type CustomerTag } from "@/lib/line-tags";
import type { LineCustomerRow, LineCustomersResponse } from "@/app/api/admin/line-customers/manage/route";

const API = "/api/admin/line-customers/manage";

/** ไม่คุยกันเกินเท่านี้ = ลูกค้าเก่า — แถวจางลง ให้คนที่เพิ่งคุยเด่นกว่า */
const STALE_DAYS = 45;

type Filter = "all" | "ai-on" | "admin-only" | "followup";

const FILTERS: { key: Filter; label: string; pick: (c: LineCustomersResponse["counts"]) => number }[] = [
  { key: "all", label: "ทั้งหมด", pick: (c) => c.all },
  { key: "followup", label: "รอแอดมินตอบ", pick: (c) => c.followup },
  { key: "ai-on", label: "บอทตอบ", pick: (c) => c.aiOn },
  { key: "admin-only", label: "แอดมินตอบเอง", pick: (c) => c.adminOnly },
];

/** -1 = เซิร์ฟเวอร์ยังนับไม่ได้ (ยังไม่ได้อ่านทั้งคลัง) → ซ่อนตัวเลขไว้ก่อน ดีกว่าโชว์เลขมั่ว */
const countOf = (n?: number) => (n === undefined || n < 0 ? undefined : n);

const nf = (n: number) => n.toLocaleString("th-TH");

/** "3 นาทีที่แล้ว" · "12 ก.ย. 69 14:30" สำหรับของที่เก่ากว่าอาทิตย์ — วันที่เป็น พ.ศ. ตามที่ทีมคุยกัน */
function whenText(iso?: string): string {
  if (!iso) return "ไม่เคยคุย";
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "ไม่เคยคุย";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "เมื่อครู่";
  if (sec < 3600) return `${Math.floor(sec / 60)} นาทีที่แล้ว`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ชม.ที่แล้ว`;
  if (sec < 7 * 86400) return `${Math.floor(sec / 86400)} วันที่แล้ว`;
  return d.toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const daysSince = (iso?: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : Infinity);
const shortId = (id: string) => `${id.slice(0, 8)}…${id.slice(-4)}`;
const nameOf = (r: LineCustomerRow) => r.adminAlias || r.displayName || "";

function LineCustomersInner() {
  const [data, setData] = useState<LineCustomersResponse | null>(null);
  const [fatal, setFatal] = useState("");
  /** กำลังรอคำตอบรอบนี้อยู่ — ทางที่ต้องอ่านทั้งคลัง (ค้น/กรอง) ใช้เวลาหลายวินาที ต้องบอกให้รู้ */
  const [loading, setLoading] = useState(true);
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  /** กรองตามป้าย — คนละแกนกับ filter ใช้พร้อมกันได้ ("" = ไม่กรองป้าย) */
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<LineCustomerRow | null>(null);
  /** แถวที่กำลังกางช่องวางลิงก์ห้องแชทอยู่ (ใส่ได้จากในตารางเลย ไม่ต้องเปิดกล่องแก้ไข) */
  const [linking, setLinking] = useState("");
  const [adding, setAdding] = useState(false);
  const { confirm, dialog } = useConfirm();

  // พิมพ์ค้นหาแล้วหน่วงก่อนยิง — คลังแชทหลักพันห้อง ยิงทุกตัวอักษรไม่ไหว
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(typed.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [typed]);

  const load = useCallback(
    async (fresh = false) => {
      const u = new URLSearchParams({ page: String(page), filter });
      if (tag) u.set("tag", tag);
      if (q) u.set("q", q);
      if (fresh) u.set("fresh", "1");
      setLoading(true);
      try {
        const r = await fetch(`${API}?${u}`, { cache: "no-store" });
        const j = (await r.json().catch(() => null)) as (LineCustomersResponse & { error?: string }) | null;
        if (!r.ok || !j || j.error) {
          setFatal(j?.error || "ดึงข้อมูลคลังแชทไม่สำเร็จ");
          return;
        }
        setFatal("");
        setData(j);
      } catch {
        setFatal("ต่อกับเซิร์ฟเวอร์ไม่ได้ — ข้อมูลที่เห็นอาจเก่า");
      } finally {
        setLoading(false);
      }
    },
    [page, filter, tag, q],
  );

  useEffect(() => {
    void load();
  }, [load]);
  /**
   * ตามให้เองทุกนาทีเฉพาะตอนดู "หน้าแรก แบบไม่กรอง" — รอบนั้นอ่านแค่ 20 ห้อง
   * ตอนค้น/กรองอยู่ไม่ตามให้ เพราะทางนั้นต้องอ่านทั้งคลัง ไม่ควรยิงเองเงียบ ๆ
   */
  usePolling(() => load(), { intervalMs: 60_000, enabled: !q && filter === "all" && !tag && page === 1 });

  /**
   * เปิดจากลิงก์ ?edit=U… (ระบบแชทส่งคนมาแก้ทีละราย) → ค้นคนนั้นให้ แล้วกางกล่องแก้ไขเลย
   * อ่านจาก location เอง ไม่ใช้ useSearchParams — ตัวนั้นบังคับให้ห่อ Suspense ทั้งหน้า
   */
  const [editTarget, setEditTarget] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("edit") ?? "";
    if (/^U[0-9a-f]{32}$/i.test(id)) {
      setEditTarget(id);
      setTyped(id);
    }
  }, []);

  useEffect(() => {
    if (!editTarget || !data) return;
    const hit = data.rows.find((r) => r.userId.toLowerCase() === editTarget.toLowerCase());
    if (hit) setEditing((cur) => cur ?? hit);
  }, [editTarget, data]);

  async function act(body: Record<string, unknown>, tag: string) {
    if (busy) return false;
    setBusy(tag);
    setMsg(null);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; saved?: string; error?: string };
      setMsg(r.ok ? { ok: true, text: j.saved || "บันทึกแล้ว" } : { ok: false, text: j.error || "ทำรายการไม่สำเร็จ" });
      await load(body.action === "add");
      return r.ok;
    } finally {
      setBusy("");
    }
  }

  const rows = data?.rows ?? [];
  const master = data?.master;
  const stale = useMemo(() => (data?.ageMs ?? 0) > 5 * 60_000, [data?.ageMs]);

  if (fatal && !data) {
    return (
      <PageShell>
        <PageHead group="ลูกค้า & การตลาด" title="ลูกค้า LINE" />
        <div className="mt-4">
          <Banner tone="hot" title="เปิดคลังแชทไม่ได้" detail={fatal} />
        </div>
        <div className="mt-3">
          <Btn tone="navy" onClick={() => void load(true)}>
            ลองใหม่
          </Btn>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHead
        group="ลูกค้า & การตลาด"
        title="ลูกค้า LINE"
        count={data && data.indexed >= 0 ? `${nf(data.indexed)} คน` : undefined}
        sub="คลังห้องแชทของบัญชีร้าน — ตั้งชื่อ/โน้ตประจำตัวลูกค้า และเลือกว่าใครให้บอทตอบ ใครให้แอดมินตอบเอง"
        live={
          data
            ? {
                ok: !stale,
                text: stale
                  ? `รายชื่ออ่านไว้เมื่อ ${Math.round((data.ageMs ?? 0) / 60000)} นาทีที่แล้ว — กดรีเฟรชเพื่อดึงใหม่`
                  : "รายชื่อสดจากคลังแชท",
              }
            : undefined
        }
        tools={
          <>
            <SearchBox value={typed} onChange={setTyped} placeholder="ค้นชื่อลูกค้า หรือวางรหัส U…" />
            <Btn onClick={() => void load(true)} title="ดึงรายชื่อสดจากคลังแชทใหม่ทั้งชุด">
              🔄 รีเฟรช
            </Btn>
            <Btn tone="yolk" onClick={() => setAdding(true)}>
              ＋ เพิ่มลูกค้า
            </Btn>
          </>
        }
      />

      {msg && (
        <div className="mt-4">
          <Banner tone={msg.ok ? "warm" : "hot"} title={msg.ok ? "เรียบร้อย" : "ไม่สำเร็จ"} detail={msg.text} />
        </div>
      )}
      {fatal && data && (
        <div className="mt-4">
          <Banner tone="hot" title="ข้อมูลที่เห็นอาจเก่า" detail={fatal} />
        </div>
      )}

      {/* ── สวิตช์ใหญ่: บอทตอบใครบ้าง ── จุดเดียวที่กล้าในหน้านี้ ── */}
      {master && (
        <div className="mt-4">
          <Switch
            label={master.enabled ? "โหมดเลือกตอบ: เปิดอยู่" : "โหมดเลือกตอบ: ปิดอยู่"}
            hint={
              master.enabled
                ? `บอทตอบเฉพาะ ${nf(master.allowedCount)} คนที่เปิดสวิตช์ไว้ · คนอื่นเงียบรอแอดมินตอบ`
                : "บอทตอบลูกค้าทุกคน — สวิตช์รายคนด้านล่างยังไม่มีผลจนกว่าจะเปิดโหมดนี้"
            }
            on={master.enabled}
            onToggle={() => void act({ action: "master", enabled: !master.enabled }, "master")}
          />
        </div>
      )}

      <FilterCard>
        <div className="dkb-scroll">
          {FILTERS.map((f) => (
            <FChip
              key={f.key}
              on={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
              label={f.label}
              count={data ? countOf(f.pick(data.counts)) : undefined}
              style={
                f.key === "followup"
                  ? { background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }
                  : f.key === "ai-on"
                    ? { background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }
                    : undefined
              }
            />
          ))}
        </div>
        <TabRow divider>
          <span className="dkb-flab">ป้าย</span>
          {CUSTOMER_TAGS.map((t) => (
            <FChip
              key={t.key}
              on={tag === t.key}
              onClick={() => {
                setTag(tag === t.key ? "" : t.key);
                setPage(1);
              }}
              label={`${t.dot} ${t.label}`}
              count={countOf(data?.tagCounts?.[t.key])}
              style={{ background: t.wash, color: t.ink }}
            />
          ))}
          <FChip
            on={tag === "untagged"}
            onClick={() => {
              setTag(tag === "untagged" ? "" : "untagged");
              setPage(1);
            }}
            label="ยังไม่ติดป้าย"
            count={countOf(data?.tagCounts?.untagged)}
          />
        </TabRow>
      </FilterCard>

      <ListHead
        title={q ? `ผลค้นหา “${q}”` : filter === "all" ? "คุยกับร้านล่าสุด" : FILTERS.find((f) => f.key === filter)!.label}
        note={
          loading && data
            ? "กำลังอัปเดต…"
            : data
              ? `${nf(data.total)} คน · เรียงคนคุยล่าสุดไว้บน`
              : "กำลังโหลด…"
        }
      />

      {!data ? (
        <Empty
          title="กำลังเปิดคลังแชท…"
          body={
            q || filter !== "all" || tag
              ? "ค้นหา/กรอง ต้องอ่านรายชื่อทั้งคลัง (เก้าพันกว่าห้อง) รอบแรกใช้เวลาสักครู่ รอบต่อไปจะเร็วขึ้น"
              : "ดึงรายชื่อห้องแชทของบัญชีร้าน รอสักครู่"
          }
        />
      ) : rows.length === 0 ? (
        <Empty
          title={q ? "ไม่พบลูกค้าที่ค้น" : filter === "followup" ? "ไม่มีใครรอแอดมินตอบ" : "ยังไม่มีลูกค้าในชั้นนี้"}
          body={
            q
              ? "ชื่อใน LINE มักมีอีโมจิ/ชื่อเล่นปนอยู่ ลองพิมพ์แค่ 2-3 ตัวอักษร หรือกดรีเฟรชถ้าลูกค้าเพิ่งทักเข้ามา"
              : filter === "followup"
                ? "เคลียร์หมดแล้ว — กด “ทั้งหมด” เพื่อดูลูกค้ารายอื่น"
                : "ลูกค้าจะเข้ามาเองเมื่อทักบัญชีร้าน หรือกด “＋ เพิ่มลูกค้า” เพื่อใส่รหัสเอง"
          }
        />
      ) : (
        <>
          <Rows>
            {rows.map((r) => (
              <CustomerRow
                key={r.userId}
                r={r}
                masterOn={!!master?.enabled}
                busy={busy}
                onToggle={() => void act({ action: "toggle", userId: r.userId, allow: !r.allowed }, `t-${r.userId}`)}
                onEdit={() => setEditing(r)}
                linking={linking === r.userId}
                onLink={(open) => setLinking(open ? r.userId : "")}
                onSetTag={(t) => void act({ action: "tag", userId: r.userId, tag: t ?? "" }, `tag-${r.userId}`)}
                onSaveLink={async (url) => {
                  if (await act({ action: "chat-link", userId: r.userId, managerUrl: url }, `link-${r.userId}`)) setLinking("");
                }}
                onDelete={async () => {
                  const who = nameOf(r) || shortId(r.userId);
                  const ok = await confirm({
                    icon: "🗑",
                    title: `ลบ ${who} ออกจากคลังแชท?`,
                    detail:
                      "ห้องแชทและประวัติที่ระบบเก็บไว้ของลูกค้ารายนี้จะหายถาวร กู้คืนไม่ได้\nถ้าแค่ไม่อยากให้บอทตอบ ให้ปิดสวิตช์แทน",
                    confirmLabel: "ลบถาวร",
                    danger: true,
                  });
                  if (ok === true) void act({ action: "delete", userId: r.userId }, `d-${r.userId}`);
                }}
              />
            ))}
          </Rows>

          {data.pages > 1 && (
            <nav className="dkb-pager" aria-label="เปลี่ยนหน้ารายการ">
              <button
                type="button"
                className="dkb-btn dkb-pager-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
              >
                ← ก่อนหน้า
              </button>
              <span className="dkb-pager-info">
                <span>
                  หน้า <b>{nf(data.page)}</b> / {nf(data.pages)}
                </span>
                <small>
                  คนที่ {nf((data.page - 1) * 20 + 1)}–{nf((data.page - 1) * 20 + rows.length)} จาก {nf(data.total)}
                </small>
              </span>
              <button
                type="button"
                className="dkb-btn dkb-pager-btn"
                onClick={() => setPage((p) => p + 1)}
                disabled={data.page >= data.pages}
              >
                ถัดไป →
              </button>
            </nav>
          )}
        </>
      )}

      {editing && (
        <EditDialog
          r={editing}
          oaOwnerId={data?.oaOwnerId ?? ""}
          busy={busy === "edit"}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            if (await act({ action: "edit", userId: editing.userId, ...patch }, "edit")) setEditing(null);
          }}
        />
      )}

      {adding && (
        <AddDialog
          busy={busy === "add"}
          onClose={() => setAdding(false)}
          onAdd={async (input, name) => {
            if (await act({ action: "add", input, name }, "add")) setAdding(false);
          }}
        />
      )}

      {dialog}
    </PageShell>
  );
}

/* ── หนึ่งแถว = หนึ่งห้องแชท ────────────────────────────── */

function CustomerRow({
  r,
  masterOn,
  busy,
  onToggle,
  onEdit,
  onDelete,
  linking,
  onLink,
  onSaveLink,
  onSetTag,
}: {
  r: LineCustomerRow;
  masterOn: boolean;
  busy: string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** กำลังกางช่องวางลิงก์ของแถวนี้อยู่ */
  linking: boolean;
  onLink: (open: boolean) => void;
  onSaveLink: (url: string) => void;
  /** null = ถอดป้าย */
  onSetTag: (t: CustomerTag | null) => void;
}) {
  const [tagOpen, setTagOpen] = useState(false);
  const name = nameOf(r);
  const old = daysSince(r.lastSeen) > STALE_DAYS;
  /**
   * แถบสีซ้าย: ป้ายที่แอดมินติดเองมาก่อนเสมอ (เป็นคำสั่งของคน) ไม่ติดป้ายค่อยใช้สถานะงาน
   * — คนติดป้าย "ด่วนมาก" ไว้แล้วแถวต้องแดง ไม่ใช่กลายเป็นเทาเพราะบอทยังตอบอยู่
   */
  const tone = r.tag
    ? tagInfo(r.tag).tone
    : r.waiting
      ? "var(--dk-coral-deep)"
      : masterOn && r.allowed
        ? "var(--dk-mint)"
        : "var(--dk-quiet)";

  return (
    <Row tone={tone} done={old && !r.waiting && !r.tag}>
      <RowMain
        name={
          <span className="flex items-center gap-2">
            <Avatar src={r.picture} name={name} />
            {name ? (
              <span>{name}</span>
            ) : (
              <span className="italic" style={{ color: "var(--dk-faint)" }}>
                (ยังไม่ทราบชื่อ)
              </span>
            )}
          </span>
        }
        tags={
          <>
            <TagChip value={r.tag} open={tagOpen} onToggle={() => setTagOpen((v) => !v)} />
            {r.waiting && <Tag tone="solid">รอแอดมินตอบ</Tag>}
            {r.adminAlias && r.displayName && <Tag tone="quiet" title={`ชื่อใน LINE: ${r.displayName}`}>{`LINE: ${r.displayName}`}</Tag>}
            {r.chatUrl && r.chatFromOrder && <Tag tone="quiet" title="ลิงก์ที่พนักงานเคยวางไว้ในออเดอร์ของลูกค้ารายนี้">ลิงก์จากออเดอร์</Tag>}
          </>
        }
        meta={
          <>
            <span>คุยล่าสุด {whenText(r.lastSeen)}</span>
            <span className="id" title={r.userId}>
              {shortId(r.userId)}
            </span>
            {r.adminNote && (
              <span className="basis-full" style={{ color: "var(--dk-yolk-ink)" }}>
                📝 {r.adminNote.length > 160 ? `${r.adminNote.slice(0, 160)}…` : r.adminNote}
              </span>
            )}
            {tagOpen && (
              <TagChoices
                value={r.tag}
                busy={!!busy}
                onPick={(t) => {
                  setTagOpen(false);
                  onSetTag(t);
                }}
              />
            )}
            {linking && (
              <ChatLinkBox
                current={r.chatUrl}
                busy={!!busy}
                onCancel={() => onLink(false)}
                onSave={onSaveLink}
              />
            )}
          </>
        }
      />

      {/* ช่องกลาง (จอกว้าง) = สวิตช์บอท — ของที่กดบ่อยที่สุดในแถว */}
      <span className="dkb-dots">
        <button
          type="button"
          onClick={onToggle}
          disabled={!!busy}
          aria-pressed={r.allowed}
          className="dkb-btn dkb-btn-sm dkb-btn-ghost"
          title={masterOn ? "สลับว่าบอทตอบลูกค้ารายนี้ไหม" : "โหมดเลือกตอบยังปิดอยู่ — ตอนนี้บอทตอบทุกคน"}
          style={r.allowed ? { background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" } : undefined}
        >
          <span className="dkb-sw" data-off={r.allowed ? undefined : "1"} aria-hidden />
          {r.allowed ? "บอทตอบ" : "แอดมินตอบเอง"}
        </button>
      </span>

      <RowSide>
        <span className="flex gap-1.5">
          {r.chatUrl ? (
            <a
              href={r.chatUrl}
              target="_blank"
              rel="noreferrer"
              className="dkb-btn dkb-btn-sm dkb-btn-ghost"
              title={`เปิดห้องแชทของ ${name || shortId(r.userId)} ใน LINE OA Manager`}
              style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}
            >
              💬 เปิดแชท
            </a>
          ) : (
            <Btn
              small
              onClick={() => onLink(!linking)}
              title="วางลิงก์ห้องแชทจาก LINE OA Manager — รหัสท้ายลิงก์เดาจากรหัสลูกค้าไม่ได้ ต้องก๊อปมาครั้งเดียว"
            >
              🔗 ใส่ลิงก์แชท
            </Btn>
          )}
          <Btn small onClick={onEdit} title="ตั้งชื่อเรียกเอง · โน้ตประจำตัว · รหัสห้องแชท">
            ✏️ แก้ไข
          </Btn>
          <Btn small onClick={onDelete} disabled={!!busy} title="ลบห้องแชทและประวัติของลูกค้ารายนี้ถาวร">
            🗑
          </Btn>
        </span>
      </RowSide>
    </Row>
  );
}

/**
 * 🏷 ชิปป้ายข้างชื่อ — กดแล้วกางตัวเลือกใต้ชื่อ (ดู TagChoices)
 *
 * ⚠️ ห้ามทำเป็นเมนูลอย: .dkb-lrow ตั้ง overflow:hidden ไว้ เมนูจะโดนตัดหายครึ่งใบ
 */
function TagChip({ value, open, onToggle }: { value: CustomerTag | null; open: boolean; onToggle: () => void }) {
  const cur = value ? tagInfo(value) : null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="dkb-tag"
      title={cur ? `ป้าย: ${cur.label} — กดเพื่อเปลี่ยน` : "ติดป้ายความเร่งด่วนให้ลูกค้ารายนี้"}
      style={
        cur
          ? { background: cur.wash, color: cur.ink, fontWeight: 700 }
          : { background: "transparent", color: "var(--dk-faint)", boxShadow: "inset 0 0 0 1px var(--dk-hair)" }
      }
    >
      {cur ? `${cur.dot} ${cur.label}` : "🏷 ติดป้าย"}
    </button>
  );
}

/** ตัวเลือกป้ายที่กางอยู่ใต้ชื่อในแถวเลย — ปุ่มสูงพอกดด้วยนิ้วโป้งบนมือถือ */
function TagChoices({
  value,
  busy,
  onPick,
}: {
  value: CustomerTag | null;
  busy: boolean;
  onPick: (t: CustomerTag | null) => void;
}) {
  return (
    <span className="basis-full" onClick={(e) => e.stopPropagation()}>
      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {CUSTOMER_TAGS.map((t) => {
          const on = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              disabled={busy}
              aria-pressed={on}
              onClick={() => onPick(on ? null : t.key)}
              className="dkb-btn dkb-btn-sm disabled:opacity-50"
              style={{
                background: t.wash,
                color: t.ink,
                fontWeight: 700,
                boxShadow: on ? `inset 0 0 0 2px ${t.tone}` : "inset 0 0 0 1px var(--dk-hair)",
              }}
            >
              {t.dot} {t.label}
              {on && " ✓"}
            </button>
          );
        })}
        {value && (
          <button type="button" disabled={busy} onClick={() => onPick(null)} className="dkb-btn dkb-btn-sm dkb-btn-ghost">
            เอาป้ายออก
          </button>
        )}
      </span>
    </span>
  );
}

/**
 * ช่องวางลิงก์ห้องแชทที่กางอยู่ในแถวเลย — เคสที่เจอบ่อยคือ "เปิด OA Manager ค้างอยู่แล้ว
 * ก๊อปลิงก์มาวาง" ไม่คุ้มที่จะต้องเปิดกล่องแก้ไขทั้งใบเพื่อกรอกช่องเดียว
 */
function ChatLinkBox({
  current,
  busy,
  onCancel,
  onSave,
}: {
  current: string | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (url: string) => void;
}) {
  const [url, setUrl] = useState(current ?? "");
  const picked = useMemo(() => {
    const t = url.trim();
    if (!t) return null;
    const m = t.match(/chat\/2?([A-Za-z][0-9a-f]{32})/i) ?? t.match(/^2?([A-Za-z][0-9a-f]{32})$/i);
    return m ? m[1] : "";
  }, [url]);

  return (
    <span className="basis-full" onClick={(e) => e.stopPropagation()}>
      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && picked) onSave(url.trim());
            if (e.key === "Escape") onCancel();
          }}
          placeholder="วางลิงก์ https://chat.line.biz/…/chat/U…"
          className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11.5px] text-slate-700 outline-none focus:border-sky-300"
        />
        <button
          type="button"
          disabled={busy || !picked}
          onClick={() => onSave(url.trim())}
          className="dkb-btn dkb-btn-sm dkb-btn-navy disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก…" : "ผูกลิงก์"}
        </button>
        <button type="button" onClick={onCancel} className="dkb-btn dkb-btn-sm dkb-btn-ghost">
          ยกเลิก
        </button>
      </span>
      <span className="mt-1 block text-[11px]" style={{ color: picked === "" ? "var(--dk-coral-ink)" : "var(--dk-faint)" }}>
        {picked === ""
          ? "หารหัสห้องแชทในลิงก์ไม่เจอ — ก๊อปทั้งลิงก์จากช่อง URL ตอนเปิดห้องแชทนั้นใน OA Manager"
          : picked
            ? `จะผูกกับห้อง ${picked}`
            : "รหัสท้ายลิงก์ไม่ใช่รหัสลูกค้า เดาเองไม่ได้ — ต้องก๊อปมาวางครั้งเดียว แล้วระบบจำให้ตลอด"}
      </span>
    </span>
  );
}

function Avatar({ src, name }: { src?: string; name: string }) {
  const [bad, setBad] = useState(false);
  if (src && !bad)
    // eslint-disable-next-line @next/next/no-img-element -- รูปโปรไฟล์มาจากโดเมนของ LINE ที่เปลี่ยนไปเรื่อย ๆ ใส่ใน next/image ไม่ได้
    return (
      <img
        src={src}
        alt=""
        onError={() => setBad(true)}
        className="h-8 w-8 flex-none rounded-xl object-cover"
        style={{ background: "var(--dk-sky)" }}
      />
    );
  return (
    <span
      className="grid h-8 w-8 flex-none place-items-center rounded-xl text-[13px] font-semibold"
      style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}
      aria-hidden
    >
      {name ? name.trim().slice(0, 1).toUpperCase() : "?"}
    </span>
  );
}

/* ── กล่องแก้ไข ─────────────────────────────────────────── */

const INP =
  "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13.5px] text-slate-800 outline-none focus:border-sky-300";
const LB = "mb-1 block text-[11.5px] font-bold text-slate-500";

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <p className="text-[15px] font-extrabold text-slate-800">{title}</p>
          <button type="button" onClick={onClose} className="text-lg text-slate-400 hover:text-slate-700" aria-label="ปิด">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function EditDialog({
  r,
  oaOwnerId,
  busy,
  onClose,
  onSave,
}: {
  r: LineCustomerRow;
  oaOwnerId: string;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: { adminAlias: string; adminNote: string; managerUrl: string }) => void;
}) {
  const [alias, setAlias] = useState(r.adminAlias ?? "");
  const [note, setNote] = useState(r.adminNote ?? "");
  const [managerUrl, setManagerUrl] = useState(
    r.managerUserId ? (oaOwnerId ? `https://chat.line.biz/${oaOwnerId}/chat/${r.managerUserId}` : r.managerUserId) : "",
  );

  // แกะรหัสให้ดูสด ๆ ตอนวางลิงก์ — จะได้รู้ก่อนกดบันทึกว่าวางถูกใบไหม
  const picked = useMemo(() => {
    const t = managerUrl.trim();
    if (!t) return null;
    const m = t.match(/2(U[0-9a-f]{32})/i) ?? t.match(/(U[0-9a-f]{32})/i);
    return m ? m[1] : "";
  }, [managerUrl]);

  return (
    <Sheet title="แก้ไขข้อมูลลูกค้า" onClose={onClose}>
      <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
        <Avatar src={r.picture} name={nameOf(r)} />
        <p className="min-w-0 break-all font-mono text-[10.5px] text-slate-400">{r.userId}</p>
      </div>

      <label className="block">
        <span className={LB}>ชื่อที่เราเรียก (ทับชื่อใน LINE)</span>
        <input
          className={INP}
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder={r.displayName || "เช่น พี่ปุ้ย ร้านเค้ก"}
        />
        <span className="mt-1 block text-[11px] text-slate-400">
          {r.displayName ? `ปล่อยว่าง = ใช้ชื่อจาก LINE “${r.displayName}”` : "LINE ยังไม่ให้ชื่อมา — ตั้งชื่อไว้จะหาเจอง่ายขึ้น"}
        </span>
      </label>

      <label className="mt-3 block">
        <span className={LB}>โน้ตประจำตัว (เห็นเฉพาะพนักงาน)</span>
        <textarea
          rows={3}
          className={`${INP} resize-none`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={"เช่น สั่งสติกเกอร์ทุกเดือน ชอบไดคัทเส้นหนา\nขอใบกำกับภาษีทุกครั้ง"}
        />
      </label>

      <label className="mt-3 block">
        <span className={LB}>ลิงก์ห้องแชทใน LINE OA Manager (ถ้ามี)</span>
        <input
          className={`${INP} font-mono text-[11.5px]`}
          value={managerUrl}
          onChange={(e) => setManagerUrl(e.target.value)}
          placeholder="https://chat.line.biz/…/chat/2U…"
        />
        <span
          className="mt-1 block text-[11px]"
          style={{ color: picked === "" ? "var(--dk-coral-ink)" : picked ? "var(--dk-mint-ink)" : undefined }}
        >
          {picked === ""
            ? "หารหัสในลิงก์ไม่เจอ — ต้องมี U ตามด้วยตัวอักษร/ตัวเลข 32 ตัว"
            : picked
              ? `จะบันทึกรหัส ${picked}`
              : "วางลิงก์จากหน้าแชทของ LINE OA Manager ระบบจะแกะรหัสให้เอง (ตัดเลข 2 ที่นำหน้าออกให้)"}
        </span>
      </label>

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600">
          ยกเลิก
        </button>
        <button
          type="button"
          disabled={busy || picked === ""}
          onClick={() => onSave({ adminAlias: alias.trim(), adminNote: note.trim(), managerUrl: managerUrl.trim() })}
          className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </Sheet>
  );
}

/* ── กล่องเพิ่มลูกค้าด้วยมือ ─────────────────────────────── */

function AddDialog({ busy, onClose, onAdd }: { busy: boolean; onClose: () => void; onAdd: (input: string, name: string) => void }) {
  const [input, setInput] = useState("");
  const [name, setName] = useState("");

  const picked = useMemo(() => {
    const t = input.trim();
    if (!t) return null;
    const m = t.match(/^(U[0-9a-f]{32})$/i) ?? t.match(/2(U[0-9a-f]{32})/i) ?? t.match(/(U[0-9a-f]{32})/i);
    return m ? m[1] : "";
  }, [input]);

  return (
    <Sheet title="เพิ่มลูกค้าเข้าคลังแชท" onClose={onClose}>
      <label className="block">
        <span className={LB}>วางรหัสลูกค้า หรือลิงก์ห้องแชทจาก LINE OA Manager</span>
        <textarea
          rows={3}
          autoFocus
          className={`${INP} resize-none font-mono text-[12px]`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"U6bd04905d8409c790046bd69af35cdda\nหรือ https://chat.line.biz/…/chat/2U…"}
        />
        <span
          className="mt-1 block text-[11px]"
          style={{ color: picked === "" ? "var(--dk-coral-ink)" : picked ? "var(--dk-mint-ink)" : "var(--dk-faint)" }}
        >
          {picked === ""
            ? "หารหัสลูกค้าในข้อความนี้ไม่เจอ — วางทั้งลิงก์จากช่อง URL ได้เลย"
            : picked
              ? `พบรหัส ${picked}`
              : "วางอะไรมาก็ได้ ระบบจะแกะรหัสให้เอง"}
        </span>
      </label>

      <label className="mt-3 block">
        <span className={LB}>ชื่อที่เราเรียก (ใส่ก็ได้ ไม่ใส่ก็ได้)</span>
        <input className={INP} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น พี่ปุ้ย ร้านเค้ก" />
        <span className="mt-1 block text-[11px] text-slate-400">
          ระบบจะขอชื่อจาก LINE ให้ก่อน — ถ้าลูกค้ายังไม่ได้เพิ่มบัญชีร้านเป็นเพื่อน LINE จะไม่ให้ชื่อมา แล้วจะใช้ชื่อนี้แทน
        </span>
      </label>

      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[11.5px] leading-relaxed text-slate-500">
        เพิ่มแล้วระบบจะ<b className="text-slate-700">เปิดสวิตช์ให้บอทตอบ</b>ลูกค้ารายนี้ไว้ให้เลย ปิดทีหลังได้ที่รายการด้านล่าง
      </p>

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600">
          ยกเลิก
        </button>
        <button
          type="button"
          disabled={busy || !picked}
          onClick={() => onAdd(input.trim(), name.trim())}
          className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {busy ? "กำลังเพิ่ม…" : "เพิ่มลูกค้า"}
        </button>
      </div>
    </Sheet>
  );
}

export default function LineCustomersPage() {
  return (
    <RequirePerm perm="orders.edit">
      <LineCustomersInner />
    </RequirePerm>
  );
}
