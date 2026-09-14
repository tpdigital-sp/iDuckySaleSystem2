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
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/line-sources", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as LineSourcesResponse | null;
      if (j) setData(j);
    } catch {
      setData((v) => v ?? { sources: [], alert: { hasToken: false, to: "", adminTo: "", ready: false }, accounts: [], envTo: "" });
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
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; reason?: string; via?: string };
      if (r.ok) {
        setMsg({
          tone: "ok",
          text:
            body.action === "test"
              ? `ส่งข้อความทดสอบแล้ว (จาก${j.via === "alert" ? "บัญชีแจ้งเตือน" : "บัญชีร้าน"}) — ไปดูในกลุ่มได้เลย`
              : "บันทึกแล้ว",
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

  const { sources, alert, accounts } = data;
  const alertAcc = accounts.find((a) => a.kind === "alert");
  const shopAcc = accounts.find((a) => a.kind === "shop");
  const accById = new Map(accounts.map((a) => [a.userId, a]));
  /** บัญชีที่จะใช้ส่งจริงตอนนี้ — เลขห้องต้องเป็นของบัญชีนี้เท่านั้น */
  const sender: LineAccount | undefined = alert.ready ? alertAcc : shopAcc;
  const groups = sources.filter((s) => s.type === "group");

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

      {/* ── ใครเป็นคนส่ง ── */}
      <div className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4">
        <p className="text-[13px] font-bold text-slate-700">1 · บัญชี LINE ที่ใช้ส่งแจ้งเตือน</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
          ตอนนี้ส่งจาก{" "}
          <b className="text-slate-700">
            {sender ? `${sender.name || "(ไม่ทราบชื่อ)"} ${sender.basicId}` : "ยังไม่มีบัญชีที่ใช้ได้"}
          </b>
          {!alert.ready && " — ยังเป็นบัญชีร้านที่ลูกค้าทักอยู่ ถ้าอยากแยกให้วาง token ด้านล่าง"}
        </p>

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
            <Btn small disabled={!!busy} onClick={() => void post({ action: "save", token: "" }, "untoken")} title="กลับไปใช้บัญชีร้านตามเดิม">
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
        </p>
      </div>

      {/* ── ปลายทางที่ใช้อยู่ ── */}
      <div className="mt-3 rounded-xl border border-slate-200/70 bg-white p-4">
        <p className="text-[13px] font-bold text-slate-700">3 · ห้องปลายทาง</p>
        {alert.to ? (
          <p className="mt-1 font-mono text-[12.5px] break-all text-slate-700">
            {alert.to}
            <span className="ml-2 font-sans text-[12px] text-slate-500">{alert.to.startsWith("C") ? "(ไลน์กลุ่ม)" : "(แชทเดี่ยว)"}</span>
          </p>
        ) : (
          <p className="mt-1 text-[12.5px] text-slate-500">
            ยังไม่ได้เลือก — กดปุ่ม &ldquo;ใช้ห้องนี้&rdquo; ที่รายการข้างล่าง
            {data.envTo && ` (ตอนนี้ยังส่งไปปลายทางเดิมที่ตั้งไว้ใน Netlify ซึ่งขึ้นต้นด้วย ${data.envTo})`}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Btn tone="navy" small disabled={!!busy} onClick={() => void post({ action: "test" }, "test")}>
            {busy === "test" ? "กำลังส่ง…" : "🔔 ส่งข้อความทดสอบ"}
          </Btn>
        </div>
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
            const picked = alert.to === r.id;
            return (
              <Row key={r.id} tone={picked ? "var(--dk-mint)" : r.type === "group" ? "var(--dk-sky-300)" : "var(--dk-quiet)"} done={!usable}>
                <RowMain
                  name={r.name || r.id}
                  tags={
                    <>
                      <Tag tone={r.type === "group" ? "mint" : "quiet"}>{TYPE_LABEL[r.type]}</Tag>
                      {picked && <Tag tone="solid">ใช้อยู่</Tag>}
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
                  {!picked && (
                    <Btn
                      tone="navy"
                      small
                      disabled={!!busy}
                      onClick={() => void post({ action: "save", to: r.id }, `pick-${r.id}`)}
                      title="ตั้งห้องนี้เป็นปลายทางของข้อความแจ้งเตือน"
                    >
                      {busy === `pick-${r.id}` ? "กำลังตั้ง…" : "ใช้ห้องนี้"}
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
