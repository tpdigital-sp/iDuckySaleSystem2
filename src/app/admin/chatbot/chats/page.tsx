"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Btn, Empty, PageHead, PageShell, SearchBox, Tag } from "@/components/admin/ui";
import { ago, botApi, ChatbotTabs, useToast } from "../bot-ui";

/**
 * 💬 แชท LINE ที่บอทเห็น — ห้องแชทรายคน + ข้อความครบ (ลูกค้าพิมพ์ / บอทตอบ) + สถานะลูกค้าใหม่/เก่า
 *
 * เจ้าของร้าน 8 ต.ค. 69 18:45: "อยากให้บอทเริ่มตอบจากลูกค้าใหม่ก่อน และบันทึกแชทด้วย"
 *   · ใหม่ = ทักครั้งแรกหลังเปิดโหมด (settings/bot-whitelist.newSince) และไม่มีออเดอร์ → บอทตอบ (ติดธงแล้วตอบต่อเนื่อง)
 *   · เก่า = ที่เหลือ → บอทเงียบ ให้แอดมินตอบใน LINE (ข้อความยังถูกบันทึก)
 *   · ⚠️ ข้อความที่แอดมินพิมพ์เองใน LINE ระบบไม่เห็น (LINE ไม่ส่งมาที่ webhook) — เห็นเฉพาะลูกค้า + บอท
 */
type Row = {
  id: string;
  displayName: string;
  pictureUrl: string;
  lastSeen: string;
  createdAt: string;
  messageCount: number;
  lastUserText: string;
  scope: "new" | "old";
  botScope: string;
  needsHumanFollowup: boolean;
};
type LogEntry = { role: string; text: string; at: string; type?: string; mode?: string };
type Settings = { mode: string; newSince: string; enabled: boolean };
type ListRes = { rows: Row[]; settings: Settings; count: number };
type DetailRes = Row & { log: LogEntry[]; messages: LogEntry[]; settings: Settings };

const SCOPES: { key: "all" | "new" | "old"; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "new", label: "🆕 ลูกค้าใหม่ (บอทตอบ)" },
  { key: "old", label: "👤 ลูกค้าเก่า (แอดมินตอบ)" },
];

function timeTh(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ChatsPage() {
  return (
    <RequirePerm perm="reports.view">
      <Chats />
    </RequirePerm>
  );
}

function Chats() {
  const { toast, toastNode } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scope, setScope] = useState<"all" | "new" | "old">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string>("");
  const [detail, setDetail] = useState<DetailRes | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await botApi<ListRes>(`/api/admin/chatbot/chats?scope=${scope}&limit=80${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      setRows(d.rows);
      setSettings(d.settings);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setLoading(false);
    }
  }, [scope, q, toast]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // รีเฟรชรายการทุก 30 วิ (แชทเข้าตลอด) — เฉพาะตอนไม่ได้ค้นหา
  useEffect(() => {
    if (q) return;
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load, q]);

  const openRoom = useCallback(
    async (id: string) => {
      setSel(id);
      setDetailLoading(true);
      try {
        setDetail(await botApi<DetailRes>(`/api/admin/chatbot/chats?id=${id}`));
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      } finally {
        setDetailLoading(false);
      }
    },
    [toast],
  );

  const counts = useMemo(() => ({ newN: rows.filter((r) => r.scope === "new").length, oldN: rows.filter((r) => r.scope === "old").length }), [rows]);
  const modeText = !settings
    ? ""
    : settings.mode === "new-only"
      ? `โหมดลูกค้าใหม่ก่อน — บอทตอบเฉพาะคนที่ทักครั้งแรกหลัง ${timeTh(settings.newSince)} (และรายชื่อทดสอบ) · ลูกค้าเก่าแอดมินตอบเอง`
      : settings.enabled
        ? "โหมดรายชื่อทดสอบ — บอทตอบเฉพาะไอดีในรายชื่อ"
        : "บอทตอบทุกคน";

  // ข้อความที่จะแสดง: log ครบ (ตั้งแต่ 8 ต.ค. 69) ถ้าไม่มีใช้ messages 20 ตัวล่าสุด
  const thread: LogEntry[] = detail ? (detail.log.length ? detail.log : detail.messages) : [];

  return (
    <PageShell wide>
      <PageHead group="🤖 Chatbot" title="แชท LINE" count={rows.length ? `${rows.length} ห้อง` : undefined} sub={modeText} tools={<ChatbotTabs inHead />} toolsTop />

      <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setScope(s.key)}
            className="min-h-[36px] rounded-full px-3.5 text-[13px] font-bold transition"
            style={scope === s.key ? { background: "var(--dk-navy)", color: "white" } : { background: "white", color: "var(--dk-navy-soft)", border: "1px solid var(--dk-hair)" }}
          >
            {s.label}
            {s.key === "new" && counts.newN ? ` ${counts.newN}` : s.key === "old" && counts.oldN ? ` ${counts.oldN}` : ""}
          </button>
        ))}
        <div className="min-w-[220px] flex-1">
          <SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อลูกค้า (ขึ้นต้นด้วย…)" />
        </div>
        <Btn onClick={() => void load()} small>
          รีเฟรช
        </Btn>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* รายการห้อง */}
        <div className="dkb-card max-h-[75vh] overflow-y-auto p-2">
          {loading && !rows.length ? (
            <p className="p-4 text-sm" style={{ color: "var(--dk-faint)" }}>
              กำลังโหลด…
            </p>
          ) : !rows.length ? (
            <Empty title="ยังไม่มีห้องแชท" body={q ? "ไม่พบชื่อที่ค้น — ลองพิมพ์คำขึ้นต้นของชื่อ LINE" : "เมื่อลูกค้าทักมา ห้องจะขึ้นที่นี่"} />
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => void openRoom(r.id)}
                className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-black/[0.03]"
                style={sel === r.id ? { background: "var(--dk-mint-bg, #ECFDF5)" } : undefined}
              >
                {r.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.pictureUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-full" style={{ background: "var(--dk-hair)" }} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-bold" style={{ color: "var(--dk-navy)" }}>
                      {r.displayName || r.id.slice(0, 10) + "…"}
                    </span>
                    <Tag tone={r.scope === "new" ? "mint" : "quiet"}>{r.scope === "new" ? "ใหม่" : "เก่า"}</Tag>
                    {r.needsHumanFollowup ? <Tag tone="coral">รอแอดมิน</Tag> : null}
                  </div>
                  <p className="truncate text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                    {r.lastUserText || "—"}
                  </p>
                  <p className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                    {r.lastSeen ? ago(r.lastSeen) : ""}
                    {r.messageCount ? ` · บอทคุย ${r.messageCount} ข้อความ` : ""}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* ห้องที่เลือก */}
        <div className="dkb-card flex max-h-[75vh] flex-col p-0">
          {!sel ? (
            <div className="p-6">
              <Empty title="เลือกห้องแชททางซ้าย" body="จะเห็นข้อความที่ลูกค้าพิมพ์และที่บอทตอบ (ข้อความที่แอดมินพิมพ์เองใน LINE ระบบไม่เห็น)" />
            </div>
          ) : detailLoading && !detail ? (
            <p className="p-4 text-sm" style={{ color: "var(--dk-faint)" }}>
              กำลังโหลด…
            </p>
          ) : detail ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--dk-hair)" }}>
                <span className="text-[15px] font-bold" style={{ color: "var(--dk-navy)" }}>
                  {detail.displayName || detail.id}
                </span>
                <Tag tone={detail.scope === "new" ? "mint" : "quiet"}>{detail.scope === "new" ? "🆕 ลูกค้าใหม่ — บอทตอบ" : "👤 ลูกค้าเก่า — แอดมินตอบ"}</Tag>
                <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                  ทักครั้งแรก {detail.createdAt ? timeTh(detail.createdAt) : "—"} · ล่าสุด {detail.lastSeen ? ago(detail.lastSeen) : "—"}
                </span>
                <span className="ml-auto font-mono text-[11px]" style={{ color: "var(--dk-faint)" }}>
                  {detail.id}
                </span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {!thread.length ? (
                  <p className="text-sm" style={{ color: "var(--dk-faint)" }}>
                    ยังไม่มีข้อความที่บันทึกไว้
                  </p>
                ) : (
                  thread.map((m, i) => {
                    const mine = m.role === "assistant";
                    return (
                      <div key={i} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                        <div
                          className="max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed"
                          style={mine ? { background: "#F1F5F9", color: "var(--dk-navy)" } : { background: "#DCF8C6", color: "#1F2937" }}
                        >
                          {m.text}
                          <div className="mt-1 text-[10.5px] opacity-60">
                            {mine ? "บอท" : "ลูกค้า"}
                            {m.mode ? ` · ${m.mode}` : ""} · {timeTh(m.at)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {detail.log.length === 0 && detail.messages.length ? (
                  <p className="pt-2 text-center text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                    ห้องนี้ยังไม่มีบันทึกแบบครบ (เริ่มเก็บ 8 ต.ค. 69) — แสดง 20 ข้อความล่าสุดที่บอทจำไว้
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
      {toastNode}
    </PageShell>
  );
}
