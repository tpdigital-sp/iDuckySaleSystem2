"use client";

/**
 * 🆔 /admin/line-groups — ตั้งค่าให้ข้อความแจ้งเตือนของร้านเข้าไลน์กลุ่ม
 *
 * เจ้าของร้านสั่ง 14 ก.ย. 69: ข้อความแจ้งร้าน (ออเดอร์สั่งจำนวนมาก · ของใกล้หมด · ใบสมัครตัวแทน)
 * เข้าไลน์ส่วนตัวคนเดียว อยากให้เข้ากลุ่มพนักงาน และอยากให้ส่งจาก "บัญชีหลังบ้าน" ไม่ใช่บัญชีร้าน
 * ที่ลูกค้าทักอยู่ — ข้อความในกลุ่มจะได้ไม่ปนกับงานลูกค้า
 *
 * หน้านี้ทำ 2 เรื่อง:
 *   1. เก็บ token ของบัญชีแจ้งเตือน (เข้ารหัสไว้ในฐานข้อมูล — env เต็ม ใส่ไม่ได้แล้ว)
 *   2. โชว์เลขห้องแชทที่ /api/line/webhook ดักจับไว้ ให้กดเลือกเป็นปลายทางได้เลย
 *
 * ⚠️ LINE ไม่มี API ให้ถามว่าบัญชีอยู่ในกลุ่มไหนบ้าง รู้เลขกลุ่มได้ทางเดียวคือรับ webhook
 *    ตอนมีคนพิมพ์ในกลุ่ม (หรือตอนเชิญบัญชีเข้ากลุ่ม)
 * ⚠️ เลขห้องผูกกับบัญชี ใช้ข้ามบัญชีไม่ได้ — ต้องหยิบเลขที่ "บัญชีแจ้งเตือน" เป็นคนได้ยินเท่านั้น
 */

import RequirePerm from "@/components/RequirePerm";
import { useCallback, useEffect, useState } from "react";
import { usePolling } from "@/lib/use-polling";
import { Banner, Btn, CopyChip, Empty, ListHead, PageHead, PageShell, Row, RowMain, RowSide, Rows, Tag } from "@/components/admin/ui";
import type { LineSource } from "@/lib/server/line-sources";
import type { LineAccount, LineSourcesResponse } from "@/app/api/admin/line-sources/route";

const thTime = (iso: string) => {
  const d = new Date(iso);
  return isFinite(d.getTime())
    ? d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
};

const TYPE_LABEL: Record<LineSource["type"], string> = {
  group: "ไลน์กลุ่ม",
  room: "ห้องแชท (แบบเก่า)",
  user: "แชทเดี่ยว",
};

const WEBHOOK_URL = "https://iduckystore.com/api/line/webhook";

function LineGroupsInner() {
  const [data, setData] = useState<LineSourcesResponse | null>(null);
  const [token, setToken] = useState("");
  const [shopTo, setShopTo] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/line-sources", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as LineSourcesResponse | null;
      if (j) setData(j);
    } catch {
      setData(
        (v) =>
          v ?? {
            sources: [],
            alert: { hasToken: false, to: "", adminTo: "", shopTo: "", hasFallback: false, misses: [], ready: false },
            accounts: [],
            envTo: "",
            quota: null,
          },
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // เปิดหน้านี้ค้างไว้แล้วไปพิมพ์ในกลุ่ม — เลขต้องโผล่เองไม่ต้องรีเฟรช
  usePolling(load, { intervalMs: 10_000 });

  async function post(body: Record<string, unknown>, tag: string) {
    if (busy) return;
    setBusy(tag);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/line-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        reason?: string;
        via?: string;
        saved?: string;
      };
      if (r.ok) {
        setMsg({
          tone: "ok",
          text:
            body.action === "test"
              ? `ส่งข้อความทดสอบแล้ว (จาก${j.via === "alert" ? "บัญชีแจ้งเตือน" : "บัญชีร้าน"}) — ไปดูในกลุ่มได้เลย`
              : j.saved || "บันทึกแล้ว",
        });
        setToken("");
      } else {
        setMsg({ tone: "bad", text: j.error || j.reason || "ทำรายการไม่สำเร็จ" });
      }
      await load();
    } finally {
      setBusy("");
    }
  }

  async function clearAll() {
    if (busy || !window.confirm("ล้างรายการเลขห้องที่จดไว้ทั้งหมด?")) return;
    setBusy("clear");
    try {
      await fetch("/api/admin/line-sources", { method: "DELETE" });
      await load();
    } finally {
      setBusy("");
    }
  }

  if (!data) {
    return (
      <PageShell>
        <Empty title="กำลังโหลด…" body="ดึงการตั้งค่าและเลขห้องแชทที่ระบบจดไว้" />
      </PageShell>
    );
  }

  const { sources, alert, accounts, quota } = data;
  const alertAcc = accounts.find((a) => a.kind === "alert");
  const shopAcc = accounts.find((a) => a.kind === "shop");
  const accById = new Map(accounts.map((a) => [a.userId, a]));
  /** บัญชีที่จะใช้ส่งจริงตอนนี้ — เลขห้องต้องเป็นของบัญชีนี้เท่านั้น */
  const sender: LineAccount | undefined = alert.ready ? alertAcc : shopAcc;
  const groups = sources.filter((s) => s.type === "group");
  /** โควตาใกล้หมด = ส่งได้อีกไม่เกิน 5 ใบ · หมดจริง = ส่งไม่ได้แล้วสักใบ */
  const low = !!quota && quota.cards !== null && quota.cards <= 5;
  const dry = !!quota && quota.cards !== null && quota.cards <= 0;

  return (
    <PageShell>
      <PageHead
        group="ตั้งค่าระบบ"
        title="แจ้งเตือนเข้าไลน์กลุ่ม"
        count={groups.length ? `${groups.length} กลุ่ม` : undefined}
        sub="ตั้งว่าข้อความแจ้งร้าน (ออเดอร์สั่งจำนวนมาก · ของใกล้หมด · ใบสมัครตัวแทน) จะส่งจากบัญชีไหน เข้าห้องไหน"
      />

      {msg && (
        <div className="mt-4">
          <Banner tone={msg.tone === "ok" ? "warm" : "hot"} title={msg.tone === "ok" ? "สำเร็จ" : "ไม่สำเร็จ"} detail={msg.text} />
        </div>
      )}

      {/* ── โควตาเดือนนี้ + ของที่ส่งไม่ออก ─────────────────────────────────
          ⚠️ 24 ก.ย. 69 ไลน์เงียบทั้งวันโดยไม่มีใครรู้: การ์ด 1 ใบที่ส่งเข้ากลุ่ม
          LINE ตัดโควตา "เท่าจำนวนคนในกลุ่ม" — บัญชีฟรี 300 ข้อความ/เดือน กลุ่ม 8 คน = ~37 ใบ
          พอหมดก็ตอบ 429 เงียบ ๆ หน้านี้ต้องบอกให้เห็นก่อนถึงวันที่เงียบ */}
      {quota && (
        <div className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-bold text-slate-700">โควตาข้อความเดือนนี้</p>
            <p className="text-[12px] text-slate-500 tabular-nums">
              ใช้ไป {quota.used.toLocaleString("th-TH")}
              {quota.limit !== null && ` / ${quota.limit.toLocaleString("th-TH")}`} ข้อความ
            </p>
          </div>
          {quota.limit !== null && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((quota.used / Math.max(1, quota.limit)) * 100))}%`,
                  background: dry ? "var(--dk-coral)" : low ? "var(--dk-yolk-deep)" : "var(--dk-mint)",
                }}
              />
            </div>
          )}
          <p className="mt-2 text-[12.5px] font-semibold leading-relaxed" style={{ color: dry ? "var(--dk-coral-ink)" : "var(--dk-mint-ink)" }}>
            {dry
              ? "❌ โควตาหมดแล้ว — ตอนนี้ส่งการ์ดเข้ากลุ่มไม่ได้เลย"
              : quota.cards === null
                ? "✅ บัญชีนี้ไม่จำกัดจำนวนข้อความ"
                : `${low ? "⚠️" : "✅"} ส่งการ์ดได้อีก ${quota.cards.toLocaleString("th-TH")} ใบ`}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
            การ์ด 1 ใบที่ส่งเข้ากลุ่มตัดโควตา <b className="text-slate-700">{(quota.members ?? 1).toLocaleString("th-TH")} ข้อความ</b>{" "}
            (เท่าจำนวนคนในห้อง) ไม่ใช่ 1 ข้อความ · โควตาเริ่มนับใหม่ทุกวันที่ 1
            {dry && " — ระหว่างนี้ระบบจะถอยไปส่งจากบัญชีร้านให้ ถ้าตั้งปลายทางสำรองไว้ (ข้อ 3)"}
          </p>
        </div>
      )}

      {alert.misses.length > 0 && (
        <div className="mt-3 rounded-xl border p-4" style={{ borderColor: "var(--dk-coral)", background: "var(--dk-coral-wash)" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>
              📭 แจ้งเตือน {alert.misses.length.toLocaleString("th-TH")} รายการส่งเข้ากลุ่มไม่ได้
            </p>
            <Btn small disabled={!!busy} onClick={() => void post({ action: "clearMisses" }, "misses")}>
              {busy === "misses" ? "กำลังล้าง…" : "อ่านแล้ว ล้างทิ้ง"}
            </Btn>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
            เรื่องพวกนี้ไม่มีใครในกลุ่มได้เห็น — ไปดูของจริงที่หน้างานตามหัวเรื่อง (คำขอแก้ไข · เคลม · ออเดอร์ใหม่)
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-slate-700">
            {alert.misses.slice(0, 10).map((m) => (
              <li key={m.at} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-slate-500">{thTime(m.at)}</span>
                <b>{m.title}</b>
                <span className="text-slate-500">— {m.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── ใครเป็นคนส่ง ── */}
      <div className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4">
        <p className="text-[13px] font-bold text-slate-700">1 · บัญชี LINE ที่ใช้ส่งแจ้งเตือน</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
          ตอนนี้ส่งจาก{" "}
          <b className="text-slate-700">
            {sender ? `${sender.name || "(ไม่ทราบชื่อ)"} ${sender.basicId}` : "ยังไม่มีบัญชีที่ใช้ได้"}
          </b>
        </p>
        {/* สถานะ token แยกจากบรรทัดบน — token เข้าแล้วแต่ยังไม่เลือกห้อง ระบบยังส่งจากบัญชีร้านอยู่
            เดิมบรรทัดเดียวกันเลยดูเหมือน token ไม่เข้า ทั้งที่เข้าแล้ว */}
        {alertAcc ? (
          <p className="mt-1 text-[12.5px] font-semibold leading-relaxed" style={{ color: "var(--dk-mint-ink)" }}>
            ✅ ผูกบัญชีแจ้งเตือนไว้แล้ว: {alertAcc.name || "(ไม่ทราบชื่อ)"} {alertAcc.basicId}
            {!alert.to && " — เหลือแค่เลือกห้องปลายทางในข้อ 3 ระบบถึงจะเริ่มใช้บัญชีนี้"}
          </p>
        ) : alert.hasToken ? (
          <p className="mt-1 text-[12.5px] font-semibold leading-relaxed" style={{ color: "var(--dk-coral-ink)" }}>
            ⚠️ มี token เก็บไว้แต่ LINE ไม่รับ — กด Issue ใหม่แล้ววางอีกครั้ง
          </p>
        ) : (
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
            ยังไม่ได้ผูกบัญชีแจ้งเตือน — ตอนนี้ใช้บัญชีร้านที่ลูกค้าทักอยู่ ถ้าอยากแยกให้วาง token ด้านล่าง
          </p>
        )}

        <label className="mt-3 block text-[12px] font-bold text-slate-600" htmlFor="alert-token">
          Channel access token ของบัญชีแจ้งเตือน
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            id="alert-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={alert.hasToken ? "ตั้งไว้แล้ว — วางใหม่เฉพาะตอนจะเปลี่ยน" : "วาง long-lived channel access token"}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none"
            autoComplete="off"
          />
          <Btn tone="navy" small disabled={!token.trim() || !!busy} onClick={() => void post({ action: "save", token }, "token")}>
            {busy === "token" ? "กำลังบันทึก…" : "บันทึก token"}
          </Btn>
          {alert.hasToken && (
            <Btn
              small
              disabled={!!busy}
              onClick={() => {
                if (window.confirm("ล้าง token ของบัญชีแจ้งเตือน? ระบบจะกลับไปส่งจากบัญชีร้าน"))
                  void post({ action: "save", token: "" }, "untoken");
              }}
              title="กลับไปใช้บัญชีร้านตามเดิม"
            >
              ล้าง token
            </Btn>
          )}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
          หาได้ที่ LINE Developers → เลือก channel ของบัญชีนั้น → แท็บ Messaging API → หัวข้อ Channel access token
          (กด Issue ถ้ายังไม่มี) · เก็บแบบเข้ารหัสไว้ในฐานข้อมูล ไม่ได้เก็บเป็นข้อความธรรมดา
          {alert.savedAt && ` · แก้ล่าสุด ${thTime(alert.savedAt)}${alert.savedBy ? ` โดย ${alert.savedBy}` : ""}`}
        </p>
      </div>

      {/* ── เอาบัญชีเข้ากลุ่ม ── */}
      <div className="mt-3 rounded-xl border border-slate-200/70 bg-white p-4">
        <p className="text-[13px] font-bold text-slate-700">2 · พาบัญชีนั้นเข้ากลุ่ม แล้วพิมพ์ 1 ครั้ง</p>
        <ol className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-slate-600">
          <li>
            <b>ก.</b> LINE Developers → channel ของบัญชีแจ้งเตือน → Messaging API → Webhook URL ใส่{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11.5px]">{WEBHOOK_URL}</code> แล้วเปิด Use webhook
            <br />
            <b className="text-rose-600">
              ⚠️ ใส่เฉพาะ channel ของบัญชีแจ้งเตือนเท่านั้น ห้ามใส่ใน channel ของบัญชีร้านที่ลูกค้าทัก
            </b>{" "}
            เพราะบอทตอบแชทอยู่ที่ n8n ใส่ผิดที่แล้วบอทจะเงียบทันที
          </li>
          <li>
            <b>ข.</b> LINE Official Account Manager ของบัญชีนั้น → ตั้งค่า → การตอบกลับ → เปิด{" "}
            <b>&ldquo;อนุญาตให้เข้าร่วมกลุ่มแชท&rdquo;</b>
          </li>
          <li>
            <b>ค.</b> ในแอป LINE เชิญบัญชีนั้นเข้ากลุ่มพนักงาน แล้ว<b>พิมพ์อะไรก็ได้ในกลุ่ม 1 ครั้ง</b> — เลขกลุ่มจะโผล่ข้างล่างเอง
          </li>
        </ol>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
          ⚠️ เชิญเข้าแล้วห้ามเอาออก ถ้าบัญชีไม่ได้อยู่ในกลุ่ม จะส่งข้อความเข้ากลุ่มไม่ได้เลย
          <br />
          ระบบรับเฉพาะห้องของบัญชีที่วาง token ไว้เท่านั้น ยังไม่วาง token จะไม่มีเลขโผล่แม้พิมพ์แล้ว
        </p>
      </div>

      {/* ── ปลายทางที่ใช้อยู่ (2 กลุ่ม แยกตามเรื่อง) ── */}
      <div className="mt-3 rounded-xl border border-slate-200/70 bg-white p-4">
        <p className="text-[13px] font-bold text-slate-700">3 · ห้องปลายทาง</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
          ตั้งได้ 2 กลุ่ม แยกตามเรื่อง · ไม่ตั้งกลุ่มเรื่องเงิน = เรื่องเงินไปเข้ากลุ่มทั่วไปด้วย
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([
            {
              money: false,
              title: "กลุ่มทั่วไป",
              what: "ออเดอร์สั่งจำนวนมาก · ของใกล้หมด · ใบสมัครตัวแทน",
              value: alert.to,
            },
            {
              money: true,
              title: "กลุ่มเรื่องเงิน",
              what: "เคลม · ยอดค้างเก็บงวด 2",
              value: alert.adminTo,
            },
          ] as const).map((slot) => (
            <div key={slot.title} className="rounded-lg border border-slate-200/70 bg-slate-50/60 p-3">
              <p className="text-[12.5px] font-bold text-slate-700">{slot.title}</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">{slot.what}</p>
              {slot.value ? (
                <p className="mt-1.5 break-all font-mono text-[11.5px] text-slate-700">{slot.value}</p>
              ) : (
                <p className="mt-1.5 text-[12px] text-slate-400">
                  {slot.money ? "ยังไม่ตั้ง — ใช้กลุ่มทั่วไป" : "ยังไม่ได้เลือก"}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Btn
                  small
                  disabled={!!busy}
                  onClick={() => void post({ action: "test", money: slot.money }, `test-${slot.title}`)}
                  title="ยิงข้อความทดสอบเข้าห้องนี้"
                >
                  {busy === `test-${slot.title}` ? "กำลังส่ง…" : "🔔 ทดสอบ"}
                </Btn>
                {slot.value && (
                  <Btn
                    small
                    disabled={!!busy}
                    onClick={() =>
                      void post(slot.money ? { action: "save", adminTo: "" } : { action: "save", to: "" }, `clear-${slot.title}`)
                    }
                  >
                    ล้าง
                  </Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ทางสำรองตอนบัญชีแจ้งเตือนส่งไม่ออก ──────────────────────────
          บัญชีแจ้งเตือนเป็นแพ็กเกจฟรี พอโควตาหมดกลางเดือนทุกอย่างก็เงียบหมด
          ทางสำรอง = ส่งจาก "บัญชีร้าน" (โควตาเยอะกว่ามาก) เข้าห้องของบัญชีร้านเอง */}
      <div className="mt-3 rounded-xl border border-slate-200/70 bg-white p-4">
        <p className="text-[13px] font-bold text-slate-700">4 · ทางสำรอง (กันไลน์เงียบ)</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
          บัญชีแจ้งเตือนส่งไม่ออกเมื่อไหร่ (โควตาหมด · ถูกเอาออกจากกลุ่ม · token เสีย) ระบบจะส่งซ้ำจาก
          <b className="text-slate-700"> บัญชีร้าน {shopAcc?.basicId ?? ""}</b> ไปห้องนี้แทนให้เอง
        </p>
        <p className="mt-1 text-[12px] font-semibold leading-relaxed" style={{ color: alert.hasFallback ? "var(--dk-mint-ink)" : "var(--dk-coral-ink)" }}>
          {alert.hasFallback
            ? `✅ มีทางสำรองแล้ว${alert.shopTo ? "" : " (ใช้ค่าที่ตั้งไว้ใน Netlify)"}`
            : "⚠️ ยังไม่มีทางสำรอง — บัญชีแจ้งเตือนส่งไม่ออกเมื่อไหร่ ไม่มีใครได้ข้อความเลย"}
        </p>
        {alert.shopTo && <p className="mt-1 break-all font-mono text-[11.5px] text-slate-700">{alert.shopTo}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={shopTo}
            onChange={(e) => setShopTo(e.target.value)}
            placeholder="เลขห้องที่บัญชีร้านได้ยิน (ขึ้นต้น C หรือ U)"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none"
            autoComplete="off"
          />
          <Btn
            tone="navy"
            small
            disabled={!shopTo.trim() || !!busy}
            onClick={() => {
              void post({ action: "save", shopTo }, "shopto");
              setShopTo("");
            }}
          >
            {busy === "shopto" ? "กำลังบันทึก…" : "บันทึกทางสำรอง"}
          </Btn>
          {alert.shopTo && (
            <Btn small disabled={!!busy} onClick={() => void post({ action: "save", shopTo: "" }, "unshopto")}>
              ล้าง
            </Btn>
          )}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
          ⚠️ เลขห้องผูกกับบัญชี — ต้องเป็นห้องที่ <b>บัญชีร้าน</b> อยู่ด้วย (เชิญบัญชีร้านเข้ากลุ่มแอดมิน
          หรือใช้แชทเดี่ยวของเจ้าของร้านกับบัญชีร้านก็ได้) เลขของบัญชีแจ้งเตือนใช้ตรงนี้ไม่ได้
        </p>
      </div>

      <ListHead title="ห้องที่ระบบได้ยินล่าสุด" note="ใหม่สุดขึ้นก่อน · เก็บไว้ 8 ห้อง" />

      {sources.length === 0 ? (
        <Empty
          title="ยังไม่มีเลขห้อง"
          body="ทำข้อ 2 ให้ครบแล้วพิมพ์ในกลุ่ม 1 ครั้ง — หน้านี้เช็คให้เองทุก 10 วินาที ไม่ต้องรีเฟรช"
        />
      ) : (
        <Rows>
          {sources.map((r) => {
            const heard = r.dest ? accById.get(r.dest) : undefined;
            // ส่งเข้าห้องนี้ได้จริงก็ต่อเมื่อ "บัญชีที่ได้ยิน" คือบัญชีเดียวกับที่จะใช้ส่ง
            const usable = !r.dest || !sender || r.dest === sender.userId;
            const asMain = alert.to === r.id;
            const asMoney = alert.adminTo === r.id;
            const picked = asMain || asMoney;
            return (
              <Row key={r.id} tone={picked ? "var(--dk-mint)" : r.type === "group" ? "var(--dk-sky-300)" : "var(--dk-quiet)"} done={!usable}>
                <RowMain
                  name={r.name || r.id}
                  tags={
                    <>
                      <Tag tone={r.type === "group" ? "mint" : "quiet"}>{TYPE_LABEL[r.type]}</Tag>
                      {asMain && <Tag tone="solid">กลุ่มทั่วไป</Tag>}
                      {asMoney && <Tag tone="solid">กลุ่มเรื่องเงิน</Tag>}
                      {heard && <Tag tone="quiet">{heard.kind === "alert" ? "บัญชีแจ้งเตือนได้ยิน" : "บัญชีร้านได้ยิน"}</Tag>}
                      {!usable && <Tag tone="quiet">คนละบัญชีกับที่ใช้ส่ง</Tag>}
                      {!r.verified && <Tag tone="quiet">ยังไม่ยืนยันลายเซ็น</Tag>}
                    </>
                  }
                  meta={
                    <>
                      {r.name && <span className="id">{r.id}</span>}
                      <span>ได้ยินเมื่อ {thTime(r.at)}</span>
                    </>
                  }
                />
                <RowSide>
                  <CopyChip label="คัดลอกเลขห้อง" text={() => r.id} />
                  {alert.to !== r.id && (
                    <Btn
                      tone="navy"
                      small
                      disabled={!!busy}
                      onClick={() => void post({ action: "save", to: r.id }, `pick-${r.id}`)}
                      title="ออเดอร์สั่งจำนวนมาก · ของใกล้หมด · ใบสมัครตัวแทน"
                    >
                      {busy === `pick-${r.id}` ? "กำลังตั้ง…" : "ตั้งเป็นกลุ่มทั่วไป"}
                    </Btn>
                  )}
                  {alert.adminTo !== r.id && (
                    <Btn
                      small
                      disabled={!!busy}
                      onClick={() => void post({ action: "save", adminTo: r.id }, `pickm-${r.id}`)}
                      title="เคลม · ยอดค้างเก็บงวด 2"
                    >
                      {busy === `pickm-${r.id}` ? "กำลังตั้ง…" : "ตั้งเป็นกลุ่มเรื่องเงิน"}
                    </Btn>
                  )}
                </RowSide>
              </Row>
            );
          })}
        </Rows>
      )}

      {sources.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Btn small disabled={!!busy} onClick={() => void clearAll()} title="ตั้งปลายทางเสร็จแล้วล้างรายการทิ้งได้">
            {busy === "clear" ? "กำลังล้าง…" : "🧹 ล้างรายการ"}
          </Btn>
        </div>
      )}
    </PageShell>
  );
}

export default function LineGroupsPage() {
  return (
    <RequirePerm perm="settings.manage">
      <LineGroupsInner />
    </RequirePerm>
  );
}
