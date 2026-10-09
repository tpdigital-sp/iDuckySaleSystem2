"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Banner, Btn, Empty, PageHead, PageShell, Stat, Stats } from "@/components/admin/ui";
import { useCan } from "@/lib/perm-context";
import { botApi, ChatbotTabs, useToast } from "../bot-ui";
import { AUTO_REPLY_NAME, SYSTEM_SENDERS, csvTs, cycleBack, cycleKey, feedConversation, finalizeSender, newAcc, parseCsv, resolveOaName, thDate, type OaSummary, type SenderAcc, type SenderStats } from "@/lib/chat-stats";
import { readZip } from "@/lib/zip-read";

/**
 * 📊 สถิติตอบแชท / ค่าคอมแชท — รอบบิล 26→25 (เจ้าของร้าน 9 ต.ค. 69 21:20)
 *   ① ฝั่งเว็บ: นับจาก log ที่พนักงานตอบผ่านหน้า แชท LINE / ตอบลูกค้า (เซิร์ฟเวอร์นับให้)
 *   ② ฝั่ง LINE OA Manager: โยน zip CSV ที่ดาวน์โหลดจาก OA Manager → อ่านในเบราว์เซอร์ (ไฟล์เป็นร้อย MB ส่งขึ้นเซิร์ฟเวอร์ไม่ได้) → ส่งแค่ตัวเลขสรุป
 *   ③ รวมต่อพนักงาน + จับคู่ชื่อใน OA ที่ระบบเดาไม่ออก → บันทึก = หน้าค่าคอมเดิม (Admin_MyWebApp) เห็นทั้งสองฝั่ง
 */
type Resp = {
  cycle: { start: string; end: string; key: string };
  web: { senders: SenderStats[]; rooms: number; customerMsgs: number };
  staff: string[];
  alias: Record<string, string>;
  saved: { savedAt: string | null; savedBy: string; oa: OaSummary | null; web: SenderStats[] } | null;
  old: { uploadedAt: string | null; uploadedBy: string; version: string; senders: number } | null;
};

const CYCLES = Array.from({ length: 8 }, (_, i) => cycleBack(i));
const fmtInt = (n: number) => n.toLocaleString("th-TH");
const fmtMin = (m: number | null) => (m === null ? "—" : m < 60 ? `${m} นาที` : `${(m / 60).toFixed(1)} ชม.`);
const fmtWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function ChatStatsPage() {
  return (
    <RequirePerm perm="reports.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const can = useCan();
  const { toast, toastNode } = useToast();
  const [ci, setCi] = useState(0);
  const cycle = CYCLES[ci];
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [oa, setOa] = useState<OaSummary | null>(null); // ผลอ่าน zip ที่ยังไม่บันทึก
  const [prog, setProg] = useState<{ text: string; pct: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      setData(await botApi<Resp>(`/api/admin/chatbot/chat-stats?start=${cycle.start}&end=${cycle.end}`));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [cycle.start, cycle.end]);
  useEffect(() => {
    setOa(null);
    void load();
  }, [load]);

  // ---- อ่าน zip จาก LINE OA Manager (ในเครื่อง) ----
  const handleZip = useCallback(
    async (file: File) => {
      if (!/\.zip$/i.test(file.name)) return toast("ต้องเป็นไฟล์ .zip ที่ดาวน์โหลดจาก LINE OA Manager", true);
      if (typeof DecompressionStream === "undefined") return toast("เบราว์เซอร์นี้แตกไฟล์ zip ไม่ได้ — ใช้ Chrome/Safari รุ่นใหม่", true);
      const s8 = cycle.start.replace(/-/g, "");
      const e8 = cycle.end.replace(/-/g, "");
      const startSlash = cycle.start.replace(/-/g, "/");
      const endSlash = cycle.end.replace(/-/g, "/");
      try {
        setProg({ text: `กำลังเปิด ${file.name} (${(file.size / 1048576).toFixed(0)} MB)…`, pct: 2 });
        const all = await readZip(file);
        const entries: { idx: string; name: string; read: () => Promise<Uint8Array> }[] = [];
        let filesTotal = 0;
        let coverStart = "";
        let coverEnd = "";
        for (const z of all) {
          const base = z.name.split("/").pop() ?? "";
          const m = /^(\d+)_(\d{8})_(\d{8})_(.*)\.csv$/i.exec(base);
          if (!m) continue;
          filesTotal++;
          if (!coverStart || m[2] < coverStart) coverStart = m[2];
          if (!coverEnd || m[3] > coverEnd) coverEnd = m[3];
          if (m[3] < s8 || m[2] > e8) continue; // ชื่อไฟล์ = N_วันแรก_วันล่าสุด_ชื่อลูกค้า → อ่านเฉพาะที่คาบเกี่ยวรอบ
          entries.push({ idx: m[1], name: m[4], read: z.read });
        }
        if (!filesTotal) throw new Error("ในไฟล์ไม่มี CSV รูปแบบ LINE OA (ชื่อไฟล์ N_YYYYMMDD_YYYYMMDD_ชื่อ.csv)");
        const ymd8 = (v: string) => (v ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : "");
        const coverTxt = `ไฟล์นี้มีแชทตั้งแต่ ${thDate(ymd8(coverStart))} ถึง ${thDate(ymd8(coverEnd))}`;
        if (!entries.length || coverEnd < s8) throw new Error(`${coverTxt} — ไม่มีข้อความในรอบ ${thDate(cycle.start)} – ${thDate(cycle.end)} · ดาวน์โหลด CSV ชุดใหม่หลังวันที่ ${thDate(cycle.end)} แล้วลองอีกครั้ง`);
        const acc = new Map<string, SenderAcc>();
        const dec = new TextDecoder("utf-8");
        let customerMsgs = 0;
        let autoReplies = 0;
        let filesRead = 0;
        let rowsRead = 0;
        let chats = 0;
        for (let i = 0; i < entries.length; i++) {
          const it = entries[i];
          let text = dec.decode(await it.read());
          if (text.indexOf("\u0000") !== -1) text = text.replace(/\u0000/g, "");
          const hdr = text.indexOf("ประเภทผู้ส่ง");
          if (hdr === -1) continue;
          const nl = text.indexOf("\n", hdr);
          const rows = parseCsv(nl === -1 ? "" : text.slice(nl + 1));
          filesRead++;
          const msgs: { who: string; at: number; text: string }[] = [];
          for (const row of rows) {
            if (row.length < 4) continue;
            const [type, sender, date, tm = "", msg = ""] = row;
            if (date < startSlash || date > endSlash) continue;
            rowsRead++;
            if (type === "User") msgs.push({ who: "cust", at: csvTs(date, tm), text: msg });
            else if (type === "Account") {
              if (sender === AUTO_REPLY_NAME) {
                autoReplies++;
                msgs.push({ who: "auto", at: csvTs(date, tm), text: msg });
              } else if (SYSTEM_SENDERS.has(sender)) msgs.push({ who: "sys", at: csvTs(date, tm), text: msg });
              else msgs.push({ who: sender, at: csvTs(date, tm), text: msg });
            }
          }
          const r = feedConversation(acc, it.idx, msgs);
          customerMsgs += r.customerMsgs;
          if (r.customerMsgs) chats++;
          if (i % 50 === 0 || i === entries.length - 1) {
            setProg({ text: `กำลังอ่านแชท ${fmtInt(i + 1)} / ${fmtInt(entries.length)} (ข้าม ${fmtInt(filesTotal - entries.length)} แชทนอกรอบ)`, pct: 5 + (95 * (i + 1)) / entries.length });
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        if (!rowsRead) throw new Error(`${coverTxt} แต่ไม่พบข้อความในรอบที่เลือก — เช็คว่าเลือกรอบบิลถูกหรือไม่`);
        const senders = [...acc.values()].map((a) => finalizeSender(a, "oa")).sort((a, b) => b.replies - a.replies);
        setOa({ fileName: file.name, fileSize: file.size, coverStart, coverEnd, partial: coverEnd < e8, filesTotal, filesRead, rowsRead, chats, customerMsgs, autoReplies, senders });
        setProg({ text: `✅ อ่านแล้ว ${fmtInt(filesRead)} แชท · ${fmtInt(rowsRead)} ข้อความ · ผู้ตอบ ${senders.length} ชื่อ — ตรวจตารางแล้วกด "บันทึกรอบนี้"`, pct: 100 });
      } catch (e) {
        setProg({ text: `❌ ${(e as Error).message}`, pct: 0 });
        toast(`อ่านไฟล์ไม่สำเร็จ: ${(e as Error).message}`, true);
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [cycle.start, cycle.end, toast]
  );

  const save = useCallback(async () => {
    if (!data) return;
    const msg = oa
      ? `บันทึกรอบ ${thDate(cycle.start)} – ${thDate(cycle.end)}: ฝั่งเว็บ ${data.web.senders.length} คน + จาก OA Manager ${oa.senders.length} ชื่อ${data.old ? `\n\n⚠️ รอบนี้เคยบันทึกจาก${data.old.version?.startsWith("iducky") ? "หน้านี้" : "หน้าค่าคอมเดิม"}เมื่อ ${fmtWhen(data.old.uploadedAt)} โดย ${data.old.uploadedBy} — จะเขียนทับ` : ""}`
      : `บันทึกเฉพาะฝั่งเว็บของรอบ ${thDate(cycle.start)} – ${thDate(cycle.end)} (ยังไม่ได้อัปโหลด zip — ผล OA ที่เคยบันทึกไว้จะคงเดิม)`;
    if (!window.confirm(msg)) return;
    setSaving(true);
    try {
      await botApi("/api/admin/chatbot/chat-stats", { action: "save", start: cycle.start, end: cycle.end, oa });
      toast("บันทึกแล้ว — หน้าค่าคอม ใบสั่งซื้อ+แชท เห็นรอบนี้ทันที");
      setOa(null);
      setProg(null);
      await load();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }, [data, oa, cycle.start, cycle.end, toast, load]);

  const setAlias = useCallback(
    async (chatName: string, staffName: string | null) => {
      try {
        await botApi("/api/admin/chatbot/chat-stats", { action: "alias", chatName, staffName });
        setData((d) => {
          if (!d) return d;
          const alias = { ...d.alias };
          if (staffName === null) delete alias[chatName];
          else alias[chatName] = staffName;
          return { ...d, alias };
        });
      } catch (e) {
        toast((e as Error).message, true);
      }
    },
    [toast]
  );

  // ---- รวมต่อพนักงาน ----
  const oaSenders = oa?.senders ?? data?.saved?.oa?.senders ?? [];
  const oaSource = oa ? "zip ที่เพิ่งอ่าน" : data?.saved?.oa ? `ที่บันทึกไว้ ${fmtWhen(data.saved.savedAt)}` : "";
  const rows = useMemo(() => {
    if (!data) return [];
    const staffNames = data.staff;
    type R = { name: string; web?: SenderStats; oa: SenderStats[]; known: boolean };
    const map = new Map<string, R>();
    const get = (name: string, known: boolean) => {
      let r = map.get(name);
      if (!r) {
        r = { name, oa: [], known };
        map.set(name, r);
      }
      return r;
    };
    for (const s of data.web.senders) get(s.name, staffNames.includes(s.name)).web = s;
    for (const s of oaSenders) {
      const to = resolveOaName(s.name, data.alias, staffNames);
      if (to === "") continue; // ตั้งใจบอกว่าไม่ใช่พนักงาน
      get(to ?? s.name, to !== null).oa.push(s);
    }
    const sum = (r: R) => (r.web?.replies ?? 0) + r.oa.reduce((a, s) => a + s.replies, 0);
    const cust = (r: R) => (r.web?.chats ?? 0) + r.oa.reduce((a, s) => a + s.chats, 0);
    return [...map.values()].map((r) => ({ ...r, total: sum(r), customers: cust(r) })).sort((a, b) => b.total - a.total);
  }, [data, oaSenders]);
  const unknownOa = useMemo(() => (data ? oaSenders.filter((s) => resolveOaName(s.name, data.alias, data.staff) === null) : []), [data, oaSenders]);
  const totalWeb = data?.web.senders.reduce((a, s) => a + s.replies, 0) ?? 0;
  const totalOa = oaSenders.reduce((a, s) => a + s.replies, 0);

  return (
    <PageShell>
      <PageHead group="🤖 Chatbot" title="สถิติตอบแชท" count={data ? `${rows.filter((r) => r.known).length} คน` : undefined} sub="นับข้อความและจำนวนลูกค้าที่พนักงานตอบ ต่อรอบบิล 26 → 25 · ฝั่งเว็บนับให้เอง · ฝั่ง LINE OA Manager โยน zip CSV เข้ามา" tools={<ChatbotTabs inHead />} toolsTop />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <label className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
          รอบบิล
          <select value={ci} onChange={(e) => setCi(Number(e.target.value))} className="h-10 rounded-xl border bg-white px-3 text-[14px] font-bold" style={{ borderColor: "var(--dk-hair)", color: "var(--dk-navy)" }}>
            {CYCLES.map((c, i) => (
              <option key={cycleKey(c)} value={i}>
                {thDate(c.start)} – {thDate(c.end)}
                {i === 0 ? " (รอบนี้)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1.5">
          <Btn small onClick={() => void load()} title="นับฝั่งเว็บใหม่">
            ↻ รีเฟรช
          </Btn>
          {can("settings.manage") && (
            <Btn small tone="navy" disabled={!data || saving} onClick={() => void save()} title="บันทึกผลรอบนี้ให้หน้าค่าคอมเดิมใช้">
              {saving ? "กำลังบันทึก…" : "💾 บันทึกรอบนี้"}
            </Btn>
          )}
        </div>
      </div>

      {err && <div className="mt-4"><Banner tone="hot" title="โหลดสถิติไม่ได้" detail={err} /></div>}

      {data && (
        <div className="mt-4">
          <Stats cols={4}>
            <Stat label="ตอบบนเว็บ (ข้อความ)" value={fmtInt(totalWeb)} hint={`${fmtInt(data.web.rooms)} ลูกค้า · ${data.web.senders.length} คน`} />
            <Stat label="ตอบใน OA Manager (ข้อความ)" value={oaSenders.length ? fmtInt(totalOa) : "—"} hint={oaSenders.length ? `${fmtInt(oa?.chats ?? data.saved?.oa?.chats ?? 0)} แชท · ${oaSource}` : "ยังไม่ได้อัปโหลด zip รอบนี้"} />
            <Stat label="ชื่อใน OA ที่ยังไม่จับคู่" value={fmtInt(unknownOa.length)} hint={unknownOa.length ? "เลือกพนักงานในตารางล่าง" : "ครบแล้ว"} tone={unknownOa.length ? "due" : undefined} />
            <Stat label="บันทึกล่าสุด" value={data.saved ? fmtWhen(data.saved.savedAt) : "ยังไม่บันทึก"} hint={data.saved ? `โดย ${data.saved.savedBy}` : data.old ? `หน้าค่าคอมเดิมบันทึกเอง ${fmtWhen(data.old.uploadedAt)}` : "กด 💾 เมื่อข้อมูลครบ"} />
          </Stats>
        </div>
      )}

      {/* 📥 zip จาก LINE OA Manager */}
      {can("settings.manage") && (
        <div
          className="dkb-card mt-4 p-4"
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleZip(f);
          }}
          style={drag ? { outline: "2px dashed var(--dk-navy)", outlineOffset: -4 } : undefined}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[15px] font-extrabold" style={{ color: "var(--dk-navy)" }}>📥 แชทจาก LINE OA Manager (zip CSV)</p>
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
                OA Manager → แชท → ⚙ → ดาวน์โหลดประวัติแชท (CSV) หลังวันที่ {thDate(cycle.end)} แล้วลากไฟล์ zip มาวางที่นี่ · อ่านในเครื่องนี้ ไม่ส่งเนื้อแชทขึ้นเซิร์ฟเวอร์ · ข้อความที่ส่งจากเว็บจะขึ้นเป็น &quot;Unknown&quot; ใน zip และถูกตัดออก ไม่นับซ้ำ
              </p>
            </div>
            <label className="dkb-btn dkb-btn-navy cursor-pointer">
              เลือกไฟล์ zip
              <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => e.target.files?.[0] && void handleZip(e.target.files[0])} />
            </label>
          </div>
          {prog && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--dk-hair)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${prog.pct}%`, background: prog.text.startsWith("❌") ? "var(--dk-coral-deep)" : "var(--dk-mint, #16A34A)" }} />
              </div>
              <p className="mt-1.5 text-[12.5px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>{prog.text}</p>
            </div>
          )}
          {oa?.partial && <div className="mt-3"><Banner tone="warm" title="zip นี้ดาวน์โหลดก่อนจบรอบ" detail={`มีข้อความถึง ${thDate(`${oa.coverEnd.slice(0, 4)}-${oa.coverEnd.slice(4, 6)}-${oa.coverEnd.slice(6, 8)}`)} เท่านั้น — บันทึกได้ แต่ตัวเลขไม่ครบรอบ`} /></div>}
        </div>
      )}

      {/* ตารางต่อพนักงาน */}
      {data && (
        <div className="dkb-card mt-4 overflow-x-auto p-0">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--dk-faint)", background: "#F8FAFC" }}>
                <th className="px-4 py-2.5">พนักงาน</th>
                <th className="px-3 py-2.5 text-right">เว็บ ข้อความ</th>
                <th className="px-3 py-2.5 text-right">เว็บ ลูกค้า</th>
                <th className="px-3 py-2.5 text-right">OA ข้อความ</th>
                <th className="px-3 py-2.5 text-right">OA แชท</th>
                <th className="px-3 py-2.5 text-right">รวมข้อความ</th>
                <th className="px-3 py-2.5 text-right">รวมลูกค้า</th>
                <th className="px-3 py-2.5 text-right">ตอบเร็ว (กลาง)</th>
                <th className="px-3 py-2.5 text-right">สุภาพ</th>
                <th className="px-3 py-2.5 text-right">ลูกค้าทวง</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const oaRep = r.oa.reduce((a, s) => a + s.replies, 0);
                const oaChats = r.oa.reduce((a, s) => a + s.chats, 0);
                const all = [...(r.web ? [r.web] : []), ...r.oa];
                const wsum = all.reduce((a, s) => a + s.replies, 0);
                const polite = wsum ? Math.round(all.reduce((a, s) => a + s.polite * s.replies, 0) / wsum) : 0;
                const med = all.filter((s) => s.respMedian !== null);
                const medAvg = med.length ? Math.round((med.reduce((a, s) => a + (s.respMedian ?? 0), 0) / med.length) * 10) / 10 : null;
                return (
                  <tr key={r.name} className="border-t" style={{ borderColor: "var(--dk-hair)" }}>
                    <td className="px-4 py-2.5 font-bold" style={{ color: "var(--dk-navy)" }}>
                      {r.name}
                      {!r.known && <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--dk-yolk-wash, #FFF4D6)", color: "var(--dk-yolk-ink, #8A5A00)" }}>ยังไม่จับคู่</span>}
                      {r.oa.length > 1 && <span className="ml-2 text-[11.5px] font-normal" style={{ color: "var(--dk-faint)" }}>({r.oa.map((s) => s.name).join(" + ")})</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.web ? fmtInt(r.web.replies) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.web ? fmtInt(r.web.chats) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.oa.length ? fmtInt(oaRep) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.oa.length ? fmtInt(oaChats) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-extrabold tabular-nums" style={{ color: "var(--dk-navy)" }}>{fmtInt(r.total)}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{fmtInt(r.customers)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtMin(medAvg)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{wsum ? `${polite}%` : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(all.reduce((a, s) => a + s.nudges, 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && !loading && <div className="p-6"><Empty title="ยังไม่มีการตอบในรอบนี้" body="ฝั่งเว็บจะขึ้นเองเมื่อพนักงานตอบจากหน้า แชท LINE / ตอบลูกค้า · ฝั่ง OA Manager ต้องอัปโหลด zip" /></div>}
        </div>
      )}

      {/* จับคู่ชื่อใน OA */}
      {data && unknownOa.length > 0 && can("settings.manage") && (
        <div className="dkb-card mt-4 p-4">
          <p className="text-[15px] font-extrabold" style={{ color: "var(--dk-navy)" }}>🔗 ชื่อผู้ตอบใน OA Manager ที่ระบบเดาไม่ออก</p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>เลือกว่าเป็นพนักงานคนไหน (จำไว้ใช้ทุกรอบ · ใช้ร่วมกับหน้าค่าคอมเดิม) หรือเลือก &quot;ไม่ใช่พนักงาน&quot; สำหรับบอท/บัญชีระบบ</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {unknownOa.map((s) => (
              <div key={s.name} className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--dk-hair)" }}>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold" title={s.name}>
                  {s.name} <span className="font-normal" style={{ color: "var(--dk-faint)" }}>· {fmtInt(s.replies)} ข้อความ</span>
                </span>
                <select defaultValue="" onChange={(e) => void setAlias(s.name, e.target.value === "__none" ? "" : e.target.value || null)} className="h-9 max-w-[180px] rounded-lg border bg-white px-2 text-[13px]" style={{ borderColor: "var(--dk-hair)" }}>
                  <option value="">— เลือก —</option>
                  {data.staff.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                  <option value="__none">ไม่ใช่พนักงาน</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ชื่อที่จับคู่ไว้แล้ว */}
      {data && Object.keys(data.alias).length > 0 && (
        <details className="mt-4 px-1 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
          <summary className="cursor-pointer font-semibold">การจับคู่ชื่อที่จำไว้ ({Object.keys(data.alias).length})</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(data.alias).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1" style={{ borderColor: "var(--dk-hair)" }}>
                {k} → <b style={{ color: "var(--dk-navy)" }}>{v || "ไม่ใช่พนักงาน"}</b>
                {can("settings.manage") && (
                  <button type="button" onClick={() => void setAlias(k, null)} aria-label={`ลบการจับคู่ ${k}`} className="ml-1 rounded-full px-1 hover:bg-black/[0.06]">✕</button>
                )}
              </span>
            ))}
          </div>
        </details>
      )}
      {toastNode}
    </PageShell>
  );
}
