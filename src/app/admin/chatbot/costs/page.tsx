"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Banner, Btn, Empty, HeroStat, PageHead, PageShell, Stat, Stats, Tag } from "@/components/admin/ui";
import { useCan } from "@/lib/perm-context";
import {
  AI_FEATURES,
  featureLabel,
  fmtThb,
  isLegacyModel,
  fmtTok,
  modelLabel,
  priceOf,
  type AiCostSettings,
  type AiDashboard,
  type AiEvent,
  type Bucket,
  type DayAgg,
} from "@/lib/ai-cost";
import { botApi, ChatbotTabs, Modal, useToast } from "../bot-ui";

/**
 * 💸 แดชบอร์ดค่าใช้จ่าย AI แบบสด — /admin/chatbot/costs (เจ้าของร้านขอ 8 ต.ค. 69)
 *
 * คำถามเดียวที่หน้านี้ต้องตอบใน 3 วิ: "วันนี้บอทกินเงินเท่าไหร่ ผิดปกติไหม" → แถวตัวเลขบนสุดมีตัวเทียบทุกตัว
 * (เมื่อวาน · เฉลี่ย 7 วัน · งบเดือน) · ด้านล่างค่อยลงรายละเอียดว่า "งานไหน/โมเดลไหน" กิน แล้วแถวคำขอสดไว้ดูว่ายังเดินอยู่
 *
 * สด = ยิง /api/admin/chatbot/costs ทุก 10 วิ (เฉพาะตอนแท็บมองเห็น · กด ⏸ หยุดได้) — ไม่ใช่ WebSocket เพราะอยู่บน Netlify
 * ค่าใช้จ่ายเป็น USD จาก usageMetadata ของ Gemini (คิดตอนบันทึก) → แปลงบาทด้วยอัตราในตั้งค่า ⚙ · ค่าบริการรายเดือนอื่นใส่เพิ่มได้
 */

const POLL_MS = 10_000;
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

type LineQuota = { limit: number | null; used: number; left: number | null };
type ModelCfg = { feature: string; model: string; legacy: boolean; priceIn: number; priceOut: number; override: boolean; external?: boolean };
type Data = AiDashboard & { line: LineQuota | null; models: ModelCfg[] };
type Range = "today" | "7d" | "month";

export default function CostsPage() {
  return (
    <RequirePerm perm="reports.view">
      <Costs />
    </RequirePerm>
  );
}

/* ── คำนวณ (ฟังก์ชันล้วน) ─────────────────────────────── */

const zero = (): Bucket => ({ calls: 0, fail: 0, costUsd: 0, inTok: 0, outTok: 0, thinkTok: 0, ms: 0 });
function add(a: Bucket, b: Bucket): Bucket {
  return { calls: a.calls + b.calls, fail: a.fail + b.fail, costUsd: a.costUsd + b.costUsd, inTok: a.inTok + b.inTok, outTok: a.outTok + b.outTok, thinkTok: a.thinkTok + b.thinkTok, ms: a.ms + b.ms };
}
/** รวมหลายวันเป็นก้อนเดียว แยกตามงาน/โมเดล */
function sumDays(days: DayAgg[]): { total: Bucket; byFeature: Record<string, Bucket>; byModel: Record<string, Bucket & { name: string }> } {
  let total = zero();
  const byFeature: Record<string, Bucket> = {};
  const byModel: Record<string, Bucket & { name: string }> = {};
  for (const d of days) {
    total = add(total, d);
    for (const [k, v] of Object.entries(d.byFeature)) byFeature[k] = add(byFeature[k] ?? zero(), v);
    for (const [k, v] of Object.entries(d.byModel)) byModel[k] = { name: v.name, ...add(byModel[k] ?? zero(), v) };
  }
  return { total, byFeature, byModel };
}

/** "8 ต.ค." จาก YYYY-MM-DD */
function dayLabel(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${TH_MONTHS[m - 1]}`;
}
function timeTh(iso: string, withSec = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", ...(withSec ? { second: "2-digit" } : {}) });
}
function bkkHourNow(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false }).format(new Date())) % 24;
}
/** ▲ 12% / ▼ 8% เทียบเมื่อวาน — ค่าใช้จ่ายขึ้นคือเรื่องต้องมอง (คอรัล) ลงคือดี (มินต์) */
function delta(cur: number, prev: number): { text: string; tone: "coral" | "mint" | "quiet" } {
  if (prev <= 0 && cur <= 0) return { text: "เท่าเมื่อวาน", tone: "quiet" };
  if (prev <= 0) return { text: "เมื่อวานไม่มี", tone: "quiet" };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (Math.abs(pct) < 3) return { text: "≈ เมื่อวาน", tone: "quiet" };
  return pct > 0 ? { text: `▲ ${pct}%`, tone: "coral" } : { text: `▼ ${Math.abs(pct)}%`, tone: "mint" };
}
const avgSec = (b: Bucket) => (b.calls ? (b.ms / b.calls / 1000).toFixed(1) : "–");

/* ── หน้า ─────────────────────────────────────────────── */

function Costs() {
  const can = useCan();
  const canSettings = can("settings.manage");
  const { toast, toastNode } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [lastAt, setLastAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [range, setRange] = useState<Range>("today");
  const [pick, setPick] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await botApi<Data>("/api/admin/chatbot/costs");
      setData(d);
      setErr("");
      setLastAt(Date.now());
      // แถวคำขอที่เพิ่งเข้ามาตั้งแต่รอบก่อน → วาบสีเหลืองให้รู้ว่าบอทยังเดินอยู่ (รอบแรกไม่วาบ)
      const ids = new Set(d.feed.map((e) => e.id));
      if (seen.current) {
        const n = new Set<string>();
        for (const id of ids) if (!seen.current.has(id)) n.add(id);
        if (n.size) {
          setFresh(n);
          setTimeout(() => setFresh(new Set()), 2_800);
        }
      }
      seen.current = ids;
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => {
      if (!paused && document.visibilityState === "visible") void load();
    }, POLL_MS);
    const vis = () => {
      if (document.visibilityState === "visible" && !paused) void load();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load, paused]);
  // นาฬิกา "อัปเดต x วิที่แล้ว"
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const calc = useMemo<Calc | null>(() => {
    if (!data) return null;
    const rate = data.settings.thbPerUsd;
    const days = data.days;
    const today = days[days.length - 1];
    const yesterday = days[days.length - 2] ?? { ...today, ...zero(), hours: {} };
    const monthKey = data.today.slice(0, 7);
    const monthDays = days.filter((d) => d.dayKey.startsWith(monthKey));
    const month = sumDays(monthDays);
    const last7 = sumDays(days.slice(-8, -1)); // 7 วันก่อนหน้า ไม่รวมวันนี้
    const avg7Usd = last7.total.costUsd / 7;
    const dayOfMonth = Number(data.today.slice(8, 10));
    const daysInMonth = new Date(Number(data.today.slice(0, 4)), Number(data.today.slice(5, 7)), 0).getDate();
    const projectedUsd = dayOfMonth > 0 ? (month.total.costUsd / dayOfMonth) * daysInMonth : 0;
    const fixedThb = data.settings.fixedCosts.reduce((s, f) => s + f.thb, 0);
    const budget = data.settings.monthlyBudgetThb;
    const monthThb = month.total.costUsd * rate;
    const scope = range === "today" ? sumDays([today]) : range === "7d" ? sumDays(days.slice(-7)) : month;
    const everUsed = days.some((d) => d.calls > 0);
    return { rate, today, yesterday, month, monthThb, last7, avg7Usd, dayOfMonth, daysInMonth, projectedUsd, fixedThb, budget, scope, everUsed };
  }, [data, range]);

  const feed = useMemo(() => (data ? (pick ? data.feed.filter((e) => e.feature === pick) : data.feed) : []), [data, pick]);
  const secAgo = lastAt ? Math.max(0, Math.round((now - lastAt) / 1000)) : null;

  const live = err
    ? { ok: false, text: `ต่อเซิร์ฟเวอร์ไม่ได้ · ข้อมูลล่าสุดเมื่อ ${secAgo ?? "–"} วิที่แล้ว` }
    : paused
      ? { ok: false, text: "หยุดอัปเดตชั่วคราว" }
      : { ok: true, text: `สด · อัปเดต ${secAgo === null ? "…" : secAgo < 2 ? "เมื่อกี้" : `${secAgo} วิที่แล้ว`} · ทุก ${POLL_MS / 1000} วิ` };

  return (
    <PageShell>
      <PageHead
        group="🤖 Chatbot"
        title="ค่าใช้จ่ายบอท"
        count={calc ? `${fmtThb(calc.today.costUsd * calc.rate)} วันนี้` : undefined}
        sub="Gemini ที่บอทใช้ตอบลูกค้า/วิเคราะห์/อ่านสลิป คิดจากโทเคนจริงทุกคำขอ · สดทุก 10 วิ"
        tools={<ChatbotTabs inHead />}
        toolsTop
      />

      {/* แถบควบคุม: สถานะสด · หยุด/เดินต่อ · ตั้งค่า */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="dkb-live" data-off={paused ? "1" : undefined} data-bad={err ? "1" : undefined}>
          <i />
          {live.text}
        </span>
        <div className="flex gap-1.5">
          <Btn small onClick={() => setPaused((p) => !p)} title={paused ? "เดินต่อทุก 10 วิ" : "หยุดอัปเดตชั่วคราว"}>
            {paused ? "▶ เดินต่อ" : "⏸ หยุด"}
          </Btn>
          <Btn small onClick={() => void load()} title="ดึงข้อมูลใหม่เดี๋ยวนี้">
            ↻ รีเฟรช
          </Btn>
          <Btn small onClick={() => setSettingsOpen(true)} title="อัตราแลกเปลี่ยน · งบต่อเดือน · ค่าบริการรายเดือนอื่น">
            ⚙ ตั้งค่า
          </Btn>
        </div>
      </div>

      {err && !data && <div className="mt-4"><Banner tone="hot" title="โหลดบัญชีค่าใช้จ่ายไม่ได้" detail={`${err} — ระบบจะลองใหม่เองทุก 10 วิ`} /></div>}

      {data && !data.tracking.gemini && (
        <div className="mt-4">
          <Banner tone="warm" title="เซิร์ฟเวอร์นี้ยังไม่ได้ตั้ง GEMINI_API_KEY" detail="บอทบนเครื่องนี้ไม่ได้เรียก Gemini จึงไม่มีค่าใช้จ่ายใหม่ขึ้น · ตัวเลขที่เห็นมาจากเซิร์ฟเวอร์จริง (Netlify)" />
        </div>
      )}
      {data && !data.tracking.db && (
        <div className="mt-4">
          <Banner tone="hot" title="ยังไม่ได้ตั้ง Firebase (FIREBASE_SERVICE_ACCOUNT_B64)" detail="บัญชีค่าใช้จ่ายเก็บใน Firestore ฐานเดียวกับคลังความรู้บอท — ไม่มีคีย์ = ไม่มีการบันทึก" />
        </div>
      )}

      {!data && !err && (
        <div className="mt-4 space-y-3" aria-busy>
          <div className="dkb-skel h-[120px] rounded-[20px]" />
          <div className="dkb-skel h-[200px] rounded-[20px]" />
          <div className="dkb-skel h-[260px] rounded-[20px]" />
        </div>
      )}

      {data && calc && (
        <>
          <TopStats calc={calc} />

          {!calc.everUsed && (
            <div className="mt-4">
              <Empty
                title="ยังไม่มีคำขอ AI ที่บันทึกไว้"
                body="บัญชีเริ่มเดินตั้งแต่เวอร์ชันนี้ขึ้นระบบ — ลองถามบอทที่หน้า 🤖 ผู้ช่วยตอบแชท หรือรอลูกค้าทักหน้าเว็บ ตัวเลขจะขึ้นที่นี่ภายใน 10 วิ"
              />
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <HoursChart today={calc.today} yesterday={calc.yesterday} rate={calc.rate} />
            <DaysChart days={data.days} rate={calc.rate} />
          </div>

          <section className="dkb-g mt-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <span className="dkb-h2 text-[15px]">งานไหนกินเงิน</span>
                <span className="ml-2 text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                  กดแถวเพื่อกรอง "คำขอล่าสุด" ด้านล่าง
                </span>
              </div>
              <div className="dkb-scroll">
                {(
                  [
                    ["today", "วันนี้"],
                    ["7d", "7 วัน"],
                    ["month", "เดือนนี้"],
                  ] as [Range, string][]
                ).map(([k, l]) => (
                  <button key={k} type="button" className="dkb-tab" aria-pressed={range === k} onClick={() => setRange(k)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <FeatureTable scope={calc.scope} rate={calc.rate} pick={pick} onPick={(f) => setPick((p) => (p === f ? "" : f))} />
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <ModelBox byModel={calc.scope.byModel} rate={calc.rate} rangeLabel={range === "today" ? "วันนี้" : range === "7d" ? "7 วัน" : "เดือนนี้"} />
            <MonthBox calc={calc} settings={data.settings} />
            <LineBox q={data.line} today={data.today} />
          </div>

          <ConfiguredModels models={data.models ?? []} rate={calc.rate} scope={calc.scope} onPick={(f) => setPick((p) => (p === f ? "" : f))} pick={pick} />

          <Feed feed={feed} rate={calc.rate} pick={pick} onClear={() => setPick("")} fresh={fresh} />
        </>
      )}

      {settingsOpen && data && (
        <SettingsModal
          initial={data.settings}
          canSave={canSettings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setData((d) => (d ? { ...d, settings: s } : d));
            setSettingsOpen(false);
            toast("บันทึกตั้งค่าแล้ว");
          }}
          onError={(m) => toast(m, true)}
        />
      )}
      {toastNode}
    </PageShell>
  );
}

type Sum = ReturnType<typeof sumDays>;
/** ผลคำนวณกลางของหน้า (useMemo ด้านบน) — ส่งต่อให้กล่องย่อย */
type Calc = {
  rate: number;
  today: DayAgg;
  yesterday: DayAgg;
  month: Sum;
  monthThb: number;
  last7: Sum;
  avg7Usd: number;
  dayOfMonth: number;
  daysInMonth: number;
  projectedUsd: number;
  fixedThb: number;
  budget: number;
  scope: Sum;
  everUsed: boolean;
};

/* ── แถวตัวเลขบนสุด — ทุกตัวมีตัวเทียบ ─────────────────── */

function TopStats({ calc }: { calc: Calc }) {
  const { rate, today, yesterday, monthThb, avg7Usd, budget, dayOfMonth, daysInMonth, projectedUsd } = calc;
  const todayThb = today.costUsd * rate;
  const yThb = yesterday.costUsd * rate;
  const d = delta(today.costUsd, yesterday.costUsd);
  const monthPct = daysInMonth ? Math.round((dayOfMonth / daysInMonth) * 100) : 0;
  const budgetPct = budget > 0 ? Math.round((monthThb / budget) * 100) : 0;
  const failPct = today.calls ? Math.round((today.fail / today.calls) * 100) : 0;
  const n8nCalls = Object.entries(today.byFeature)
    .filter(([k]) => k.startsWith("n8n_"))
    .reduce((s, [, b]) => s + b.calls, 0);
  return (
    <Stats>
      <HeroStat
        n={fmtThb(monthThb)}
        label="Gemini เดือนนี้"
        detail={
          budget > 0
            ? `ใช้ไป ${budgetPct}% ของงบ ${fmtThb(budget)} · ผ่านมา ${monthPct}% ของเดือน`
            : `คาดทั้งเดือน ≈ ${fmtThb(projectedUsd * rate)} · ตั้งงบได้ที่ ⚙`
        }
        pct={budget > 0 ? budgetPct : monthPct}
      />
      <Stat label="วันนี้" value={fmtThb(todayThb)} hint={`เมื่อวาน ${fmtThb(yThb)} ${d.text} · เฉลี่ย 7 วัน ${fmtThb(avg7Usd * rate)}`} tone={d.tone === "coral" && todayThb > avg7Usd * rate * 1.5 ? "due" : undefined} />
      <Stat
        label="คำขอวันนี้"
        value={today.calls.toLocaleString("th-TH")}
        hint={`เมื่อวาน ${yesterday.calls.toLocaleString("th-TH")} · เฉลี่ย ${avgSec(today)} วิ/คำขอ · n8n ${n8nCalls} ครั้ง`}
      />
      <Stat
        label="ล้มเหลววันนี้"
        value={today.fail.toLocaleString("th-TH")}
        hint={today.fail ? `${failPct}% ของคำขอ · เมื่อวาน ${yesterday.fail}` : `เมื่อวาน ${yesterday.fail} · ปกติดี`}
        tone={today.fail > 0 && failPct >= 5 ? "due" : undefined}
        wide
      />
    </Stats>
  );
}

/* ── กราฟรายชั่วโมง วันนี้ทับเมื่อวาน ─────────────────── */

function HoursChart({ today, yesterday, rate }: { today: DayAgg; yesterday: DayAgg; rate: number }) {
  const hourNow = bkkHourNow();
  const hh = (h: number) => String(h).padStart(2, "0");
  // ถ้าวันนี้+เมื่อวานยังไม่มีค่าใช้จ่าย (เช่นมีแต่ n8n) ให้วาดจำนวนครั้งแทน ไม่งั้นกราฟว่างทั้งที่บอทเดินอยู่
  const useCost = today.costUsd > 0 || yesterday.costUsd > 0;
  const v = (d: DayAgg, h: number) => (useCost ? (d.hours[hh(h)]?.costUsd ?? 0) : (d.hours[hh(h)]?.calls ?? 0));
  const max = Math.max(1e-9, ...Array.from({ length: 24 }, (_, h) => Math.max(v(today, h), v(yesterday, h))));
  const fmt = (x: number) => (useCost ? fmtThb(x * rate) : `${x} ครั้ง`);
  const upToNowY = Array.from({ length: hourNow + 1 }, (_, h) => v(yesterday, h)).reduce((a, b) => a + b, 0);
  const upToNowT = Array.from({ length: hourNow + 1 }, (_, h) => v(today, h)).reduce((a, b) => a + b, 0);
  return (
    <section className="dkb-g p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <span className="dkb-h2 text-[15px]">รายชั่วโมงวันนี้</span>
        <span className="text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
          ถึง {hh(hourNow)}:59 · วันนี้ {fmt(upToNowT)} · เมื่อวานเวลาเดียวกัน {fmt(upToNowY)}
        </span>
      </div>
      <div className="dkb-hours mt-4" role="img" aria-label="กราฟแท่งค่าใช้จ่ายรายชั่วโมง วันนี้เทียบเมื่อวาน">
        {Array.from({ length: 24 }, (_, h) => {
          const t = v(today, h);
          const y = v(yesterday, h);
          const fail = (today.hours[hh(h)]?.fail ?? 0) > 0 && (today.hours[hh(h)]?.calls ?? 0) > 0 && (today.hours[hh(h)]!.fail / today.hours[hh(h)]!.calls) >= 0.3;
          return (
            <span key={h} data-now={h === hourNow ? "1" : undefined} data-fail={fail ? "1" : undefined} title={`${hh(h)}:00 · วันนี้ ${fmt(t)} (${today.hours[hh(h)]?.calls ?? 0} ครั้ง) · เมื่อวาน ${fmt(y)}`}>
              <i className="y" style={{ height: `${(y / max) * 100}%` }} />
              {h <= hourNow && <i className="t" style={{ height: `${(t / max) * 100}%` }} />}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
        {[0, 6, 12, 18, 23].map((h) => (
          <span key={h}>{hh(h)}:00</span>
        ))}
      </div>
      <p className="mt-2 px-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
        แท่งเหลือง = วันนี้ · เทาจาง = เมื่อวาน · น้ำเงิน = ชั่วโมงนี้ · คอรัล = ล้มเหลวเกิน 30% ของชั่วโมงนั้น{useCost ? "" : " · ยังไม่มีค่าใช้จ่าย จึงวาดเป็นจำนวนครั้ง"}
      </p>
    </section>
  );
}

/* ── กราฟรายวัน 31 วัน ─────────────────────────────────── */

function DaysChart({ days, rate }: { days: DayAgg[]; rate: number }) {
  const max = Math.max(1e-9, ...days.map((d) => d.costUsd));
  const used = days.filter((d) => d.calls > 0);
  const avg = used.length ? used.reduce((s, d) => s + d.costUsd, 0) / used.length : 0;
  const best = days.reduce((a, b) => (b.costUsd > a.costUsd ? b : a), days[0]);
  const step = Math.max(1, Math.ceil(days.length / 6));
  return (
    <section className="dkb-g p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <span className="dkb-h2 text-[15px]">รายวัน {days.length} วันล่าสุด</span>
        <span className="text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
          เฉลี่ย {fmtThb(avg * rate)}/วัน (เฉพาะวันที่ใช้)
        </span>
      </div>
      <div className="relative mt-3">
        {avg > 0 && <span aria-hidden className="pointer-events-none absolute left-0 right-0 border-t border-dashed" style={{ bottom: `${(avg / max) * 100}%`, borderColor: "var(--dk-quiet)" }} />}
        <div className="dkb-spark" style={{ height: 110 }}>
          {days.map((d, i) => (
            <i
              key={d.dayKey}
              data-today={i === days.length - 1 ? "1" : undefined}
              title={`${dayLabel(d.dayKey)} · ${fmtThb(d.costUsd * rate)} · ${d.calls} ครั้ง${d.fail ? ` · ล้ม ${d.fail}` : ""}`}
              style={{ height: d.costUsd > 0 ? `${Math.max(4, Math.round((d.costUsd / max) * 100))}%` : 2 }}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
        {days.filter((_, i) => i % step === 0 || i === days.length - 1).map((d) => <span key={d.dayKey}>{dayLabel(d.dayKey)}</span>)}
      </div>
      {best && best.costUsd > 0 && (
        <p className="mt-2 px-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
          สูงสุด {fmtThb(best.costUsd * rate)} ({dayLabel(best.dayKey)} · {best.calls} ครั้ง) · เส้นประ = ค่าเฉลี่ย
        </p>
      )}
    </section>
  );
}

/* ── ตารางแยกตามงาน — ทุกแถวกดกรองคำขอได้ ─────────────── */

function FeatureTable({ scope, rate, pick, onPick }: { scope: ReturnType<typeof sumDays>; rate: number; pick: string; onPick: (f: string) => void }) {
  const rows = Object.entries(scope.byFeature)
    .map(([k, b]) => ({ key: k, ...b }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
  if (!rows.length) return <p className="mt-3 px-1 text-[13px]" style={{ color: "var(--dk-faint)" }}>ยังไม่มีคำขอในช่วงนี้</p>;
  const maxUsd = Math.max(1e-9, ...rows.map((r) => r.costUsd));
  const totalUsd = rows.reduce((s, r) => s + r.costUsd, 0);
  const groupTone = (g: string): "yolk" | "mint" | "lilac" | "sky" => (g === "แชทลูกค้า" ? "yolk" : g === "เครื่องคิดราคา" ? "mint" : g === "n8n" ? "sky" : "lilac");
  return (
    <div className="mt-3">
      <div className="hidden px-[10px] text-[11.5px] sm:grid" style={{ gridTemplateColumns: "minmax(0,1.7fr) .55fr .95fr .55fr .8fr", color: "var(--dk-faint)" }}>
        <span>งาน</span>
        <span className="text-right">ครั้ง</span>
        <span className="text-right">โทเคน เข้า → ออก</span>
        <span className="text-right">เฉลี่ย วิ</span>
        <span className="text-right">ค่าใช้จ่าย</span>
      </div>
      {rows.map((r) => {
        const meta = (AI_FEATURES as Record<string, { label: string; group: string }>)[r.key];
        const share = totalUsd > 0 ? Math.round((r.costUsd / totalUsd) * 100) : 0;
        const failPct = r.calls ? Math.round((r.fail / r.calls) * 100) : 0;
        const isN8n = r.key.startsWith("n8n_");
        return (
          <button key={r.key} type="button" className="dkb-costrow" aria-pressed={pick === r.key} onClick={() => onPick(r.key)}>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="dkb-h2 text-[14px]">{featureLabel(r.key)}</span>
                {meta && <Tag tone={groupTone(meta.group)}>{meta.group}</Tag>}
                {r.fail > 0 && <Tag tone={failPct >= 5 ? "coral" : "quiet"}>ล้ม {r.fail}</Tag>}
              </span>
              {/* จอแคบ: ตัวเลขทั้งหมดอยู่บรรทัดเดียวใต้ชื่อ (จอกว้างแยกคอลัมน์) */}
              <span className="dkb-num-sm mt-0.5 block text-[12.5px] sm:hidden" style={{ color: "var(--dk-navy-soft)" }}>
                {r.calls.toLocaleString("th-TH")} ครั้ง · {fmtTok(r.inTok)} → {fmtTok(r.outTok + r.thinkTok)} โทเคน · {avgSec(r)} วิ ·{" "}
                <span className="dkb-num text-[14px]" style={{ color: "var(--dk-navy)" }}>
                  {isN8n ? "—" : fmtThb(r.costUsd * rate)}
                </span>
                {share > 0 && ` (${share}%)`}
              </span>
              <span className="dkb-share mt-1.5 block" data-tone={isN8n ? "navy" : undefined}>
                <i style={{ width: `${isN8n ? 0 : (r.costUsd / maxUsd) * 100}%` }} />
              </span>
            </span>
            <span className="dkb-num-sm hidden text-right text-[13px] sm:block" style={{ color: "var(--dk-navy-soft)" }}>
              {r.calls.toLocaleString("th-TH")}
            </span>
            <span className="dkb-num-sm hidden text-right text-[13px] sm:block" style={{ color: "var(--dk-navy-soft)" }} title={r.thinkTok ? `รวมโทเคนคิด ${fmtTok(r.thinkTok)}` : undefined}>
              {fmtTok(r.inTok)} → {fmtTok(r.outTok + r.thinkTok)}
            </span>
            <span className="dkb-num-sm hidden text-right text-[13px] sm:block" style={{ color: "var(--dk-navy-soft)" }}>
              {avgSec(r)}
            </span>
            <span className="hidden text-right sm:block">
              <span className="dkb-num text-[15px]">{isN8n ? "—" : fmtThb(r.costUsd * rate)}</span>
              {share > 0 && (
                <span className="block text-[11px]" style={{ color: "var(--dk-faint)" }}>
                  {share}%
                </span>
              )}
            </span>
          </button>
        );
      })}
      <p className="mt-2 px-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
        n8n = ส่งคำถามให้สมองเดิมของบอทตอบ ไม่มีโทเคนในบัญชีนี้ (เครื่อง n8n/โมเดลข้างในจ่ายแยก) นับไว้ดูว่าคำถามหลุดออกไปข้างนอกกี่ครั้ง
      </p>
    </div>
  );
}

/* ── กล่องเล็ก 3 ใบ: โมเดล · รวมเดือนนี้ · โควตา LINE ──── */

function ModelBox({ byModel, rate, rangeLabel }: { byModel: Record<string, Bucket & { name: string }>; rate: number; rangeLabel: string }) {
  const rows = Object.values(byModel)
    .filter((m) => m.name !== "n8n")
    .sort((a, b) => b.costUsd - a.costUsd);
  return (
    <section className="dkb-g p-4">
      <span className="dkb-h2 text-[15px]">โมเดลที่ใช้ · {rangeLabel}</span>
      {!rows.length && <p className="mt-2 text-[13px]" style={{ color: "var(--dk-faint)" }}>ยังไม่มี</p>}
      <div className="mt-2 space-y-2">
        {rows.map((m) => {
          const p = priceOf(m.name);
          return (
            <div key={m.name} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold">
                  {modelLabel(m.name)}
                  {isLegacyModel(m.name) && <Tag tone="quiet" title="Google ขึ้นป้ายรุ่นเก่า (legacy) แล้ว ยังใช้ได้ ราคาเท่าเดิม">รุ่นเก่า</Tag>}
                </span>
                <span className="block text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                  {m.calls.toLocaleString("th-TH")} ครั้ง · {fmtTok(m.inTok)} → {fmtTok(m.outTok + m.thinkTok)} · ${p.in}/${p.out} ต่อ 1M
                </span>
              </span>
              <span className="dkb-num shrink-0 text-[15px]">{fmtThb(m.costUsd * rate)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MonthBox({ calc, settings }: { calc: Calc; settings: AiCostSettings }) {
  const gemini = calc.monthThb;
  const total = gemini + calc.fixedThb;
  return (
    <section className="dkb-g p-4">
      <span className="dkb-h2 text-[15px]">รวมเดือนนี้</span>
      <div className="mt-2 space-y-1.5 text-[13.5px]">
        <div className="flex justify-between gap-3">
          <span>Gemini (ถึงวันนี้)</span>
          <span className="dkb-num-sm">{fmtThb(gemini)}</span>
        </div>
        {settings.fixedCosts.map((f) => (
          <div key={f.name} className="flex justify-between gap-3" style={{ color: "var(--dk-navy-soft)" }}>
            <span className="truncate">{f.name}</span>
            <span className="dkb-num-sm shrink-0">{fmtThb(f.thb)}</span>
          </div>
        ))}
        {!settings.fixedCosts.length && (
          <p className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
            ใส่ค่าบริการรายเดือน (n8n · LINE OA · Pinecone) ได้ที่ ⚙ ตั้งค่า
          </p>
        )}
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-2" style={{ borderColor: "var(--dk-hair)" }}>
          <span className="font-semibold">รวม</span>
          <span className="dkb-num text-[1.3rem]">{fmtThb(total)}</span>
        </div>
        <p className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
          คาด Gemini ทั้งเดือน ≈ {fmtThb(calc.projectedUsd * calc.rate)} (จาก {calc.dayOfMonth}/{calc.daysInMonth} วัน) · อัตรา ฿{calc.rate}/$
        </p>
      </div>
    </section>
  );
}

function LineBox({ q, today }: { q: LineQuota | null; today: string }) {
  const m = Number(today.slice(5, 7));
  const reset = `1 ${TH_MONTHS[m % 12]}`;
  const pct = q && q.limit ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
  const hot = pct >= 90;
  return (
    <section className="dkb-g p-4" style={hot ? { background: "var(--dk-coral-wash)" } : undefined}>
      <span className="dkb-h2 text-[15px]">โควตาข้อความ LINE OA</span>
      {!q ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--dk-faint)" }}>
          ถาม LINE ไม่ได้ (ไม่มี token หรือ LINE ไม่ตอบ)
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="dkb-num text-[1.3rem]" style={hot ? { color: "var(--dk-coral-ink)" } : undefined}>
              {q.used.toLocaleString("th-TH")}
            </span>
            <span className="text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
              {q.limit === null ? "ไม่จำกัด" : `จาก ${q.limit.toLocaleString("th-TH")} ข้อความ`}
            </span>
          </div>
          {q.limit !== null && (
            <span className="dkb-share mt-2 block" data-tone={hot ? "coral" : "navy"}>
              <i style={{ width: `${pct}%` }} />
            </span>
          )}
          <p className="mt-2 text-[12px]" style={{ color: hot ? "var(--dk-coral-ink)" : "var(--dk-faint)" }}>
            {q.limit === null ? "แพ็กเกจไม่จำกัดข้อความ" : `${pct}% · เหลือ ${(q.left ?? 0).toLocaleString("th-TH")} · รีเซ็ต ${reset}`}
            {hot && " — ใกล้หมด ข้อความถึงลูกค้าจะส่งไม่ออก"}
          </p>
        </>
      )}
    </section>
  );
}

/* ── โมเดลที่แต่ละงานตั้งไว้ตอนนี้ (อ่านจาก lib/ai-models.ts ไม่ต้องรอมีคำขอ) ── */

function ConfiguredModels({ models, rate, scope, pick, onPick }: { models: ModelCfg[]; rate: number; scope: Sum; pick: string; onPick: (f: string) => void }) {
  const legacyCount = models.filter((m) => m.legacy).length;
  const byModel = new Map<string, ModelCfg[]>();
  for (const m of models) byModel.set(m.model, [...(byModel.get(m.model) ?? []), m]);
  return (
    <section className="dkb-g mt-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <span className="dkb-h2 text-[15px]">โมเดลที่ตั้งไว้ตอนนี้</span>
        <span className="text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
          {models.length} งาน · {byModel.size} รุ่น{legacyCount ? ` · ${legacyCount} งานยังใช้รุ่นเก่า` : " · ทุกงานเป็นรุ่นปัจจุบัน"}
        </span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {[...byModel.entries()].map(([model, fs]) => {
          const p = fs[0];
          const used = fs.reduce((s, f) => s + (scope.byFeature[f.feature]?.costUsd ?? 0), 0);
          return (
            <div key={model} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,.55)", boxShadow: "inset 0 0 0 1px var(--dk-hair)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="dkb-h2 text-[14.5px]">{modelLabel(model)}</span>
                  {p.legacy ? (
                    <Tag tone="yolk" title="Google ขึ้นป้ายรุ่นเก่า (legacy) แล้ว — ยังใช้ได้ ราคาเท่าเดิม แต่ควรวางแผนย้ายรุ่น">รุ่นเก่า (legacy)</Tag>
                  ) : (
                    <Tag tone="mint">รุ่นปัจจุบัน</Tag>
                  )}
                  {p.external && (
                    <Tag tone="sky" title="ตั้งโมเดลไว้ใน n8n — เว็บแค่ส่งต่อคำถาม ไม่เห็นโทเคน ค่าใช้จ่ายจริงดูที่ console ของผู้ให้บริการ">ตั้งใน n8n</Tag>
                  )}
                </span>
                <span className="dkb-num-sm text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                  ${p.priceIn} เข้า / ${p.priceOut} ออก ต่อ 1M · {p.external ? "จ่ายแยกนอกบัญชีนี้" : fmtThb(used * rate)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {fs.map((f) => (
                  <button key={f.feature} type="button" className="dkb-fchip" aria-pressed={pick === f.feature} onClick={() => onPick(f.feature)} title={f.override ? "ทับด้วย env UNDERSTAND_MODEL" : undefined}>
                    <i />
                    {featureLabel(f.feature)}
                    {f.override && " ⚙"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
        ตั้งค่าอยู่ที่ไฟล์ lib/ai-models.ts ที่เดียวทั้งระบบ (โมเดลใน n8n ต้องแก้ใน n8n ด้วย) · ราคาตามหน้า pricing ของ Google / Anthropic (ตรวจ 8 ต.ค. 69) · กดชื่องานเพื่อกรองคำขอล่าสุด
      </p>
    </section>
  );
}

/* ── คำขอล่าสุด (สด) ───────────────────────────────────── */

function Feed({ feed, rate, pick, onClear, fresh }: { feed: AiEvent[]; rate: number; pick: string; onClear: () => void; fresh: Set<string> }) {
  return (
    <section className="dkb-g mt-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="dkb-h2 text-[15px]">
          คำขอล่าสุด
          {pick && (
            <>
              {" · "}
              <span style={{ color: "var(--dk-blue-deep)" }}>{featureLabel(pick)}</span>
            </>
          )}
        </span>
        <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--dk-faint)" }}>
          <span>แถวใหม่วาบสีเหลือง · {feed.length} รายการ</span>
          {pick && (
            <Btn small onClick={onClear}>
              ✕ เลิกกรอง
            </Btn>
          )}
        </div>
      </div>
      {!feed.length ? (
        <p className="mt-3 px-1 text-[13px]" style={{ color: "var(--dk-faint)" }}>
          {pick ? "ยังไม่มีคำขอของงานนี้ใน 40 รายการล่าสุด" : "ยังไม่มีคำขอ"}
        </p>
      ) : (
        <div className="mt-2">
          {feed.map((e) => (
            <div key={e.id} className={`dkb-feed${fresh.has(e.id) ? " dkb-new" : ""}`} data-fail={e.ok ? undefined : "1"}>
              <span className="dkb-num-sm text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                {timeTh(e.at)}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-1.5 text-[13.5px]">
                  <span className="font-semibold">{featureLabel(e.feature)}</span>
                  <span style={{ color: "var(--dk-faint)" }}>· {modelLabel(e.model)}</span>
                  {!e.ok && <Tag tone="coral">{e.status ? `HTTP ${e.status}` : "ต่อไม่ได้"}</Tag>}
                </span>
                <span className="block truncate text-[11.5px]" style={{ color: e.ok ? "var(--dk-faint)" : "var(--dk-coral-ink)" }}>
                  {e.ok || !e.error
                    ? e.model === "n8n"
                      ? `${(e.ms / 1000).toFixed(1)} วิ`
                      : `${fmtTok(e.inTok)} → ${fmtTok(e.outTok + e.thinkTok)} โทเคน${e.thinkTok ? ` (คิด ${fmtTok(e.thinkTok)})` : ""} · ${(e.ms / 1000).toFixed(1)} วิ`
                    : e.error}
                </span>
              </span>
              <span className="dkb-num text-right text-[14px]">{e.model === "n8n" ? "—" : fmtThb(e.costUsd * rate)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── ตั้งค่า ──────────────────────────────────────────── */

function SettingsModal({
  initial,
  canSave,
  onClose,
  onSaved,
  onError,
}: {
  initial: AiCostSettings;
  canSave: boolean;
  onClose: () => void;
  onSaved: (s: AiCostSettings) => void;
  onError: (m: string) => void;
}) {
  const [rate, setRate] = useState(String(initial.thbPerUsd));
  const [budget, setBudget] = useState(initial.monthlyBudgetThb ? String(initial.monthlyBudgetThb) : "");
  const [fixed, setFixed] = useState<{ name: string; thb: string }[]>(initial.fixedCosts.map((f) => ({ name: f.name, thb: String(f.thb) })));
  const [busy, setBusy] = useState(false);
  const inp = "dkb-inp w-full rounded-xl border px-3 py-2 text-[14px]";
  const save = async () => {
    setBusy(true);
    try {
      const r = await botApi<{ settings: AiCostSettings }>("/api/admin/chatbot/costs", {
        thbPerUsd: Number(rate),
        monthlyBudgetThb: Number(budget || 0),
        fixedCosts: fixed.map((f) => ({ name: f.name.trim(), thb: Number(f.thb || 0) })).filter((f) => f.name),
      });
      onSaved(r.settings);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="ตั้งค่าแดชบอร์ดค่าใช้จ่าย"
      sub="อัตราแลกเปลี่ยนใช้แปลงยอด USD ของ Gemini เป็นบาท · งบไว้เทียบในวงแหวน · ค่าบริการรายเดือนอื่นรวมในกล่อง “รวมเดือนนี้”"
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>ยกเลิก</Btn>
          <Btn tone="yolk" onClick={() => void save()} disabled={busy || !canSave} title={canSave ? undefined : "ต้องมีสิทธิ์ตั้งค่าระบบ"}>
            {busy ? "กำลังบันทึก…" : "บันทึกตั้งค่า"}
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[13px]">
          <span className="mb-1 block font-semibold">บาทต่อ 1 ดอลลาร์</span>
          <input className={inp} style={{ borderColor: "var(--dk-hair)" }} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="33" />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block font-semibold">งบ Gemini ต่อเดือน (บาท) · ว่าง = ไม่ตั้ง</span>
          <input className={inp} style={{ borderColor: "var(--dk-hair)" }} inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="เช่น 1500" />
        </label>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">ค่าบริการรายเดือนอื่นของบอท</span>
          <Btn small onClick={() => setFixed((f) => [...f, { name: "", thb: "" }])}>
            ＋ เพิ่มรายการ
          </Btn>
        </div>
        {!fixed.length && (
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
            เช่น n8n Cloud · LINE OA แพ็กเกจ · Pinecone — ใส่เป็นบาทต่อเดือน
          </p>
        )}
        <div className="mt-2 space-y-2">
          {fixed.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_40px] gap-2">
              <input className={inp} style={{ borderColor: "var(--dk-hair)" }} value={f.name} onChange={(e) => setFixed((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="ชื่อบริการ" />
              <input className={inp} style={{ borderColor: "var(--dk-hair)" }} inputMode="numeric" value={f.thb} onChange={(e) => setFixed((a) => a.map((x, j) => (j === i ? { ...x, thb: e.target.value } : x)))} placeholder="บาท/เดือน" />
              <button type="button" aria-label="ลบรายการ" className="grid h-[42px] w-10 place-items-center rounded-xl hover:bg-[var(--dk-coral-wash)]" style={{ color: "var(--dk-coral-ink)" }} onClick={() => setFixed((a) => a.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
      {!canSave && (
        <p className="mt-3 text-[12.5px]" style={{ color: "var(--dk-coral-ink)" }}>
          บัญชีนี้ดูได้แต่แก้ไม่ได้ — ต้องมีสิทธิ์ตั้งค่าระบบ
        </p>
      )}
    </Modal>
  );
}
